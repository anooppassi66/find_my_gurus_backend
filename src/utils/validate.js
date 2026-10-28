const { ApiError } = require('../middleware/errorHandler');

// Parses `data` against a zod schema; throws a 400 ApiError with a readable
// message on failure, otherwise returns the parsed (typed) value.
function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, message);
  }
  return result.data;
}

module.exports = { parseOrThrow };
