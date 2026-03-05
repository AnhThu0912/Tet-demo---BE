const pool = require("../db/mysql");
const { successResponse, errorResponse } = require("../utils/response");
const { getCheckoutUrlForOrder } = require("./lemon.controller");

// POST /api/orders/checkout
const checkout = async (req, res) => {
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1) Lấy cart hiện tại + price từ products
        const cartSql = `
      SELECT
        ci.product_id AS productId,
        ci.quantity,
        p.price
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
    `;
        const [cartRows] = await conn.query(cartSql);

        if (cartRows.length === 0) {
            await conn.rollback();
            return errorResponse(res, 400, "Giỏ hàng đang trống");
        }

        // 2) Tính totals
        const totalQuantity = cartRows.reduce(
            (sum, r) => sum + Number(r.quantity || 0),
            0
        );

        const totalPrice = cartRows.reduce(
            (sum, r) => sum + Number(r.price || 0) * Number(r.quantity || 0),
            0
        );

        // 3) Insert orders (gắn với user hiện tại nếu có)
        const userId = req.user?.id || null;
        const [orderResult] = await conn.query(
            "INSERT INTO orders (user_id, total_quantity, total_price, status) VALUES (?, ?, ?, ?)",
            [userId, totalQuantity, totalPrice, "pending"]
        );
        const orderId = orderResult.insertId;

        // 4) Insert order_items (batch)
        const itemsValues = cartRows.map((r) => {
            const qty = Number(r.quantity || 0);
            const unitPrice = Number(r.price || 0);
            const lineTotal = unitPrice * qty;
            return [orderId, r.productId, qty, unitPrice, lineTotal];
        });

        await conn.query(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total) VALUES ?",
            [itemsValues]
        );

        // 5) Clear cart
        await conn.query("TRUNCATE TABLE cart_items");

        // 6) Commit
        await conn.commit();

        return successResponse(res, { orderId }, "Checkout thành công");
    } catch (err) {
        try {
            await conn.rollback();
        } catch (_) { }

        return errorResponse(res, 500, err?.message || "Server error");
    } finally {
        conn.release();
    }
};

// GET /api/orders — admin: tất cả; user: chỉ đơn của mình (user_id = req.user.id)
const getOrders = async (req, res) => {
    try {
        const page = Number(req.query?.page || 1);
        const limit = Number(req.query?.limit || 10);

        const safePage = Number.isFinite(page) && page > 0 ? page : 1;
        const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
        const offset = (safePage - 1) * safeLimit;

        const isAdmin = req.user?.role === "admin";
        let listSql;
        let countSql;
        let listParams;
        let countParams;

        if (isAdmin) {
            listSql = `
                SELECT id, user_id, total_quantity, total_price, status, created_at
                FROM orders
                ORDER BY id DESC
                LIMIT ? OFFSET ?
            `;
            listParams = [safeLimit, offset];
            countSql = "SELECT COUNT(*) AS total FROM orders";
            countParams = [];
        } else {
            listSql = `
                SELECT id, user_id, total_quantity, total_price, status, created_at
                FROM orders
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ? OFFSET ?
            `;
            listParams = [req.user.id, safeLimit, offset];
            countSql = "SELECT COUNT(*) AS total FROM orders WHERE user_id = ?";
            countParams = [req.user.id];
        }

        const [rows] = await pool.query(listSql, listParams);
        const [[countRow]] = await pool.query(countSql, countParams);

        return successResponse(res, {
            items: rows,
            pagination: {
                page: safePage,
                limit: safeLimit,
                total: countRow.total,
                totalPages: Math.ceil(countRow.total / safeLimit),
            },
        });
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// GET /api/orders/:id
const getOrderDetail = async (req, res) => {
    try {
        const orderId = Number(req.params?.id);
        if (!Number.isInteger(orderId) || orderId <= 0) {
            return errorResponse(res, 400, "orderId không hợp lệ");
        }

        // 1) Lấy order kèm user_id
        const [orders] = await pool.query(
            `
      SELECT id, user_id, total_quantity, total_price, status, created_at
      FROM orders
      WHERE id = ?
      `,
            [orderId]
        );

        if (orders.length === 0) {
            return errorResponse(res, 404, "Đơn hàng không tồn tại");
        }

        const order = orders[0];

        // 1.1) Phân quyền: admin xem mọi order, user chỉ xem order của mình (so sánh số)
        const currentUser = req.user;
        if (!currentUser) {
            return errorResponse(res, 401, "Unauthorized");
        }
        const orderUserId = order.user_id != null ? Number(order.user_id) : null;
        const currentUserId = Number(currentUser.id);
        if (currentUser.role !== "admin" && orderUserId !== currentUserId) {
            return errorResponse(res, 403, "Không có quyền xem đơn hàng này");
        }

        // 2) Lấy items + join sang products để lấy name/image/category
        const [items] = await pool.query(
            `
      SELECT
        oi.id,
        oi.product_id AS productId,
        p.name,
        p.category,
        p.image,
        oi.quantity,
        oi.unit_price AS unitPrice,
        oi.line_total AS lineTotal
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
      `,
            [orderId]
        );

        return successResponse(res, { ...order, items });
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// POST /api/orders/:id/pay — admin: đánh dấu paid; user: trả checkoutUrl (Lemon) để FE redirect
const payOrder = async (req, res) => {
    try {
        const orderId = Number(req.params?.id);

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return errorResponse(res, 400, "orderId không hợp lệ");
        }

        const [orders] = await pool.query(
            "SELECT id, user_id, total_price, status FROM orders WHERE id = ?",
            [orderId]
        );

        if (orders.length === 0) {
            return errorResponse(res, 404, "Đơn hàng không tồn tại");
        }

        const order = orders[0];

        if (order.status === "paid") {
            return errorResponse(res, 400, "Đơn hàng đã được thanh toán");
        }

        if (order.status === "cancelled") {
            return errorResponse(res, 400, "Đơn hàng đã bị huỷ");
        }

        const isAdmin = req.user?.role === "admin";
        const orderUserId = order.user_id != null ? Number(order.user_id) : null;
        const currentUserId = req.user?.id != null ? Number(req.user.id) : null;

        if (!isAdmin && orderUserId !== currentUserId) {
            return errorResponse(res, 403, "Không có quyền thanh toán đơn hàng này");
        }

        // User: trả link Lemon Squeezy để FE redirect; Admin: đánh dấu đã thanh toán
        if (!isAdmin) {
            const checkoutUrl = await getCheckoutUrlForOrder(orderId, order.total_price);
            return successResponse(res, { checkoutUrl, orderId }, "Redirect to payment");
        }

        await pool.query(
            "UPDATE orders SET status = 'paid' WHERE id = ?",
            [orderId]
        );

        return successResponse(res, { orderId }, "Thanh toán thành công");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// POST /api/orders/:id/payments — user chỉ được tạo payment cho đơn của mình; admin: mọi đơn
const createPayment = async (req, res) => {
    try {
        const orderId = Number(req.params?.id);
        if (!Number.isInteger(orderId) || orderId <= 0) {
            return errorResponse(res, 400, "orderId không hợp lệ");
        }

        const [orders] = await pool.query(
            "SELECT id, user_id, total_price, status FROM orders WHERE id = ?",
            [orderId]
        );

        if (orders.length === 0) return errorResponse(res, 404, "Đơn hàng không tồn tại");

        const order = orders[0];

        // Phân quyền: user tạo payment cho đơn của mình hoặc đơn chưa có user_id (đơn cũ); admin: mọi đơn
        const currentUser = req.user;
        const orderUserId = order.user_id != null ? Number(order.user_id) : null;
        const currentUserId = currentUser?.id != null ? Number(currentUser.id) : null;
        const isOwner = orderUserId === null || orderUserId === currentUserId;
        if (currentUser?.role !== "admin" && !isOwner) {
            return errorResponse(res, 403, "Không có quyền thanh toán đơn hàng này");
        }

        if (order.status === "paid") {
            return errorResponse(res, 400, "Đơn hàng đã thanh toán");
        }
        if (order.status === "cancelled") {
            return errorResponse(res, 400, "Đơn hàng đã huỷ");
        }

        // Tạo payment record
        const amount = order.total_price; // snapshot tổng tiền của order
        const [result] = await pool.query(
            "INSERT INTO payments (order_id, amount, status, provider) VALUES (?, ?, 'created', 'mock')",
            [orderId, amount]
        );

        return successResponse(res, { paymentId: result.insertId, orderId, amount }, "Tạo payment thành công");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

// POST /api/orders/:id/payment/confirm
const confirmPayment = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const paymentId = Number(req.params?.id);
        if (!Number.isInteger(paymentId) || paymentId <= 0) {
            return errorResponse(res, 400, "paymentId không hợp lệ");
        }

        await conn.beginTransaction();

        // Lock payment row để tránh confirm 2 lần đồng thời
        const [payRows] = await conn.query(
            "SELECT id, order_id, amount, status FROM payments WHERE id = ? FOR UPDATE",
            [paymentId]
        );

        if (payRows.length === 0) {
            await conn.rollback();
            return errorResponse(res, 404, "Payment không tồn tại");
        }

        const payment = payRows[0];

        // Lock order row + lấy user_id để phân quyền
        const [orderRows] = await conn.query(
            "SELECT id, user_id, status FROM orders WHERE id = ? FOR UPDATE",
            [payment.order_id]
        );
        if (orderRows.length === 0) {
            await conn.rollback();
            return errorResponse(res, 404, "Order không tồn tại");
        }
        const order = orderRows[0];

        // Phân quyền: user chỉ confirm payment của đơn của mình; admin: mọi payment. Order không có user_id (null) thì cho phép user đã đăng nhập confirm (tương thích đơn cũ).
        const isAdmin = req.user?.role === "admin";
        const orderUserId = order.user_id != null ? Number(order.user_id) : null;
        const currentUserId = req.user?.id != null ? Number(req.user.id) : null;
        const isOwner = orderUserId === null || orderUserId === currentUserId;
        if (!isAdmin && !isOwner) {
            await conn.rollback();
            return errorResponse(res, 403, "Không có quyền xác nhận payment này");
        }

        // Idempotent: đã succeeded rồi thì trả OK luôn
        if (payment.status === "succeeded") {
            await conn.commit();
            return successResponse(res, { paymentId, orderId: payment.order_id }, "Payment đã được xác nhận trước đó");
        }
        if (payment.status === "failed") {
            await conn.rollback();
            return errorResponse(res, 400, "Payment đã failed, không thể confirm");
        }

        if (order.status === "paid") {
            // Order paid rồi => set payment succeeded để đồng bộ, hoặc trả lỗi. Mình đồng bộ cho demo.
            await conn.query("UPDATE payments SET status = 'succeeded' WHERE id = ?", [paymentId]);
            await conn.commit();
            return successResponse(res, { paymentId, orderId: payment.order_id }, "Order đã paid, đồng bộ payment succeeded");
        }
        if (order.status === "cancelled") {
            await conn.query("UPDATE payments SET status = 'failed' WHERE id = ?", [paymentId]);
            await conn.commit();
            return errorResponse(res, 400, "Order đã huỷ, payment fail");
        }

        // 1) Update payment succeeded
        await conn.query("UPDATE payments SET status = 'succeeded' WHERE id = ?", [paymentId]);

        // 2) Update order paid
        await conn.query("UPDATE orders SET status = 'paid' WHERE id = ?", [payment.order_id]);

        await conn.commit();
        return successResponse(res, { paymentId, orderId: payment.order_id }, "Thanh toán thành công");
    } catch (err) {
        try { await conn.rollback(); } catch (_) { }
        return errorResponse(res, 500, err?.message || "Server error");
    } finally {
        conn.release();
    }
};

// POST /api/orders/payments/:id/fail — user chỉ fail payment của đơn của mình; admin: mọi payment
const failPayment = async (req, res) => {
    try {
        const paymentId = Number(req.params?.id);
        if (!Number.isInteger(paymentId) || paymentId <= 0) {
            return errorResponse(res, 400, "paymentId không hợp lệ");
        }

        const [payRows] = await pool.query(
            "SELECT id, order_id, status FROM payments WHERE id = ?",
            [paymentId]
        );
        if (payRows.length === 0) {
            return errorResponse(res, 404, "Payment không tồn tại");
        }
        const payment = payRows[0];

        const [orderRows] = await pool.query(
            "SELECT id, user_id FROM orders WHERE id = ?",
            [payment.order_id]
        );
        if (orderRows.length === 0) {
            return errorResponse(res, 404, "Order không tồn tại");
        }
        const order = orderRows[0];

        const isAdmin = req.user?.role === "admin";
        const orderUserId = order.user_id != null ? Number(order.user_id) : null;
        const currentUserId = req.user?.id != null ? Number(req.user.id) : null;
        const isOwner = orderUserId === null || orderUserId === currentUserId;
        if (!isAdmin && !isOwner) {
            return errorResponse(res, 403, "Không có quyền thao tác payment này");
        }

        const [result] = await pool.query(
            "UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'created'",
            [paymentId]
        );

        if (result.affectedRows === 0) {
            return errorResponse(res, 400, "Payment không ở trạng thái created (không thể fail)");
        }

        return successResponse(res, { paymentId }, "Payment failed (giả lập)");
    } catch (err) {
        return errorResponse(res, 500, err?.message || "Server error");
    }
};

module.exports = { checkout, getOrders, getOrderDetail, payOrder, createPayment, confirmPayment, failPayment };