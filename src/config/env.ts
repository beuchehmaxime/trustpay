import 'dotenv/config';

/**
 * Configuration, read once and validated at boot.
 *
 * Model ids are read from the environment rather than hardcoded for one
 * reason: the Meta docs list muse-spark-1.3, 1.2 and 1.1, and at least one
 * client still defaults to 1.1. An unpinned id means the demo can change
 * under us mid-build, which is the kind of thing discovered while recording.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required but not set`);
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function numeric(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: numeric('PORT', 4100),

  meta: {
    apiKey: optional('MODEL_API_KEY'),
    baseUrl: optional('META_API_BASE_URL', 'https://api.meta.ai/v1'),
    sparkModel: optional('MUSE_SPARK_MODEL', 'muse-spark-1.3'),
    wonderModel: optional('MUSE_WONDER_MODEL', 'muse-wonder-1.0'),
    // Left blank deliberately rather than guessed - these two are not
    // confirmed in the quickstart and a wrong id fails at the worst moment.
    voiceModel: optional('MUSE_VOICE_MODEL'),
    samModel: optional('SAM_MODEL'),
  },

  openWeights: {
    baseUrl: optional('OPEN_WEIGHTS_BASE_URL'),
    apiKey: optional('OPEN_WEIGHTS_API_KEY'),
    // The meta-models/ prefix is part of the id on Baseten and does not
    // resolve without it.
    model: optional('OPEN_WEIGHTS_MODEL', 'meta-models/muse-spark-open-1026'),
  },

  /**
   * When to hand a case to a human instead of showing a recommendation.
   * Cautious on purpose: a model mistake should cost an operator twenty
   * minutes, not cost a user their money.
   */
  escalation: {
    belowConfidence: numeric('ESCALATE_BELOW_CONFIDENCE', 0.75),
    aboveAmountXaf: numeric('ESCALATE_ABOVE_AMOUNT_XAF', 250_000),
  },

  bizik: {
    baseUrl: optional('BIZIK_API_BASE_URL'),
    serviceToken: optional('BIZIK_SERVICE_TOKEN'),
  },
} as const;

/** What is missing before the pipeline can actually run end to end. */
export function missingConfig(): string[] {
  const gaps: string[] = [];
  if (!config.meta.apiKey) gaps.push('MODEL_API_KEY');
  if (!config.meta.voiceModel) gaps.push('MUSE_VOICE_MODEL');
  if (!config.meta.samModel) gaps.push('SAM_MODEL');
  return gaps;
}

export { required };
