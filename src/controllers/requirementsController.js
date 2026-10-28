const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { money } = require('../utils/format');
const { relatedCategoryIds } = require('../utils/categories');

function serialize(requirement, extra = {}) {
  return {
    id: requirement.id,
    studentId: requirement.studentId,
    studentName: requirement.student?.fullName,
    title: requirement.title,
    categoryId: requirement.categoryId,
    categoryName: requirement.category?.name || null,
    description: requirement.description,
    budgetType: requirement.budgetType,
    budgetAmount: money(requirement.budgetAmount),
    status: requirement.status,
    createdAt: requirement.createdAt,
    ...extra,
  };
}

const createSchema = z.object({
  title: z.string().min(1),
  categoryId: z.coerce.number().int(),
  description: z.string().min(1),
  budgetType: z.enum(['FIXED_MILESTONES', 'FIXED_FULL_PAY']),
  budgetAmount: z.coerce.number().positive(),
});

const create = asyncHandler(async (req, res) => {
  const data = parseOrThrow(createSchema, req.body);

  const requirement = await prisma.requirement.create({
    data: {
      studentId: Number(req.user.id),
      title: data.title,
      categoryId: data.categoryId,
      description: data.description,
      budgetType: data.budgetType,
      budgetAmount: data.budgetAmount,
    },
    include: { student: true, category: true },
  });

  res.status(201).json(serialize(requirement));
});

const mineSchema = z.object({
  status: z.enum(['OPEN', 'MATCHED', 'IN_CONTRACT', 'CLOSED', 'CANCELLED']).optional(),
});

const mine = asyncHandler(async (req, res) => {
  const query = parseOrThrow(mineSchema, req.query);

  const requirements = await prisma.requirement.findMany({
    where: {
      studentId: Number(req.user.id),
      ...(query.status ? { status: query.status } : {}),
    },
    include: { student: true, category: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(requirements.map((r) => serialize(r)));
});

const openSchema = z.object({
  category: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const open = asyncHandler(async (req, res) => {
  const query = parseOrThrow(openSchema, req.query);
  const categoryIds = query.category ? await relatedCategoryIds(query.category) : null;

  const where = {
    status: 'OPEN',
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.requirement.findMany({
      where,
      include: { student: true, category: true },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.requirement.count({ where }),
  ]);

  res.json({
    items: items.map((r) => serialize(r)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const requirement = await prisma.requirement.findUnique({
    where: { id },
    include: {
      student: true,
      category: true,
      _count: { select: { proposals: true } },
    },
  });

  if (!requirement) {
    throw new ApiError(404, 'Requirement not found');
  }

  if (req.user.role === 'STUDENT' && requirement.studentId !== Number(req.user.id)) {
    throw new ApiError(403, 'Not authorized to view this requirement');
  }

  res.json(serialize(requirement, { proposalCount: requirement._count.proposals }));
});

const updateSchema = z.object({
  status: z.enum(['CLOSED', 'CANCELLED']),
});

const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const data = parseOrThrow(updateSchema, req.body);

  const requirement = await prisma.requirement.findUnique({ where: { id } });
  if (!requirement) {
    throw new ApiError(404, 'Requirement not found');
  }
  if (requirement.studentId !== Number(req.user.id)) {
    throw new ApiError(403, 'Not authorized to update this requirement');
  }

  const updated = await prisma.requirement.update({
    where: { id },
    data: { status: data.status },
    include: { student: true, category: true },
  });

  res.json(serialize(updated));
});

module.exports = { create, mine, open, getOne, update, serialize };
