import { config } from '../config/env';
import { AppError } from '../lib/errors';
import { containsPii } from '../middleware/pii-scrubber';

/**
 * The one place TrustPay talks to the outside world.
 *
 * Every model call goes through here, and that is the point rather than a
 * convenience. The PII guard lives in this function, so "nothing unredacted
 * leaves this process" is enforced at the single door instead of being
 * remembered at each of a dozen call sites. A call site that forgets to scrub
 * gets refused; there is no path around it.
 *
 * The Meta Model API is OpenAI-compatible, so this is a thin fetch rather than
 * a dependency. Thin on purpose: the payloads here carry dispute evidence, and
 * a transport we can read end to end is worth more than one that saves twenty
 * lines.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  /** Pinned by the caller. See config for why an unpinned id is a hazard. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON object back. Used for the structured verdict. */
  json?: boolean;
  /**
   * NOTE: there is no reasoning-effort control on this endpoint.
   *
   * Muse Spark is a reasoning model - it spends tokens thinking before it
   * writes anything, and those come out of `maxTokens`. The obvious lever,
   * `reasoning: { effort }`, belongs to the **Responses API** (`/v1/responses`)
   * and chat/completions rejects it outright: `unknown parameter 'reasoning'`,
   * HTTP 400. So effort is whatever the model chooses here, and the only
   * budget control is `maxTokens` plus a shorter prompt.
   *
   * Worth revisiting if the credit burn bites: moving the adjudication call to
   * the Responses API would buy effort control, and SAM already uses that
   * endpoint, so the transport is needed either way.
   */
  /** Abort rather than hang a mediator's screen on a slow model. */
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  /** Present when the API reports it - used to watch the credit burn. */
  usage?: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number };
}

/** Thrown when the outbound guard refuses, so it is never confused with an API error. */
export class PiiLeakError extends AppError {
  constructor(where: string) {
    super(
      500,
      'Q-500-PII',
      `Refusing to send: ${where} still contains identifying data after redaction.`,
    );
  }
}

function assertConfigured(): void {
  if (!config.meta.apiKey) {
    throw new AppError(
      503,
      'Q-503-NO-KEY',
      'MODEL_API_KEY is not set, so no model call can be made.',
    );
  }
}

/**
 * Check every outgoing message before it leaves.
 *
 * Deliberately checks the FINAL payload rather than trusting that the caller
 * scrubbed. Patterns are only as good as the day they were written, and the
 * cost of being wrong here is a published phone number, not a failed request.
 */
function assertScrubbed(messages: ChatMessage[]): void {
  messages.forEach((message, index) => {
    if (containsPii(message.content)) throw new PiiLeakError(`message[${index}]`);
  });
}

/**
 * Send a chat completion to a Meta model.
 *
 * Never retries on its own. A dispute recommendation is not idempotent in any
 * way that matters to a user, and a silent retry doubles the credit spend on a
 * $150 budget - the caller decides whether a second attempt is worth it.
 */
export async function complete(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<CompletionResult> {
  // Scrub check FIRST, before the key check. If config came first, a call
  // site that forgets to scrub would look fine in any environment without a
  // key - which is every developer machine - and the bug would surface only
  // once a real key was added, at which point it leaks instead of failing.
  assertScrubbed(messages);
  assertConfigured();

  const model = options.model ?? config.meta.sparkModel;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

  try {
    const response = await fetch(`${config.meta.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.meta.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        // Default generous. Muse Spark is a reasoning model and the reasoning
        // comes out of this budget BEFORE any answer is written - too small a
        // ceiling returns content: null rather than a short answer, which
        // looks like a broken integration rather than a budget problem.
        max_tokens: options.maxTokens ?? 4096,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The body can echo the request, which means it can echo evidence. Read
      // the status and a short reason; never log the whole thing.
      const detail = await response.text().catch(() => '');
      throw new AppError(
        response.status === 429 ? 429 : 502,
        'Q-502-MODEL',
        `Model call failed (${response.status}).`,
        { status: response.status, hint: detail.slice(0, 200) },
      );
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };

    const choice = body.choices?.[0];
    const text = choice?.message?.content;
    const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens;

    if (!text) {
      // The failure that wastes a day if it is not named. A reasoning model
      // that exhausts its budget while thinking returns HTTP 200 with
      // content: null and finish_reason: "length" - not an error, just
      // nothing - and "no content" alone tells you none of that.
      if (choice?.finish_reason === 'length') {
        throw new AppError(
          502,
          'Q-502-MODEL-BUDGET',
          `The model used its whole token budget reasoning (${reasoningTokens ?? '?'} reasoning tokens) ` +
            'and had none left to answer. Raise maxTokens or lower reasoningEffort.',
          { reasoningTokens, finishReason: choice.finish_reason },
        );
      }
      throw new AppError(502, 'Q-502-MODEL', 'Model returned no content.', {
        finishReason: choice?.finish_reason,
      });
    }

    return {
      text,
      model,
      usage: {
        promptTokens: body.usage?.prompt_tokens,
        completionTokens: body.usage?.completion_tokens,
        reasoningTokens,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as Error).name === 'AbortError') {
      // Surfaced as its own code so the escalation policy can treat a timeout
      // as "hand this to a human", which is the only safe reading of it.
      throw new AppError(504, 'Q-504-MODEL-TIMEOUT', 'The model did not answer in time.');
    }
    throw new AppError(502, 'Q-502-MODEL', `Model call failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Prove the key and the base URL work, without spending meaningfully.
 *
 * Worth its own function because the failure it catches is the one that wastes
 * a day: a key that is present but wrong, or a model id that does not exist,
 * both look like "nothing happens" from inside the pipeline.
 */
export async function smokeTest(): Promise<{ ok: boolean; model: string; reply?: string; reasoningTokens?: number; error?: string }> {
  const model = config.meta.sparkModel;
  try {
    const result = await complete(
      [
        { role: 'system', content: 'Reply with exactly one word.' },
        { role: 'user', content: 'Say READY' },
      ],
      // Not 8. Reasoning tokens are spent before any answer is written, so
      // a tight ceiling returns content: null rather than a short answer.
      // One word cost 324 reasoning tokens when this was first measured.
      { maxTokens: 512, temperature: 0, timeoutMs: 30_000 },
    );
    return { ok: true, model, reply: result.text.trim(), reasoningTokens: result.usage?.reasoningTokens };
  } catch (error) {
    return { ok: false, model, error: (error as Error).message };
  }
}
