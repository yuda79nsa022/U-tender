// Drawings must stay accessible for exactly as long as the owner said
// bidding is open — not an arbitrary short-lived link. We tie the signed
// URL's expiry to the project's bid_deadline (plus a small buffer so a
// contractor mid-review right at the deadline doesn't get cut off).
//
// Floor: 1 hour, in case the deadline has already passed (e.g. an owner
// or admin reviewing a closed/awarded project) so the link still works
// long enough to load.
// Ceiling: 90 days, as a sanity guard against a mistakenly far-future
// deadline generating an absurdly long-lived credential.
const ONE_HOUR = 60 * 60;
const NINETY_DAYS = 60 * 60 * 24 * 90;
const POST_DEADLINE_BUFFER = 60 * 15; // 15 minutes grace after the deadline

export function drawingUrlExpirySeconds(bidDeadlineIso: string): number {
  const msRemaining = new Date(bidDeadlineIso).getTime() - Date.now() + POST_DEADLINE_BUFFER * 1000;
  const secondsRemaining = Math.ceil(msRemaining / 1000);
  return Math.min(Math.max(secondsRemaining, ONE_HOUR), NINETY_DAYS);
}
