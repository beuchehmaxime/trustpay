import { DisputeReason, DisputeRulingType } from '@prisma/client';

import { resolveParties } from './contract-flow';
import { prisma } from './prisma';

/**
 * Simulated dispute-resolution "AI". A real deployment would call an LLM /
 * scoring model over the case file; here a transparent, deterministic heuristic
 * stands in - analysing the dispute reason, the evidence each side filed and
 * how engaged the parties are - and produces a recommended ruling, a confidence
 * score and a plain-language rationale. The output is persisted once per dispute
 * as an {@link AiRecommendation} so mediators and parties see a stable analysis.
 */

const REASON_LABEL: Record<DisputeReason, string> = {
  NON_DELIVERY: 'non-delivery',
  INCOMPLETE_WORK: 'incomplete work',
  QUALITY_BELOW_SPEC: 'quality below spec',
  SCOPE_CREEP: 'scope creep',
  COMMUNICATION_BREAKDOWN: 'communication breakdown',
  OTHER: 'the stated reason',
};

/** Baseline payee (freelancer) share by reason, and a short reasoning note. */
const REASON_PROFILE: Record<DisputeReason, { lean: number; note: string }> = {
  NON_DELIVERY: { lean: 8, note: 'the client reports nothing was delivered' },
  INCOMPLETE_WORK: { lean: 45, note: 'the work appears only partially delivered' },
  QUALITY_BELOW_SPEC: { lean: 55, note: 'the delivery reportedly fell short of the agreed quality' },
  SCOPE_CREEP: { lean: 72, note: 'the freelancer appears to have delivered the agreed scope' },
  COMMUNICATION_BREAKDOWN: { lean: 50, note: 'responsibility looks shared between both sides' },
  OTHER: { lean: 50, note: 'the claim is finely balanced on the available facts' },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface AiInput {
  reason: DisputeReason;
  filedById: string;
  payerId: string | null;
  payeeId: string | null;
  evidence: { submittedById: string }[];
  messageCount: number;
  responseCount: number;
}

export interface AiRecommendationResult {
  recommendation: DisputeRulingType;
  freelancerPct: number;
  confidence: number;
  rationale: string;
}

/** Turn a payee-share % into a discrete ruling. */
function rulingFor(pct: number): DisputeRulingType {
  if (pct >= 80) return 'FULL_RELEASE';
  if (pct <= 20) return 'FULL_REFUND';
  return 'PARTIAL_SPLIT';
}

/** Analyse a dispute and produce a recommended resolution. */
export function buildRecommendation(input: AiInput): AiRecommendationResult {
  const profile = REASON_PROFILE[input.reason];
  const payeeEvidence = input.evidence.filter((item) => item.submittedById === input.payeeId).length;
  const payerEvidence = input.evidence.filter((item) => item.submittedById === input.payerId).length;

  let share = profile.lean;
  // Evidence weight - whoever documents their side more moves the needle (±8 each, capped ±24).
  const evidenceSwing = clamp((payeeEvidence - payerEvidence) * 8, -24, 24);
  share += evidenceSwing;
  // The party who filed is the one contesting; a small nudge toward their ask.
  if (input.filedById === input.payerId) share -= 5;
  else if (input.filedById === input.payeeId) share += 5;
  share = clamp(Math.round(share), 0, 100);

  const recommendation = rulingFor(share);
  const freelancerPct = recommendation === 'FULL_RELEASE' ? 100 : recommendation === 'FULL_REFUND' ? 0 : share;

  // Confidence grows with a clear reason lean and with evidence on the record.
  let confidence = 0.6;
  if (Math.abs(profile.lean - 50) >= 25) confidence += 0.1;
  if (payeeEvidence + payerEvidence >= 2) confidence += 0.1;
  else if (payeeEvidence + payerEvidence === 0) confidence -= 0.08;
  if (input.messageCount + input.responseCount >= 3) confidence += 0.04;
  confidence = Math.round(clamp(confidence, 0.5, 0.95) * 1000) / 1000;

  const evidenceNote =
    payeeEvidence === 0 && payerEvidence === 0
      ? 'Neither side has filed supporting evidence yet.'
      : payeeEvidence > payerEvidence
        ? 'The freelancer has documented their side more thoroughly.'
        : payerEvidence > payeeEvidence
          ? 'The client has documented their side more thoroughly.'
          : 'Both sides have filed comparable evidence.';

  const reasonLabel = REASON_LABEL[input.reason];
  const rationale =
    recommendation === 'FULL_REFUND'
      ? `On a claim of ${reasonLabel}, ${profile.note}. ${evidenceNote} Recommending a full refund to the client.`
      : recommendation === 'FULL_RELEASE'
        ? `On a claim of ${reasonLabel}, ${profile.note}. ${evidenceNote} Recommending release of the full amount to the freelancer.`
        : `On a claim of ${reasonLabel}, ${profile.note}. ${evidenceNote} Recommending a ${freelancerPct}/${100 - freelancerPct} split (freelancer/client) to reflect partial delivery.`;

  return { recommendation, freelancerPct, confidence, rationale };
}

/**
 * Idempotently ensure a dispute has a stored AI recommendation, creating one
 * from the current case file if missing. Safe to call from the filing flow and
 * lazily when a case is opened. Never throws - returns null on failure.
 */
export async function ensureAiRecommendation(disputeId: string) {
  try {
    const existing = await prisma.aiRecommendation.findUnique({ where: { disputeId } });
    if (existing) return existing;

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { evidence: { select: { submittedById: true } }, messages: true, responses: true },
    });
    if (!dispute) return null;

    const contract = await prisma.contract.findUnique({ where: { id: dispute.contractId } });
    const { payerId, payeeId } = contract
      ? resolveParties(contract)
      : { payerId: null, payeeId: null };

    const result = buildRecommendation({
      reason: dispute.reason,
      filedById: dispute.filedById,
      payerId,
      payeeId,
      evidence: dispute.evidence,
      messageCount: dispute.messages.length,
      responseCount: dispute.responses.length,
    });

    return await prisma.aiRecommendation.create({
      data: {
        disputeId,
        recommendation: result.recommendation,
        freelancerPct: result.freelancerPct,
        confidence: result.confidence,
        rationale: result.rationale,
      },
    });
  } catch (error) {
    // Race (unique constraint) or transient failure - fall back to whatever exists.
    console.warn('[dispute-ai] ensure failed', disputeId, (error as Error).message);
    return prisma.aiRecommendation.findUnique({ where: { disputeId } }).catch(() => null);
  }
}
