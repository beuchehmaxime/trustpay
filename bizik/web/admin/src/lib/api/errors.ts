/** Standardised error contract returned by the BiZik backend (SRS Appendix C). */
export interface ApiError {
  code: string;
  message: string;
  /** Optional incident reference returned on Q-500. */
  incidentRef?: string;
  details?: unknown;
}
