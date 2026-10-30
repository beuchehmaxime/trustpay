import { config } from '../config/env';
import { AppError } from '../lib/errors';

/**
 * Voice notes, transcribed by Muse Voice.
 *
 * This is the step that makes the rest of the product reachable for the people
 * it is actually for. Trade here happens in voice notes, in Pidgin and French
 * and English inside one sentence, and a text box asks someone to translate
 * their own complaint into a second language before they can report it.
 *
 * What the endpoint actually wants, learned by asking it rather than by
 * guessing - each of these was a 400 before it was a line of code:
 *
 *   - two multipart parts, named exactly `request` and `audio`. Not `file`,
 *     not `model`.
 *   - `request` is JSON and must carry `audioEncoding`, which is absent from
 *     the obvious reading of the docs.
 *   - the audio must be WAV, mono, signed 16-bit little-endian, at 16000 or
 *     24000 Hz. Nothing else is accepted, and a 22050 Hz file - which is what
 *     a default recorder hands you - is refused outright.
 *
 * That last constraint is why the browser encodes WAV itself rather than
 * sending what MediaRecorder produces. Transcoding Opus server-side would mean
 * shelling out to ffmpeg on every voice note; asking the Web Audio API for
 * 16 kHz mono gives us exactly the required format for free.
 */

/** 16 kHz mono s16le: one minute is about 1.9 MB raw, 2.6 MB as base64. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** Longest clip worth sending. Past this it is a recording, not a message. */
export const MAX_AUDIO_SECONDS = 120;

const WAV_MAGIC = 'RIFF';

export interface Transcription {
  text: string;
  durationMs?: number;
}

/**
 * Check the bytes really are the WAV we promised before spending a call.
 *
 * A mislabelled upload comes back as an opaque 400 from upstream, which looks
 * like an outage from inside this process. Failing here names the actual
 * problem.
 */
function assertWav(audio: Buffer): void {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== WAV_MAGIC) {
    throw new AppError(400, 'Q-400-AUDIO', 'That recording is not in a format we can read.');
  }
  const channels = audio.readUInt16LE(22);
  const sampleRate = audio.readUInt32LE(24);
  const bitsPerSample = audio.readUInt16LE(34);
  if (channels !== 1 || bitsPerSample !== 16 || (sampleRate !== 16000 && sampleRate !== 24000)) {
    throw new AppError(
      400,
      'Q-400-AUDIO',
      'That recording is not in a format we can read. It must be mono 16-bit at 16 kHz.',
    );
  }
}

export const AssistantVoice = {
  available(): boolean {
    return !!config.ai.anthropicApiKey && !!config.ai.metaVoiceModel;
  },

  /**
   * Transcribe one clip.
   *
   * Never retries. A user who said something once has not said it twice, and a
   * silent second attempt doubles the spend on a clip that may simply have been
   * silence.
   */
  async transcribe(audio: Buffer): Promise<Transcription> {
    if (!this.available()) {
      throw new AppError(503, 'Q-503-NO-VOICE', 'Voice messages are not available right now.');
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new AppError(413, 'Q-413-AUDIO', 'That recording is too long. Keep it under two minutes.');
    }
    assertWav(audio);

    const form = new FormData();
    form.append(
      'request',
      new Blob([JSON.stringify({ model: config.ai.metaVoiceModel, audioEncoding: 'WAV' })], {
        type: 'application/json',
      }),
    );
    form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'voice.wav');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(`${config.ai.metaApiBaseUrl}/asr/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.ai.anthropicApiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        // The body echoes the request, which here means it can echo what
        // someone said. Keep the status and a short reason; never the whole
        // thing, and never in a log.
        const detail = await response.text().catch(() => '');
        console.error('[assistant][voice] transcription failed', response.status, detail.slice(0, 200));
        throw new AppError(502, 'Q-502-VOICE', 'We could not make out that recording. Try again, or type it.');
      }

      const body = (await response.json()) as { transcript?: string; audioDurationMs?: number };
      const text = body.transcript?.trim();
      if (!text) {
        // Silence and a failed transcription are different problems with the
        // same shape, and only one of them is the user's to fix.
        throw new AppError(
          422,
          'Q-422-VOICE',
          'That recording came back empty. Check your microphone, or type it instead.',
        );
      }
      return { text, durationMs: body.audioDurationMs };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new AppError(504, 'Q-504-VOICE', 'That took too long to transcribe. Try a shorter clip.');
      }
      console.error('[assistant][voice] transcription failed', (error as Error).message);
      throw new AppError(502, 'Q-502-VOICE', 'We could not make out that recording. Try again, or type it.');
    } finally {
      clearTimeout(timeout);
    }
  },
};
