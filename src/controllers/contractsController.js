const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { asyncHandler } = require('../utils/asyncHandler');
const { serializeMilestone } = require('./milestonesController');

function serialize(contract) {
  return {
    id: contract.id,
    requirementId: contract.requirementId,
    requirementTitle: contract.requirement?.title,
    studentId: contract.studentId,
    studentName: contract.student?.fullName,
    guruId: contract.guruId,
    guruName: contract.guru?.fullName,
    status: contract.status,
    createdAt: contract.createdAt,
  };
}

const list = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);

  const contracts = await prisma.contract.findMany({
    where: { OR: [{ studentId: userId }, { guruId: userId }] },
    include: { requirement: true, student: true, guru: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(contracts.map(serialize));
});

const getOne = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      requirement: true,
      student: true,
      guru: true,
      milestones: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!contract) {
    throw new ApiError(404, 'Contract not found');
  }
  if (contract.studentId !== userId && contract.guruId !== userId) {
    throw new ApiError(403, 'Not authorized to view this contract');
  }

  res.json({
    ...serialize(contract),
    milestones: contract.milestones.map(serializeMilestone),
  });
});

module.exports = { list, getOne, serialize };
