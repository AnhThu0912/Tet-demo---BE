const { successResponse, errorResponse } = require("../utils/response");
const pool = require("../db/mysql");

// =========================
// Helpers: parse/validate numbers safely
// =========================
const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
};

const toInt = (value) => {
    const n = toNumber(value);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

const isPositiveInt = (n) => Number.isInteger(n) && n > 0;
const isNonNegativeInt = (n) => Number.isInteger(n) && n >= 0;

// =========================
// Cart token strategy (no user yet)
// FE nên lưu token vào localStorage và gửi lên header mỗi request:
//   X-Cart-Token: <token>
// Nếu chưa có token, BE sẽ tự tạo 1 token mới và trả về response.data.cartToken
// =========================
const getCartTokenFromReq = (req) => {
    const token = req.header("x-cart-token") || req.header("X-Cart-Token");
    return typeof token === "string" && token.trim() ? token.trim() : null;
};

const generateCartToken = () => {
    // đủ dùng cho demo; nếu sau này muốn mạnh hơn thì dùng crypto.randomUUID()
    return `cart_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const getOrCreateCartId = async (req) => {
    let token = getCartTokenFromReq(req);
    if (!token) token = generateCartToken();

    // đảm bảo có carts row
    await pool.query(
        `INSERT INTO carts (token) VALUES (?)
         ON DUPLICATE KEY UPDATE token = token`,
        [token]
    );

    const [rows] = await pool.query("SELECT id FROM carts WHERE token = ? LIMIT 1", [token]);
    const cartId = rows?.[0]?.id;

    return { cartId, cartToken: token };
};

// =========================
// View builder
// =========================
const fetchCartView = async (cartId) => {
    const sql = `
    SELECT
      ci.product_id AS productId,
      ci.quantity,
      p.name,
      p.price,
      p.image
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
    ORDER BY ci.updated_at DESC
  `;

    const [rows] = await pool.query(sql, [cartId]);

    const items = rows.map((r) => {
        const price = Number(r.price) || 0;
        const quantity = Number(r.quantity) || 0;
        return {
            productId: r.productId,
            name: r.name,
            price,
            image: r.image,
            quantity,
            lineTotal: price * quantity,
        };
    });

    const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
    const totalPrice = items.reduce((sum, it) => sum + it.lineTotal, 0);

    return { items, totalQuantity, totalPrice };
};

// =========================
// Controllers
// =========================

// GET /api/cart
const getCart = async (req, res) => {
    try {
        const { cartId, cartToken } = await getOrCreateCartId(req);
        const cartView = await fetchCartView(cartId);
        // trả token để FE lưu (nếu FE chưa có)
        return successResponse(res, { ...cartView, cartToken });
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// POST /api/cart/items
const addItem = async (req, res) => {
    try {
        const { cartId, cartToken } = await getOrCreateCartId(req);

        const productId = toInt(req.body?.productId);
        const quantity = toInt(req.body?.quantity ?? 1);

        if (!isPositiveInt(productId)) {
            return errorResponse(res, 400, "productId không hợp lệ (phải là số nguyên > 0)");
        }
        if (!isPositiveInt(quantity)) {
            return errorResponse(res, 400, "quantity không hợp lệ (phải là số nguyên > 0)");
        }

        // Check product exists
        const [pRows] = await pool.query("SELECT id FROM products WHERE id = ?", [productId]);
        if (pRows.length === 0) {
            return errorResponse(res, 404, "Sản phẩm không tồn tại");
        }

        // Upsert theo (cart_id, product_id)
        // LƯU Ý: DB cần UNIQUE KEY (cart_id, product_id)
        const upsertSql = `
      INSERT INTO cart_items (cart_id, product_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
    `;
        await pool.query(upsertSql, [cartId, productId, quantity]);

        const cartView = await fetchCartView(cartId);
        return successResponse(res, { ...cartView, cartToken }, "Đã thêm vào giỏ hàng");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// PATCH /api/cart/items/:productId
// Best practice: cho phép quantity = 0 để xoá item
const updateItem = async (req, res) => {
    try {
        const { cartId, cartToken } = await getOrCreateCartId(req);

        const productId = toInt(req.params?.productId);
        const quantity = toInt(req.body?.quantity);

        if (!isPositiveInt(productId)) {
            return errorResponse(res, 400, "productId không hợp lệ (phải là số nguyên > 0)");
        }
        if (!Number.isFinite(quantity)) {
            return errorResponse(res, 400, "quantity không hợp lệ (bắt buộc)");
        }
        if (!isNonNegativeInt(quantity)) {
            return errorResponse(res, 400, "quantity không hợp lệ (phải là số nguyên >= 0)");
        }

        // quantity = 0 => xoá item
        if (quantity === 0) {
            const [delResult] = await pool.query(
                "DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?",
                [cartId, productId]
            );
            if (delResult.affectedRows === 0) {
                return errorResponse(res, 404, "Sản phẩm không có trong giỏ hàng");
            }
            const cartView = await fetchCartView(cartId);
            return successResponse(res, { ...cartView, cartToken }, "Đã xoá sản phẩm khỏi giỏ hàng");
        }

        const [result] = await pool.query(
            "UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?",
            [quantity, cartId, productId]
        );

        if (result.affectedRows === 0) {
            return errorResponse(res, 404, "Sản phẩm không có trong giỏ hàng");
        }

        const cartView = await fetchCartView(cartId);
        return successResponse(res, { ...cartView, cartToken }, "Đã cập nhật giỏ hàng");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// DELETE /api/cart/items/:productId
const removeItem = async (req, res) => {
    try {
        const { cartId, cartToken } = await getOrCreateCartId(req);

        const productId = toInt(req.params?.productId);

        if (!isPositiveInt(productId)) {
            return errorResponse(res, 400, "productId không hợp lệ (phải là số nguyên > 0)");
        }

        const [result] = await pool.query(
            "DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?",
            [cartId, productId]
        );
        if (result.affectedRows === 0) {
            return errorResponse(res, 404, "Sản phẩm không có trong giỏ hàng");
        }

        const cartView = await fetchCartView(cartId);
        return successResponse(res, { ...cartView, cartToken }, "Đã xoá sản phẩm khỏi giỏ hàng");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// DELETE /api/cart
const clearCart = async (req, res) => {
    try {
        const { cartId, cartToken } = await getOrCreateCartId(req);
        await pool.query("DELETE FROM cart_items WHERE cart_id = ?", [cartId]);
        const cartView = await fetchCartView(cartId);
        return successResponse(res, { ...cartView, cartToken }, "Đã xoá toàn bộ giỏ hàng");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Không thể xoá giỏ hàng");
    }
};

module.exports = {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
};