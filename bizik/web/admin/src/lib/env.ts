/**
 * Typed access to public runtime configuration.
 *
 * Only `NEXT_PUBLIC_*` vars are readable in the browser - never put secrets
 * here. The API base points at the nginx gateway (`/api/v1`) the backend is
 * published behind (see docker-compose.yml / backend `src/index.ts`).
 */
export const env = {
  /** REST API gateway base URL. Override with NEXT_PUBLIC_API_URL for staging/prod. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: 'BiZik',
} as const;
