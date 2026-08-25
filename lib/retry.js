// Calls an async function and retries it if it throws, using increasing delays.
// Useful for transient errors like Gemini's "model is overloaded" 503 responses.
export async function withRetry(fn, { attempts = 3, delayMs = 10000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = i === attempts - 1;
      if (isLastAttempt) break;
      console.log(`Attempt ${i + 1} failed (${err.message}). Retrying in ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 1.5; // back off a bit more each retry
    }
  }
  throw lastError;
}
