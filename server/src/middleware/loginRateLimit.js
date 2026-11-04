const MAX_TRACKED_CLIENTS = 10000;

export function createLoginRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();

  function getState(key) {
    const state = attempts.get(key);
    if (state && now() - state.startedAt >= windowMs) {
      attempts.delete(key);
      return null;
    }
    return state;
  }

  function clientKey(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown');
  }

  return {
    clientKey,

    retryAfter(key) {
      const state = getState(key);
      if (!state || state.failures < limit) return 0;
      return Math.max(1, Math.ceil((windowMs - (now() - state.startedAt)) / 1000));
    },

    recordFailure(key) {
      let state = getState(key);
      if (!state) {
        while (attempts.size >= MAX_TRACKED_CLIENTS) {
          attempts.delete(attempts.keys().next().value);
        }
        state = { startedAt: now(), failures: 0 };
        attempts.set(key, state);
      }
      state.failures += 1;
    },

    reset(key) {
      attempts.delete(key);
    },
  };
}
