import axios, { AxiosInstance } from 'axios';

/**
 * Thin wrapper around the MTN HTTP endpoint. Keeps axios/transport concerns out
 * of the collection/disbursement services (Single Responsibility).
 */
export class MtnClient {
  readonly http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
