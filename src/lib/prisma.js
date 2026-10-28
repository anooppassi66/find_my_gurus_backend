const { PrismaClient } = require('@prisma/client');

// Singleton PrismaClient — reuse across the app (and across hot reloads in dev)
// to avoid exhausting the MySQL connection pool.
const prisma = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
