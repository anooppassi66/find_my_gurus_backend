const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { money } = require('../utils/format');

function serialize(proposal, extra = {}) {
  return {
    id: proposal.id,
    requirementId: proposal.requirementId,
    requirementTitle: proposal.requirement?.title,
    guruId: proposal.guruId,
    guruName: proposal.guru?.fullName,
    coverLetter: proposal.coverLetter,
    proposedAmount: money(proposal.proposedAmount),
    status: proposal.status,
    createdAt: proposal.createdAt,
    ...extra,
  };
}

const createSchema = z.object({
  coverLetter: z.string().min(1),
  proposedAmount: z.coerce.number().positive(),
});

const create = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.id);
  const data = parseOrThrow(createSchema, req.body);

  const requirement = await prisma.requirement.findUnique({ where: { id: requirementId } });
  if (!requirement) {
    throw new ApiError(404, 'Requirement not found');
  }
  if (requirement.status !== 'OPEN') {
    throw new ApiError(409, 'This requirement is no longer accepting proposals');
  }

  const proposal = await prisma.proposal.create({
    data: {
      requirementId,
      guruId: Number(req.user.id),
      coverLetter: data.coverLetter,
      proposedAmount: data.proposedAmount,
    },
    include: { requirement: true, guru: true },
  });

  res.status(201).json(serialize(proposal));
});

const listForRequirement = asyncHandler(async (req, res) => {
  const requirementId = Number(req.params.id);

  const requirement = await prisma.requirement.findUnique({ where: { id: requirementId } });
  if (!requirement) {
    throw new ApiError(404, 'Requirement not found');
  }
  if (requirement.studentId !== Number(req.user.id)) {
    throw new ApiError(403, 'Not authorized to view proposals for this requirement');
  }

  const proposals = await prisma.proposal.findMany({
    where: { requirementId },
    include: { requirement: true, guru: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(proposals.map((p) => serialize(p)));
});

const mine = asyncHandler(async (req, res) => {
  const proposals = await prisma.proposal.findMany({
    where: { guruId: Number(req.user.id) },
    include: { requirement: true, guru: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    proposals.map((p) =>
      serialize(p, {
        requirementStatus: p.requirement?.status,
      })
    )
  );
});

const updateSchema = z.object({
  status: z.enum(['SHORTLISTED', 'ACCEPTED', 'DECLINED']),
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const data = parseOrThrow(updateSchema, req.body);

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: { requirement: true, guru: true },
  });
  if (!proposal) {
    throw new ApiError(404, 'Proposal not found');
  }
  if (proposal.requirement.studentId !== Number(req.user.id)) {
    throw new ApiError(403, 'Not authorized to update this proposal');
  }

  if (data.status !== 'ACCEPTED') {
    const updated = await prisma.proposal.update({
      where: { id },
      data: { status: data.status },
      include: { requirement: true, guru: true },
    });
    return res.json(serialize(updated));
  }

  // ACCEPTED: create the contract, move the requirement into IN_CONTRACT,
  // and decline every other pending/shortlisted proposal on this requirement.
  const result = await prisma.$transaction(async (tx) => {
    const acceptedProposal = await tx.proposal.update({
      where: { id },
      data: { status: 'ACCEPTED' },
      include: { requirement: true, guru: true },
    });

    const contract = await tx.contract.create({
      data: {
        requirementId: acceptedProposal.requirementId,
        studentId: acceptedProposal.requirement.studentId,
        guruId: acceptedProposal.guruId,
      },
    });

    await tx.requirement.update({
      where: { id: acceptedProposal.requirementId },
      data: { status: 'IN_CONTRACT' },
    });

    await tx.proposal.updateMany({
      where: {
        requirementId: acceptedProposal.requirementId,
        id: { not: id },
        status: { in: ['PENDING', 'SHORTLISTED'] },
      },
      data: { status: 'DECLINED' },
    });

    return { acceptedProposal, contract };
  });

  res.json(serialize(result.acceptedProposal, { contractId: result.contract.id }));
});

module.exports = { create, listForRequirement, mine, update };
