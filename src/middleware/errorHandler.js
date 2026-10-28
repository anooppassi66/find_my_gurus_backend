class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express error-handling middleware — must be registered last, after all routes.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { message: err.message } });
  }

  // Prisma "record not found" style errors
  if (err && err.code === 'P2025') {
    return res.status(404).json({ error: { message: 'Not found' } });
  }

  // Prisma unique constraint violation
  if (err && err.code === 'P2002') {
    return res.status(409).json({ error: { message: 'Conflict: record already exists' } });
  }

  console.error(err);
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message || 'Error';
  return res.status(status).json({ error: { message } });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

module.exports = { ApiError, errorHandler, notFoundHandler };
