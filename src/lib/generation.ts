/**
 * Shared rules for "this is being generated right now".
 *
 * The work outlives the page that asked for it — a reader who closes the tab
 * does not cancel it — so whether something is in progress is a fact about the
 * server, not about a component's state.
 */

// Past this, a run is assumed dead rather than slow. Long enough to cover the
// slowest real generation seen (a chapter of dense notes, ~2 minutes, plus its
// translation pass), short enough that a process killed mid-run does not leave
// a chapter claiming to be generating until someone notices.
export const GENERATION_TIMEOUT_MS = 20 * 60 * 1000;

export function isGenerating(startedAt: Date | null | undefined): boolean {
  if (!startedAt) return false;
  return Date.now() - startedAt.getTime() < GENERATION_TIMEOUT_MS;
}
