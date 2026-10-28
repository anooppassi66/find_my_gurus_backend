const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { money } = require('../utils/format');

function serializeTx(tx) {
  return {
    id: tx.id,
    type: tx.type,
    reason: tx.reason,
    amount: money(tx.amount),
    description: tx.description,
    milestoneId: tx.milestoneId,
    createdAt: tx.createdAt,
  };
}

async function getBalance(userId) {
  const [credit, debit] = await Promise.all([
    prisma.walletTransaction.aggregate({
      where: { userId, type: 'CREDIT' },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId, type: 'DEBIT' },
      _sum: { amount: true },
    }),
  ]);
  return Number(credit._sum.amount || 0) - Number(debit._sum.amount || 0);
}

const meQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const me = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);
  const query = parseOrThrow(meQuerySchema, req.query);

  const [balance, items, total] = await Promise.all([
    getBalance(userId),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.walletTransaction.count({ where: { userId } }),
  ]);

  res.json({
    balance: money(balance),
    transactions: {
      items: items.map(serializeTx),
      total,
      page: query.page,
      pageSize: query.pageSize,
    },
  });
});

const amountSchema = z.object({
  amount: z.coerce.number().positive(),
});

const topup = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);
  const data = parseOrThrow(amountSchema, req.body);

  await prisma.walletTransaction.create({
    data: {
      userId,
      type: 'CREDIT',
      reason: 'TOPUP',
      amount: data.amount,
      description: 'Wallet top-up',
    },
  });

  const balance = await getBalance(userId);
  res.json({ balance: money(balance) });
});

const withdraw = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);
  const data = parseOrThrow(amountSchema, req.body);

  const balance = await getBalance(userId);
  if (data.amount > balance) {
    throw new ApiError(409, 'Insufficient wallet balance');
  }

  await prisma.walletTransaction.create({
    data: {
      userId,
      type: 'DEBIT',
      reason: 'PAYOUT',
      amount: data.amount,
      description: 'Wallet withdrawal',
    },
  });

  const newBalance = await getBalance(userId);
  res.json({ balance: money(newBalance) });
});

module.exports = { me, topup, withdraw };
