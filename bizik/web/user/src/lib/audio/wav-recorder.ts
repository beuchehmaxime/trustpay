/**
 * Record the microphone as WAV, mono, 16-bit, 16 kHz.
 *
 * That exact format is not a preference, it is what the transcription endpoint
 * accepts: mono s16le at 16000 or 24000 Hz and nothing else. A 22050 Hz file,
 * which is what a default recorder hands you, is refused outright.
 *
 * So this does not use MediaRecorder. MediaRecorder gives WebM/Opus, which
 * would have to be transcoded on the server - ffmpeg in the image, a shell-out
 * per voice note, a temporary file holding someone's words on disk. Asking the
 * Web Audio API for a 16 kHz context and writing the WAV header by hand gives
 * the required bytes directly, and the audio never touches a disk anywhere.
 *
 * The samples stay in memory and are dropped when the recorder stops.
 */

/** Past this it is a recording, not a message, and the endpoint will refuse it. */
export const MAX_RECORDING_SECONDS = 120;

const TARGET_SAMPLE_RATE = 16000;

export interface Recorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

/** True when this browser can record at all. HTTPS or localhost only. */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (typeof AudioContext !== 'undefined' ||
      typeof (window as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined')
  );
}

/**
 * Write the 44-byte WAV header the format requires, then the samples.
 *
 * Hand-written because the whole point is to control these exact fields:
 * channels, sample rate and bits per sample are the three the endpoint checks.
 */
function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // PCM, uncompressed
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Float samples in -1..1 to signed 16-bit, clamped rather than wrapped. */
function toInt16(chunks: Float32Array[], total: number): Int16Array {
  const samples = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      // Clamping matters: a sample above 1.0 would wrap to a large negative
      // number and arrive as a click loud enough to swamp the word under it.
      const clamped = Math.max(-1, Math.min(1, chunk[index]));
      samples[offset + index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    offset += chunk.length;
  }
  return samples;
}

/**
 * Start recording. Resolves once the microphone is actually live, so the UI
 * does not show "recording" over a permission prompt the user has not answered.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      // A voice note is one person talking into a phone in a noisy place.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioContextClass =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);

  // Asking for the target rate here is what makes the rest free: the browser
  // resamples, so no conversion is needed later and nothing has to be guessed
  // about the hardware's native rate.
  const context = new AudioContextClass({ sampleRate: TARGET_SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated in favour of AudioWorklet, which needs a
  // separate module file served from the same origin. For a short voice note
  // on a page that already loaded, the simpler path is the right trade.
  const processor = context.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];
  let totalSamples = 0;
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    totalSamples += input.length;
  };

  source.connect(processor);
  // Connected to the destination because some browsers will not run a
  // ScriptProcessor that goes nowhere. The gain is zero, so nothing is heard.
  const silence = context.createGain();
  silence.gain.value = 0;
  processor.connect(silence);
  silence.connect(context.destination);

  const teardown = () => {
    stopped = true;
    processor.disconnect();
    silence.disconnect();
    source.disconnect();
    // Releasing the track is what turns off the browser's recording indicator.
    // Leaving it on would tell the user we are still listening when we are not.
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  return {
    async stop() {
      if (stopped) throw new Error('already stopped');
      teardown();
      const sampleRate = context.sampleRate || TARGET_SAMPLE_RATE;
      return encodeWav(toInt16(chunks, totalSamples), sampleRate);
    },
    cancel() {
      if (stopped) return;
      teardown();
      chunks.length = 0;
    },
  };
}

/** Blob to base64, without the data-URL prefix the API does not want. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // In chunks: spreading a two-megabyte array into String.fromCharCode in one
  // call overflows the argument limit and throws.
  const CHUNK = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}
