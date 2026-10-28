import { config } from '../config/env';

/**
 * Client for the KYC image analyzer - the service that actually looks at the
 * documents (OpenCV YuNet face detection + SFace face matching).
 *
 * The contract that matters: this returns `null` when no analysis happened, and
 * the caller must then record that NOTHING was checked. It must never fall back
 * to a plausible number. The stand-in it replaces derived scores from the ID
 * number, so a photo of a laptop scored 95/100 and the console presented that
 * to an operator as a verdict.
 */

export interface AnalyzerCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

/** Triage suggestion for the reviewer. Advisory - it decides nothing. */
export interface AnalyzerRecommendation {
  verdict: 'approve' | 'reject' | 'review';
  confidence: 'high' | 'low';
  reason: string;
  summary: string;
}

export interface AnalyzerResult {
  engine: string;
  recommendation: AnalyzerRecommendation | null;
  /** Readability/plausibility of the ID image. Not forgery detection. */
  documentQuality: number | null;
  /** Real biometric similarity between the ID portrait and the selfie. */
  faceMatch: number | null;
  /** Basic passive selfie checks. NOT certified liveness. */
  selfieCheck: number | null;
  checks: AnalyzerCheck[];
}

/** Is an analyzer configured at all? */
export function analyzerConfigured(): boolean {
  return !!config.kyc.analyzerUrl;
}

/**
 * Analyse one submission. Returns null when the service is unreachable, times
 * out, or refuses - the submission is then recorded as un-analysed.
 */
export async function analyseDocuments(input: {
  idFront: string;
  selfie: string;
  idBack?: string;
}): Promise<AnalyzerResult | null> {
  const baseUrl = config.kyc.analyzerUrl;
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.kyc.analyzerTimeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_front: input.idFront,
        selfie: input.selfie,
        ...(input.idBack ? { id_back: input.idBack } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[kyc-analyzer] ${response.status} - ${detail.slice(0, 200)}`);
      return null;
    }
    const payload = (await response.json()) as AnalyzerResult & { analyzed?: boolean };
    if (!payload.analyzed) return null;
    return {
      engine: payload.engine,
      documentQuality: payload.documentQuality ?? null,
      faceMatch: payload.faceMatch ?? null,
      selfieCheck: payload.selfieCheck ?? null,
      checks: Array.isArray(payload.checks) ? payload.checks : [],
      recommendation: payload.recommendation ?? null,
    };
  } catch (error) {
    // Unreachable, timed out, bad JSON - all mean "not analysed", never "fine".
    console.error('[kyc-analyzer] analysis failed:', (error as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
