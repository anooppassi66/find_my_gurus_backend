const { z } = require('zod');
const prisma = require('../lib/prisma');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { money } = require('../utils/format');
const { resolveCommission } = require('../utils/commission');

const bands = asyncHandler(async (req, res) => {
  const rows = await prisma.commissionBand.findMany({
    where: { active: true },
    orderBy: { minAmount: 'asc' },
  });

  res.json(
    rows.map((b) => ({
      id: b.id,
      minAmount: money(b.minAmount),
      maxAmount: b.maxAmount !== null ? money(b.maxAmount) : null,
      ratePct: Number(b.ratePct),
    }))
  );
});

const calculateSchema = z.object({
  amount: z.coerce.number().nonnegative(),
});

const calculate = asyncHandler(async (req, res) => {
  const query = parseOrThrow(calculateSchema, req.query);

  const rows = await prisma.commissionBand.findMany({ where: { active: true } });
  const { ratePct, commission, net, band } = resolveCommission(query.amount, rows);

  res.json({
    amount: query.amount,
    ratePct,
    commission,
    net,
    band: { minAmount: band.minAmount, maxAmount: band.maxAmount },
  });
});

module.exports = { bands, calculate };
