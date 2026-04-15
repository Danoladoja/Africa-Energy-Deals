/**
 * Shared scraper execution state.
 *
 * Prevents concurrent "run all" executions and provides a cancellation
 * mechanism that can be triggered from the admin API without restarting
 * the server.
 */

let _isRunning = false;
let _cancelRequested = false;

/** Returns true if a "run all" is currently in progress. */
export function isScraperRunning(): boolean {
  return _isRunning;
}

/** Returns true if a cancel has been requested for the current run. */
export function isCancelRequested(): boolean {
  return _cancelRequested;
}

/** Set the running flag. Clears cancel flag when starting. */
export function setScraperRunning(v: boolean): void {
  _isRunning = v;
  if (!v) _cancelRequested = false; // reset cancel when run finishes
}

/** Request cancellation of the current run. No-op if nothing is running. */
export function requestCancel(): void {
  if (_isRunning) _cancelRequested = true;
}
