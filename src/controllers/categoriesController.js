const prisma = require('../lib/prisma');
const { asyncHandler } = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } });
  res.json(
    categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId }))
  );
});

module.exports = { list };
