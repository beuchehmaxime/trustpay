/**
 * AML / sanctions screening adapter (SRS FR-KYC-006, INT-CMP-001).
 *
 * Production calls ComplyAdvantage to screen a person against OFAC SDN, the EU
 * consolidated list, the UN Security Council list, FATF and PEP lists, with a
 * ≤2s SLA. A positive match freezes the account (reversible only by a
 * Compliance Officer) and notifies compliance.
 *
 * Simulated here. A clear result is returned for everyone except deterministic
 * test markers in the legal name, so the freeze path is exercisable:
 *   - name contains "SANCTION" or "OFAC" → MATCH (account freeze)
 *   - name contains "PEP"                → PEP (enhanced due diligence)
 */
export type ScreeningOutcome = 'CLEAR' | 'MATCH' | 'PEP';

export interface ScreeningResult {
  provider: string;
  result: ScreeningOutcome;
  matchData?: unknown;
}

export async function screen(person: {
  userId: string;
  fullName: string;
  country: string;
}): Promise<ScreeningResult> {
  const name = person.fullName.toUpperCase();
  const lists = ['OFAC-SDN', 'EU-CONSOLIDATED', 'UN-SC', 'FATF', 'PEP'];

  if (name.includes('SANCTION') || name.includes('OFAC')) {
    return {
      provider: 'complyadvantage',
      result: 'MATCH',
      matchData: { lists, matchedList: 'OFAC-SDN', score: 0.97, name: person.fullName },
    };
  }
  if (name.includes('PEP')) {
    return {
      provider: 'complyadvantage',
      result: 'PEP',
      matchData: { lists, matchedList: 'PEP', score: 0.88, name: person.fullName },
    };
  }
  return { provider: 'complyadvantage', result: 'CLEAR', matchData: { lists } };
}
