const { successResponse, errorResponse } = require("../utils/response");
const pool = require("../db/mysql");

const parseBoolean = (v) => {
  if (v === undefined) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
};

const parseNumber = (v) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseIntStrict = (v) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

/**
 * Parse + validate query params cho /products.
 * Trả về { ok: true, data } hoặc { ok: false, status, message }
 */
const parseProductsQuery = (query) => {
  const {
    category,
    isActive,
    minPrice,
    maxPrice,
    ids,
    sortBy,
    sortOrder,
    page,
    pageSize,
  } = query;

  const q = query.q ?? query.search;

  const normalizedCategory =
    category !== undefined ? String(category).trim().toLowerCase() : undefined;
  const normalizedQ = q !== undefined ? String(q).trim() : undefined;

  const isActiveBool = parseBoolean(isActive);
  if (isActiveBool === null) {
    return { ok: false, status: 400, message: "isActive phải là true hoặc false" };
  }

  const minPriceNum = parseNumber(minPrice);
  if (minPriceNum === null) {
    return { ok: false, status: 400, message: "minPrice phải là số" };
  }

  const maxPriceNum = parseNumber(maxPrice);
  if (maxPriceNum === null) {
    return { ok: false, status: 400, message: "maxPrice phải là số" };
  }

  if (
    minPriceNum !== undefined &&
    maxPriceNum !== undefined &&
    minPriceNum > maxPriceNum
  ) {
    return { ok: false, status: 400, message: "minPrice không được lớn hơn maxPrice" };
  }

  const rawPageSize = parseIntStrict(pageSize);
  if (rawPageSize === null) {
    return { ok: false, status: 400, message: "pageSize phải là số nguyên" };
  }

  const rawPage = parseIntStrict(page);
  if (rawPage === null) {
    return { ok: false, status: 400, message: "page phải là số nguyên" };
  }

  const finalPageSize = rawPageSize !== undefined ? Math.min(Math.max(rawPageSize, 1), 100) : 20;
  const finalPage = rawPage !== undefined ? Math.max(rawPage, 1) : 1;

  const allowedSortBy = ["id", "name", "price"];
  let finalSortBy = sortBy ? String(sortBy).trim().toLowerCase() : "id";
  if (!allowedSortBy.includes(finalSortBy)) finalSortBy = "id";

  let finalSortOrder = sortOrder ? String(sortOrder).trim().toLowerCase() : "desc";
  if (!["asc", "desc"].includes(finalSortOrder)) finalSortOrder = "desc";

  const idArray = ids
    ? String(ids)
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && Number.isInteger(id) && id > 0)
    : [];

  return {
    ok: true,
    data: {
      normalizedCategory,
      normalizedQ,
      isActiveBool,
      minPriceNum,
      maxPriceNum,
      idArray,
      finalSortBy,
      finalSortOrder,
      finalPage,
      finalPageSize,
    },
  };
};

/**
 * Query products + pagination metadata.
 */
const queryProducts = async (db, opts) => {
  const {
    normalizedCategory,
    normalizedQ,
    isActiveBool,
    minPriceNum,
    maxPriceNum,
    idArray,
    finalSortBy,
    finalSortOrder,
    finalPage,
    finalPageSize,
  } = opts;

  const baseSql = "FROM products";
  const where = [];
  const params = [];

  if (normalizedCategory) {
    where.push("LOWER(category) = ?");
    params.push(normalizedCategory);
  }

  if (isActiveBool !== undefined) {
    where.push("is_active = ?");
    params.push(isActiveBool);
  }

  if (minPriceNum !== undefined) {
    where.push("price >= ?");
    params.push(minPriceNum);
  }

  if (maxPriceNum !== undefined) {
    where.push("price <= ?");
    params.push(maxPriceNum);
  }

  if (normalizedQ) {
    where.push("name LIKE ?");
    params.push(`%${normalizedQ}%`);
  }

  if (idArray.length > 0) {
    where.push(`id IN (${idArray.map(() => "?").join(",")})`);
    params.push(...idArray);
  }

  const whereSql = where.length > 0 ? " WHERE " + where.join(" AND ") : "";

  // COUNT
  const countSql = `SELECT COUNT(*) as totalItems ${baseSql}${whereSql}`;
  const [countRows] = await db.query(countSql, params);
  const totalItems = Number(countRows[0]?.totalItems || 0);
  const totalPages = Math.ceil(totalItems / finalPageSize);

  // Nếu page vượt quá tổng trang và vẫn có dữ liệu, trả items rỗng để frontend xử lý
  if (totalItems > 0 && finalPage > totalPages) {
    return {
      items: [],
      page: finalPage,
      pageSize: finalPageSize,
      totalItems,
      totalPages,
    };
  }

  const offset = (finalPage - 1) * finalPageSize;

  // DATA
  const dataSql = `SELECT * ${baseSql}${whereSql} ORDER BY ${finalSortBy} ${finalSortOrder} LIMIT ? OFFSET ?`;
  const dataParams = [...params, finalPageSize, offset];
  const [items] = await db.query(dataSql, dataParams);

  return {
    items,
    page: finalPage,
    pageSize: finalPageSize,
    totalItems,
    totalPages,
  };
};
// ===== End Step 7 =====

const getProducts = async (req, res) => {
  try {
    const parsed = parseProductsQuery(req.query);
    if (!parsed.ok) {
      return errorResponse(res, parsed.status, parsed.message);
    }

    const result = await queryProducts(pool, parsed.data);
    return successResponse(res, result);
  } catch (error) {
    return errorResponse(res, 500, "Server error");
  }
};

const getProductDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return errorResponse(res, 404, "Không tìm thấy sản phẩm");
    }

    return successResponse(res, rows[0]);
  } catch (error) {
    return errorResponse(res, 500, "Server error");
  }
};

module.exports = {
  getProducts,
  getProductDetail,
};
