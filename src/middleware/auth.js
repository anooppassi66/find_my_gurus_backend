const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');

// Verifies the JWT from `Authorization: Bearer <token>` and attaches
// req.user = { id, role } to the request.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Not authenticated'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

// Restricts a route to one or more roles. Must run after requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authenticated'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Not authorized'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
