// Given an amount and a list of active CommissionBand rows (as returned by
// Prisma, so minAmount/maxAmount/ratePct may be Decimal instances), resolve
// the matching band and compute the commission + net amount.
//
// A band matches when amount >= minAmount and (maxAmount is null or amount < maxAmount).
// Bands must not overlap; ties are resolved by picking the lowest minAmount match.
function resolveCommission(amount, bands) {
  const amt = Number(amount);

  const sorted = [...bands].sort((a, b) => Number(a.minAmount) - Number(b.minAmount));

  const band = sorted.find((b) => {
    const min = Number(b.minAmount);
    const max = b.maxAmount === null || b.maxAmount === undefined ? null : Number(b.maxAmount);
    return amt >= min && (max === null || amt < max);
  });

  if (!band) {
    throw new Error(`No commission band configured for amount ${amt}`);
  }

  const ratePct = Number(band.ratePct);
  const commission = round2((amt * ratePct) / 100);
  const net = round2(amt - commission);

  return {
    ratePct,
    commission,
    net,
    band: {
      minAmount: Number(band.minAmount),
      maxAmount: band.maxAmount === null || band.maxAmount === undefined ? null : Number(band.maxAmount),
    },
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { resolveCommission };
