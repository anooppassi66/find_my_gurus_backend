const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');

const BCRYPT_ROUNDS = 10;

const registerSchema = z.object({
  role: z.enum(['STUDENT', 'GURU']),
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  country: z.string().optional(),
  city: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function serializeUser(user) {
  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    country: user.country,
    city: user.city,
    createdAt: user.createdAt,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const register = asyncHandler(async (req, res) => {
  const data = parseOrThrow(registerSchema, req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      role: data.role,
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      country: data.country,
      city: data.city,
      ...(data.role === 'GURU' ? { guruProfile: { create: {} } } : {}),
    },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: serializeUser(user) });
});

const login = asyncHandler(async (req, res) => {
  const data = parseOrThrow(loginSchema, req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = signToken(user);
  res.json({ token, user: serializeUser(user) });
});

const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: Number(req.user.id) } });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  res.json({ user: serializeUser(user) });
});

module.exports = { register, login, me, serializeUser };
