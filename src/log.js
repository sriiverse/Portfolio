/**
 * log.js — Small, single-purpose logging helper.
 * Format + emit only. No remote logging, no batching, no dependencies.
 */
export function logWarn(scope, message, err) {
  console.warn(`[${scope}] ${message}`, err ?? '');
}
export function logError(scope, message, err) {
  console.error(`[${scope}] ${message}`, err ?? '');
}
