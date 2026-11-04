const PLACEHOLDER_JWT_SECRET = /^(?:change[-_ ]?this|your[-_ ]|example|default|development|test|secret|placeholder)/i;

export function validateJwtSecret(jwtSecret, { nodeEnv = process.env.NODE_ENV, logger = console } = {}) {
  if (typeof jwtSecret !== 'string' || jwtSecret.length === 0) {
    throw new Error('JWT_SECRET must be configured.');
  }

  const isPlaceholder = PLACEHOLDER_JWT_SECRET.test(jwtSecret);
  if (nodeEnv === 'production' && (isPlaceholder || jwtSecret.length < 32)) {
    throw new Error('Production JWT_SECRET must be a non-placeholder value of at least 32 characters.');
  }

  if (nodeEnv !== 'production' && (isPlaceholder || jwtSecret.length < 32)) {
    logger.warn('JWT_SECRET is suitable only for local development; configure a unique secret before deployment.');
  }

  return jwtSecret;
}
