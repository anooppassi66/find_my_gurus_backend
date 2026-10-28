const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 10;

const CATEGORY_TREE = [
  {
    name: 'Web Development',
    children: ['Frontend Development', 'Backend Development', 'Full-Stack Development'],
  },
  {
    name: 'Data Science',
    children: ['Machine Learning', 'Data Analysis', 'Data Engineering'],
  },
  {
    name: 'Graphic Design',
    children: ['Logo & Branding', 'UI/UX Design', 'Illustration'],
  },
  {
    name: 'Music Production',
    children: ['Beat Making', 'Mixing & Mastering', 'Songwriting'],
  },
  {
    name: 'Spoken Languages',
    children: ['English', 'Spanish', 'French'],
  },
  {
    name: 'Business Coaching',
    children: ['Startup Strategy', 'Marketing', 'Sales'],
  },
];

async function seedPlatformSettings() {
  await prisma.platformSetting.upsert({
    where: { key: 'milestone_min_amount' },
    update: { value: '3000' },
    create: { key: 'milestone_min_amount', value: '3000' },
  });
}

async function seedCommissionBands() {
  const existing = await prisma.commissionBand.count();
  if (existing > 0) {
    console.log('CommissionBand rows already exist, skipping.');
    return;
  }

  await prisma.commissionBand.createMany({
    data: [
      { minAmount: 0, maxAmount: 500, ratePct: 15, active: true },
      { minAmount: 500, maxAmount: 1000, ratePct: 12, active: true },
      { minAmount: 1000, maxAmount: 2000, ratePct: 10, active: true },
      { minAmount: 2000, maxAmount: null, ratePct: 8, active: true },
    ],
  });
}

async function seedCategories() {
  const nameToId = {};

  for (const top of CATEGORY_TREE) {
    let parent = await prisma.category.findFirst({
      where: { name: top.name, parentId: null },
    });
    if (!parent) {
      parent = await prisma.category.create({ data: { name: top.name, parentId: null } });
    }
    nameToId[top.name] = parent.id;

    for (const childName of top.children) {
      const existingChild = await prisma.category.findFirst({
        where: { name: childName, parentId: parent.id },
      });
      if (!existingChild) {
        await prisma.category.create({ data: { name: childName, parentId: parent.id } });
      }
    }
  }

  return nameToId;
}

async function seedUsers(categoryIds) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const student = await prisma.user.upsert({
    where: { email: 'student@demo.com' },
    update: {},
    create: {
      role: 'STUDENT',
      fullName: 'Sara Student',
      email: 'student@demo.com',
      passwordHash,
      country: 'India',
      city: 'Mumbai',
    },
  });

  const guru1 = await prisma.user.upsert({
    where: { email: 'guru1@demo.com' },
    update: {},
    create: {
      role: 'GURU',
      fullName: 'Gina Guru',
      email: 'guru1@demo.com',
      passwordHash,
      country: 'India',
      city: 'Bengaluru',
    },
  });

  await prisma.guruProfile.upsert({
    where: { userId: guru1.id },
    update: {},
    create: {
      userId: guru1.id,
      headline: 'Full-stack web developer & mentor',
      bio: 'I help students build and ship real production apps with React and Node.js.',
      categoryId: categoryIds['Web Development'],
      skills: 'React,Node.js,PostgreSQL,TypeScript',
      hourlyRate: 25,
      fixedRateMin: 500,
      fixedRateMax: 5000,
      ratingAvg: 4.8,
      ratingCount: 34,
    },
  });

  const guru2 = await prisma.user.upsert({
    where: { email: 'guru2@demo.com' },
    update: {},
    create: {
      role: 'GURU',
      fullName: 'Diego Data',
      email: 'guru2@demo.com',
      passwordHash,
      country: 'Spain',
      city: 'Madrid',
    },
  });

  await prisma.guruProfile.upsert({
    where: { userId: guru2.id },
    update: {},
    create: {
      userId: guru2.id,
      headline: 'Data scientist teaching ML from scratch',
      bio: 'PhD in statistics, 8 years in industry ML. I teach Python, pandas, and modeling.',
      categoryId: categoryIds['Data Science'],
      skills: 'Python,Machine Learning,pandas,scikit-learn',
      hourlyRate: 35,
      fixedRateMin: 1000,
      fixedRateMax: 8000,
      ratingAvg: 4.6,
      ratingCount: 21,
    },
  });

  return { student, guru1, guru2 };
}

async function main() {
  await seedPlatformSettings();
  await seedCommissionBands();
  const categoryIds = await seedCategories();
  await seedUsers(categoryIds);

  console.log('\nSeed complete.\n');
  console.log('Demo login credentials (all use password: "password123"):');
  console.log('  Student: student@demo.com');
  console.log('  Guru 1:  guru1@demo.com  (Web Development)');
  console.log('  Guru 2:  guru2@demo.com  (Data Science)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
