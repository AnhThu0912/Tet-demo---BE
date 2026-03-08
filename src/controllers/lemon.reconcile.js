const axios = require("axios");
const pool = require("../db/db");

/**
 * Reconcile pending orders with LemonSqueezy.
 * Tìm các payments có provider=lemonsqueezy, status=created (đã redirect user đi thanh toán nhưng chưa nhận webhook).
 * Gọi LemonSqueezy API kiểm tra, nếu đã paid → update DB.
 *
 * GET /api/lemon/reconcile (admin only)
 */
async function reconcilePendingOrders(req, res) {
    try {
        // 1) Tìm payments lemonsqueezy đang chờ (created) mà order vẫn pending
        const [pendingPayments] = await pool.query(`
            SELECT p.id AS paymentId, p.order_id AS orderId, p.amount, p.created_at
            FROM payments p
            JOIN orders o ON o.id = p.order_id
            WHERE p.provider = 'lemonsqueezy'
              AND p.status = 'created'
              AND o.status = 'pending'
            ORDER BY p.created_at ASC
        `);

        if (pendingPayments.length === 0) {
            return res.json({ message: "Không có order pending nào cần reconcile", reconciled: [] });
        }

        // 2) Gọi LemonSqueezy API lấy danh sách orders gần đây
        const apiKey = process.env.LEMONSQUEEZY_API_KEY;
        const storeId = process.env.LEMONSQUEEZY_STORE_ID;

        if (!apiKey || !storeId) {
            return res.status(500).json({ message: "Thiếu LEMONSQUEEZY_API_KEY hoặc STORE_ID" });
        }

        // Lấy thời gian payment cũ nhất để filter, tránh query quá nhiều
        const oldestDate = pendingPayments[0].created_at;
        const filterFrom = new Date(oldestDate).toISOString();

        // Fetch tất cả pages từ LemonSqueezy API
        let lemonOrders = [];
        let nextUrl = `https://api.lemonsqueezy.com/v1/orders?filter[store_id]=${storeId}&filter[created_at_gte]=${filterFrom}&sort=-created_at&page[size]=50`;

        while (nextUrl) {
            const lemonResponse = await axios.get(nextUrl, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/vnd.api+json",
                },
            });
            lemonOrders = lemonOrders.concat(lemonResponse.data.data || []);
            nextUrl = lemonResponse.data.links?.next || null;
        }

        // 3) Match và update
        const reconciled = [];

        for (const payment of pendingPayments) {
            // Tìm lemon order có custom_data.orderId khớp
            const matched = lemonOrders.find((lo) => {
                const custom = lo.attributes?.first_order_item?.custom_data;
                return custom && String(custom.orderId) === String(payment.orderId);
            });

            if (matched && matched.attributes.status === "paid") {
                const conn = await pool.getConnection();
                try {
                    await conn.beginTransaction();
                    await conn.query("UPDATE payments SET status = 'succeeded' WHERE id = ?", [payment.paymentId]);
                    await conn.query("UPDATE orders SET status = 'paid' WHERE id = ?", [payment.orderId]);
                    await conn.commit();
                    reconciled.push({
                        orderId: payment.orderId,
                        paymentId: payment.paymentId,
                        lemonOrderId: matched.id,
                    });
                } catch (err) {
                    await conn.rollback();
                    console.error("Reconcile DB error for order", payment.orderId, err.message);
                } finally {
                    conn.release();
                }
            }
        }

        return res.json({
            message: `Reconcile xong: ${reconciled.length}/${pendingPayments.length} orders đã được cập nhật`,
            pending: pendingPayments.length,
            reconciled,
        });
    } catch (err) {
        console.error("Reconcile error:", err.response?.data || err.message);
        return res.status(500).json({ message: "Reconcile failed", error: err.message });
    }
}

module.exports = { reconcilePendingOrders };
