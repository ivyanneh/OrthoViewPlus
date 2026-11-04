import jwt from 'jsonwebtoken';

export function createAuthMiddleware(jwtSecret, { getAuthState } = {}) {
  return function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }

    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };

    // Re-check the account on every request so deactivation, restriction and role changes apply immediately.
    if (getAuthState) {
      const account = getAuthState(payload.sub);
      if (!account || account.status !== 'active' || account.restricted) {
        return res.status(401).json({ error: 'This account is no longer permitted to sign in.' });
      }
      if (Number(payload.tokenVersion ?? 0) !== Number(account.tokenVersion)) {
        return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      }
      req.user = { id: account.id, username: account.username, role: account.role };
    }

    return next();
  };
}

export function createRoleMiddleware(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function requireRole(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }

    return next();
  };
}
