import jwt from 'jsonwebtoken';

export function createAuthMiddleware(jwtSecret) {
  return function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
      };
      return next();
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }
  };
}

export function createRoleMiddleware(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function requireRole(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Administrator access required.' });
    }

    return next();
  };
}
