const prisma = require('../lib/prisma');

// A requirement is usually posted under a subcategory while gurus often
// register under the top-level category (or vice versa), so a category
// filter matches the category itself plus its parent and its children.
async function relatedCategoryIds(categoryId) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { children: { select: { id: true } } },
  });
  if (!category) return [categoryId];
  return [
    category.id,
    ...(category.parentId ? [category.parentId] : []),
    ...category.children.map((c) => c.id),
  ];
}

module.exports = { relatedCategoryIds };
