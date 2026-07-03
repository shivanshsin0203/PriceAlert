// Shared fetch with a hard timeout (6s): a hung price source becomes a normal
// "no data this tick — retry next minute" instead of stalling a whole tick.
const TIMEOUT_MS = 6_000;

export function fetchTimed(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}
