/** Exponential backoff with full jitter for outbound cloud calls. */

export function backoffDelay(attempt, baseMs = 300, maxMs = 15000, random = Math.random) {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(random() * exponential);
}

/**
 * Retry an async operation. `shouldRetry` decides which failures are transient.
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = 4,
    baseMs = 300,
    maxMs = 15000,
    random = Math.random,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    shouldRetry = () => true,
    onRetry = () => {},
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === retries || !shouldRetry(err, attempt)) break;
      const delay = backoffDelay(attempt, baseMs, maxMs, random);
      onRetry(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
