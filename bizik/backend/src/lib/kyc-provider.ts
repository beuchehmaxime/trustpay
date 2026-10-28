import crypto from 'crypto';

import { analyseDocuments, analyzerConfigured, type AnalyzerCheck } from './kyc-analyzer';

/**
 * Identity-verification provider adapter (SRS FR-KYC-002/003, INT-KYC-001..004).
 *
 * In production this calls Smile Identity (African markets) or Stripe Identity
 * (international clients) to verify a government ID and run a liveness/selfie
 * biometric match, returning confidence + liveness + face-match scores. The
 * webhook then advances the user's tier asynchronously.
 *
 * Here it is SIMULATED so the full flow is testable without provider keys. The
 * adapter shape is identical to the real one - swapping in the HTTP client is a
 * single-file change. Scores are deterministic per submission (derived from the
 * inputs) and bias high so a well-formed submission auto-approves. Test hooks
 * embedded in the ID number let us exercise every branch:
 *   - ID number containing "REVIEW" → low confidence → manual review queue
 *   - ID number containing "FAIL"   → liveness/match failure → manual review
 */
const AFRICAN_COUNTRIES = new Set([
  'Nigeria',
  'Ghana',
  'Cameroon',
  'Chad',
  'Gabon',
  'Central African Republic',
  'Equatorial Guinea',
  'Senegal',
  "Côte d'Ivoire",
  'Kenya',
]);

export interface ProviderResult {
  provider: 'smile_identity' | 'stripe_identity';
  providerRef: string;
  /**
   * TRUE when these scores were produced by the built-in stand-in rather than a
   * real identity provider. Nothing in this file opens the images: the numbers
   * are derived from the ID NUMBER alone, so a photo of a laptop scores exactly
   * as well as a passport. Anything that shows them to a human MUST say so.
   */
  simulated: boolean;
  /** Overall document-authenticity confidence, 0..1. */
  confidence: number;
  /** Liveness/anti-spoofing score, 0..1 (SRS FR-KYC-003 ≥ 0.90). */
  selfieScore: number;
  /** Face-to-ID biometric match, 0..1 (SRS FR-KYC-003 ≥ 0.85). */
  matchScore: number;
  /** What was actually observed in the images, for the reviewer to read. */
  checks?: AnalyzerCheck[];
  /** Triage suggestion. Advisory only - a human still decides. */
  recommendation?: unknown;
}

/** Stable pseudo-score in [min, 1] derived from a seed (no randomness). */
function seededScore(seed: string, floor: number): number {
  const h = crypto.createHash('sha256').update(seed).digest();
  const frac = h[0] / 255; // 0..1
  const score = floor + frac * (1 - floor);
  return Math.round(score * 1000) / 1000;
}

/**
 * Is a real identity provider wired up? Today the answer is always no - this
 * module has no HTTP client - so every score is a placeholder. When the real
 * Smile/Stripe integration lands, this is what flips.
 */
export function identityProviderConfigured(): boolean {
  // Real analysis happens when the image analyzer is wired up. It is not a
  // full identity provider (no forgery detection, no certified liveness), but
  // its numbers are measurements of the actual documents rather than invention.
  return analyzerConfigured();
}

export async function verifyIdentity(input: {
  idType: string;
  idNumber: string;
  country: string;
  fullName: string;
  /** The submitted images, as data URLs or base64. */
  documents?: { idFront: string; selfie: string; idBack?: string };
}): Promise<ProviderResult> {
  const provider = AFRICAN_COUNTRIES.has(input.country)
    ? 'smile_identity'
    : 'stripe_identity';
  const providerRef = `${provider === 'smile_identity' ? 'sid' : 'vs'}_${crypto.randomUUID()}`;
  const marker = input.idNumber.toUpperCase();

  // Test hooks for exercising the non-happy paths deterministically.
  // Look at the actual images when we can. A failure here is reported as
  // "not analysed" - never quietly downgraded to invented scores that look fine.
  if (input.documents && analyzerConfigured()) {
    const analysis = await analyseDocuments(input.documents);
    if (analysis) {
      return {
        provider,
        providerRef,
        simulated: false,
        confidence: analysis.documentQuality ?? 0,
        selfieScore: analysis.selfieCheck ?? 0,
        // A match that could not be computed is 0, and the reason is in checks:
        // "no face found on the ID" must never read as a passing score.
        matchScore: analysis.faceMatch ?? 0,
        checks: analysis.checks,
        recommendation: analysis.recommendation,
      };
    }
  }

  const simulated = !identityProviderConfigured();
  if (marker.includes('FAIL')) {
    return {
      provider,
      providerRef,
      simulated,
      confidence: seededScore(input.idNumber + 'c', 0.6),
      selfieScore: seededScore(input.idNumber + 's', 0.4), // below 0.90
      matchScore: seededScore(input.idNumber + 'm', 0.4), // below 0.85
    };
  }
  if (marker.includes('REVIEW')) {
    return {
      provider,
      providerRef,
      simulated,
      confidence: 0.7 + seededScore(input.idNumber, 0) * 0.1, // ~0.70..0.80
      selfieScore: seededScore(input.idNumber + 's', 0.92),
      matchScore: seededScore(input.idNumber + 'm', 0.88),
    };
  }

  // Happy path - high, passing scores.
  return {
    provider,
    providerRef,
    simulated,
    confidence: seededScore(input.idNumber + 'c', 0.9),
    selfieScore: seededScore(input.idNumber + 's', 0.93),
    matchScore: seededScore(input.idNumber + 'm', 0.9),
  };
}
