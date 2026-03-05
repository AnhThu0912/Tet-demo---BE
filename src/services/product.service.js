const fs = require("fs");
const path = require("path");

const productsFile = path.join(__dirname, "../data/products.json");

const normalizeText = (input) => {
  return (input || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
};

const readProducts = () => {
  const data = fs.readFileSync(productsFile, "utf-8");
  return JSON.parse(data);
};

const getAllProducts = (query = {}) => {
  let products = readProducts();

  // Mini 1: only active products
  products = products.filter((p) => p.isActive === true);

  // Mini 2: search by name
  const q = normalizeText(query.q);
  if (q) {
    products = products.filter((p) => normalizeText(p.name).includes(q));
  }

  // Mini 3: filter by category
  const category = normalizeText(query.category);

  if (category) {
    products = products.filter((p) => normalizeText(p.category) === category);
  }

  // Mini 4: filter by price
  const minPrice = query.minPrice !== undefined ? Number(query.minPrice) : null;
  const maxPrice = query.maxPrice !== undefined ? Number(query.maxPrice) : null;

  if (minPrice !== null && !Number.isNaN(minPrice)) {
    products = products.filter((p) => Number(p.price) >= minPrice);
  }
  if (maxPrice !== null && !Number.isNaN(maxPrice)) {
    products = products.filter((p) => Number(p.price) <= maxPrice);
  }

  // Mini 5: pagination
  const pageRaw = query.page !== undefined ? Number(query.page) : 1;
  const limitRaw = query.limit !== undefined ? Number(query.limit) : 50;

  const page = !Number.isNaN(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit =
    !Number.isNaN(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10;

  const total = products.length;
  const totalPages = Math.ceil(total / limit);

  const start = (page - 1) * limit;
  const items = products.slice(start, start + limit);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
};

const getProductById = (id) => {
  const products = readProducts();
  const product = products.find((p) => Number(p.id) === Number(id));
  return product || null;
};

module.exports = {
  getAllProducts,
  getProductById,
};
