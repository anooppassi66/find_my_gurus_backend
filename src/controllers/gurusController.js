const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { money } = require('../utils/format');
const { relatedCategoryIds } = require('../utils/categories');

function parseSkills(skillsCsv) {
  if (!skillsCsv) return [];
  return skillsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeSummary(user) {
  const profile = user.guruProfile;
  return {
    userId: user.id,
    fullName: user.fullName,
    headline: profile?.headline || null,
    categoryName: profile?.category?.name || null,
    skills: parseSkills(profile?.skills),
    ratingAvg: profile ? Number(profile.ratingAvg) : 0,
    ratingCount: profile ? profile.ratingCount : 0,
    city: user.city,
    country: user.country,
  };
}

function serializeDetail(user) {
  const profile = user.guruProfile;
  return {
    ...serializeSummary(user),
    bio: profile?.bio || null,
    hourlyRate: money(profile?.hourlyRate),
    fixedRateMin: money(profile?.fixedRateMin),
    fixedRateMax: money(profile?.fixedRateMax),
    introVideoUrl: profile?.introVideoUrl || null,
    // email intentionally omitted from this public endpoint (see API_CONTRACT.md)
  };
}

const listSchema = z.object({
  category: z.coerce.number().int().optional(),
  skill: z.string().optional(),
  minRating: z.coerce.number().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const list = asyncHandler(async (req, res) => {
  const query = parseOrThrow(listSchema, req.query);
  const categoryIds = query.category ? await relatedCategoryIds(query.category) : null;

  const where = {
    role: 'GURU',
    guruProfile: {
      is: {
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(query.skill ? { skills: { contains: query.skill } } : {}),
        ...(query.minRating !== undefined ? { ratingAvg: { gte: query.minRating } } : {}),
      },
    },
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q } },
            { guruProfile: { headline: { contains: query.q } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { guruProfile: { include: { category: true } } },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { id: 'asc' },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    items: items.map(serializeSummary),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'GURU' },
    include: { guruProfile: { include: { category: true } } },
  });
  if (!user) {
    throw new ApiError(404, 'Guru not found');
  }
  res.json(serializeDetail(user));
});

const updateMeSchema = z.object({
  headline: z.string().optional(),
  bio: z.string().optional(),
  categoryId: z.coerce.number().int().optional(),
  skills: z.array(z.string()).optional(),
  hourlyRate: z.coerce.number().optional(),
  fixedRateMin: z.coerce.number().optional(),
  fixedRateMax: z.coerce.number().optional(),
  introVideoUrl: z.string().optional(),
});

const updateMe = asyncHandler(async (req, res) => {
  const data = parseOrThrow(updateMeSchema, req.body);

  const updateData = {
    ...(data.headline !== undefined ? { headline: data.headline } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
    ...(data.skills !== undefined ? { skills: data.skills.join(',') } : {}),
    ...(data.hourlyRate !== undefined ? { hourlyRate: data.hourlyRate } : {}),
    ...(data.fixedRateMin !== undefined ? { fixedRateMin: data.fixedRateMin } : {}),
    ...(data.fixedRateMax !== undefined ? { fixedRateMax: data.fixedRateMax } : {}),
    ...(data.introVideoUrl !== undefined ? { introVideoUrl: data.introVideoUrl } : {}),
  };

  await prisma.guruProfile.upsert({
    where: { userId: Number(req.user.id) },
    update: updateData,
    create: { userId: Number(req.user.id), ...updateData },
  });

  const user = await prisma.user.findUnique({
    where: { id: Number(req.user.id) },
    include: { guruProfile: { include: { category: true } } },
  });

  res.json(serializeDetail(user));
});

module.exports = { list, getOne, updateMe };
