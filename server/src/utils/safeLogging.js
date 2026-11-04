function safeCode(value) {
  return typeof value === 'string' && /^[A-Z0-9_]{1,40}$/.test(value) ? value : undefined;
}

export function logSafeError(context, error, logger = console) {
  const details = {
    name: safeCode(error?.name) || 'Error',
    code: safeCode(error?.code),
    status: Number.isInteger(error?.status) ? error.status : undefined,
    httpStatus: Number.isInteger(error?.response?.status) ? error.response.status : undefined,
  };
  logger.error(context, details);
}
