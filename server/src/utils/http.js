export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function handleRoute(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return next(error);
    }
  };
}

export function cleanText(value, maxLength = 240) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

export function requireFields(body, fields) {
  for (const field of fields) {
    if (!String(body?.[field] ?? '').trim()) {
      throw new AppError(`${field} is required.`);
    }
  }
}
