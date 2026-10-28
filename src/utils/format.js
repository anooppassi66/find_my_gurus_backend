// Formats a Prisma Decimal / number / string as a fixed-2-decimal money string
// for JSON responses, per API_CONTRACT.md ("all money fields are decimal
// strings in JSON").
function money(value) {
  if (value === null || value === undefined) return null;
  return Number(value).toFixed(2);
}

module.exports = { money };
