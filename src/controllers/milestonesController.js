const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { money } = require('../utils/format');
const { resolveCommission } = require('../utils/commission');

function serializeMilestone(milestone) {
  return {
    id: milestone.id,
    contractId: milestone.contractId,
    name: milestone.name,
    amount: money(milestone.amount),
    startDate: milestone.startDate,
    endDate: milestone.endDate,
    status: milestone.status,
    createdById: milestone.createdById,
    commissionPct: milestone.commissionPct !== null ? Number(milestone.commissionPct) : null,
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  };
}

async function getPlatformMinAmount() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: 'milestone_min_amount' },
  });
  return setting ? Number(setting.value) : 0;
}

async function getWalletBalance(userId, tx = prisma) {
  const [credit, debit] = await Promise.all([
    tx.walletTransaction.aggregate({
      where: { userId, type: 'CREDIT' },
      _sum: { amount: true },
    }),
    tx.walletTransaction.aggregate({
      where: { userId, type: 'DEBIT' },
      _sum: { amount: true },
    }),
  ]);
  return Number(credit._sum.amount || 0) - Number(debit._sum.amount || 0);
}

async function loadMilestoneWithContract(id) {
  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { contract: true },
  });
  if (!milestone) {
    throw new ApiError(404, 'Milestone not found');
  }
  return milestone;
}

function assertParticipant(contract, userId) {
  if (contract.studentId !== userId && contract.guruId !== userId) {
    throw new ApiError(403, 'Not authorized for this contract');
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  amount: z.coerce.number().positive(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const create = asyncHandler(async (req, res) => {
  const contractId = Number(req.params.id);
  const userId = Number(req.user.id);
  const data = parseOrThrow(createSchema, req.body);

  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    throw new ApiError(404, 'Contract not found');
  }
  assertParticipant(contract, userId);

  const minAmount = await getPlatformMinAmount();
  if (data.amount < minAmount) {
    throw new ApiError(400, `Milestone amount must be at least ${minAmount}`);
  }

  const milestone = await prisma.milestone.create({
    data: {
      contractId,
      name: data.name,
      amount: data.amount,
      startDate: data.startDate,
      endDate: data.endDate,
      createdById: userId,
      status: 'PENDING_APPROVAL',
    },
  });

  res.status(201).json(serializeMilestone(milestone));
});

const listForContract = asyncHandler(async (req, res) => {
  const contractId = Number(req.params.id);
  const userId = Number(req.user.id);

  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) {
    throw new ApiError(404, 'Contract not found');
  }
  assertParticipant(contract, userId);

  const milestones = await prisma.milestone.findMany({
    where: { contractId },
    orderBy: { createdAt: 'asc' },
  });

  res.json(milestones.map(serializeMilestone));
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  const data = parseOrThrow(updateSchema, req.body);

  const milestone = await loadMilestoneWithContract(id);
  assertParticipant(milestone.contract, userId);

  if (milestone.createdById === userId) {
    throw new ApiError(403, 'Only the other participant can edit this milestone');
  }
  if (milestone.status !== 'PENDING_APPROVAL') {
    throw new ApiError(409, 'Milestone can only be edited while pending approval');
  }

  if (data.amount !== undefined) {
    const minAmount = await getPlatformMinAmount();
    if (data.amount < minAmount) {
      throw new ApiError(400, `Milestone amount must be at least ${minAmount}`);
    }
  }

  const updated = await prisma.milestone.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
    },
  });

  res.json(serializeMilestone(updated));
});

const reject = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  const milestone = await loadMilestoneWithContract(id);
  assertParticipant(milestone.contract, userId);

  if (milestone.createdById === userId) {
    throw new ApiError(403, 'Only the other participant can reject this milestone');
  }
  if (milestone.status !== 'PENDING_APPROVAL') {
    throw new ApiError(409, 'Only milestones pending approval can be rejected');
  }

  const updated = await prisma.milestone.update({
    where: { id },
    data: { status: 'REJECTED' },
  });

  res.json(serializeMilestone(updated));
});

const approve = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  const milestone = await loadMilestoneWithContract(id);
  assertParticipant(milestone.contract, userId);

  if (milestone.createdById !== userId) {
    throw new ApiError(403, 'Only the milestone creator can approve it');
  }
  if (milestone.status !== 'PENDING_APPROVAL') {
    throw new ApiError(409, 'Only milestones pending approval can be approved');
  }

  const studentId = milestone.contract.studentId;
  const amount = Number(milestone.amount);

  const updated = await prisma.$transaction(async (tx) => {
    const balance = await getWalletBalance(studentId, tx);
    if (balance < amount) {
      throw new ApiError(409, 'Insufficient wallet balance to fund this milestone');
    }

    // Re-check status inside the transaction to avoid a double-approve race.
    const fresh = await tx.milestone.findUnique({ where: { id } });
    if (!fresh || fresh.status !== 'PENDING_APPROVAL') {
      throw new ApiError(409, 'Only milestones pending approval can be approved');
    }

    await tx.walletTransaction.create({
      data: {
        userId: studentId,
        type: 'DEBIT',
        reason: 'MILESTONE_ESCROW',
        amount: milestone.amount,
        milestoneId: id,
      },
    });

    return tx.milestone.update({ where: { id }, data: { status: 'ACTIVE' } });
  });

  res.json(serializeMilestone(updated));
});

const submit = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  const milestone = await loadMilestoneWithContract(id);
  if (milestone.contract.guruId !== userId) {
    throw new ApiError(403, "Only the contract's guru can submit this milestone");
  }
  if (milestone.status !== 'ACTIVE') {
    throw new ApiError(409, 'Only active milestones can be submitted');
  }

  const updated = await prisma.milestone.update({
    where: { id },
    data: { status: 'SUBMITTED' },
  });

  res.json(serializeMilestone(updated));
});

const release = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  const milestone = await loadMilestoneWithContract(id);
  if (milestone.contract.studentId !== userId) {
    throw new ApiError(403, "Only the contract's student can release this milestone");
  }
  if (milestone.status !== 'SUBMITTED') {
    throw new ApiError(409, 'Only submitted milestones can be released');
  }

  const bands = await prisma.commissionBand.findMany({ where: { active: true } });
  const { ratePct, commission, net } = resolveCommission(milestone.amount, bands);

  const updated = await prisma.$transaction(async (tx) => {
    const releasedMilestone = await tx.milestone.update({
      where: { id },
      data: { status: 'RELEASED', commissionPct: ratePct },
    });

    await tx.walletTransaction.create({
      data: {
        userId: milestone.contract.guruId,
        type: 'CREDIT',
        reason: 'MILESTONE_RELEASE',
        amount: net,
        milestoneId: id,
        description: `Milestone release net of ${ratePct}% commission (${commission})`,
      },
    });

    return releasedMilestone;
  });

  res.json(serializeMilestone(updated));
});

module.exports = {
  create,
  listForContract,
  update,
  reject,
  approve,
  submit,
  release,
  serializeMilestone,
};
