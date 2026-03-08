const crypto = require("crypto");
const pool = require("../db/db");

async function lemonWebhook(req, res) {
    try {
        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        if (!secret) {
            console.error("Lemon webhook: LEMONSQUEEZY_WEBHOOK_SECRET chưa cấu hình");
            return res.status(500).send("Server config error");
        }

        const signature = req.get("X-Signature");
        if (!signature) {
            console.warn("Lemon webhook: thiếu header X-Signature");
            return res.status(401).send("Invalid signature");
        }

        const rawBody = req.body;
        if (!rawBody || !Buffer.isBuffer(rawBody)) {
            console.warn("Lemon webhook: body không hợp lệ (cần raw body)");
            return res.status(400).send("Bad request");
        }

        const digest = crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        if (digest !== signature) {
            console.warn("Lemon webhook: chữ ký không khớp");
            return res.status(401).send("Invalid signature");
        }

        const payload = JSON.parse(rawBody.toString("utf8"));
        const event = payload.meta?.event_name;

        if (event === "order_created") {
            const custom = payload.meta?.custom_data || {};
            const orderId = parseInt(custom.orderId, 10);
            const paymentId = parseInt(custom.paymentId, 10);
            const lemonOrderId = String(
                payload.data?.attributes?.order_number || payload.data?.id || ""
            );
            const lemonResourceId = String(payload.data?.id || "");

            if (!orderId || !paymentId) {
                console.warn("Lemon webhook: missing orderId or paymentId", custom);
                return res.status(200).send("OK");
            }

            // Verify số tiền thanh toán khớp với DB
            const lemonTotal = Number(payload.data?.attributes?.total) || 0;
            const [paymentRows] = await pool.query(
                "SELECT id, status, amount FROM payments WHERE id = ?",
                [paymentId]
            );

            if (paymentRows.length === 0) {
                console.warn("Lemon webhook: payment not found", paymentId);
                return res.status(200).send("OK");
            }

            const payment = paymentRows[0];

            // Idempotency: đã xử lý rồi thì bỏ qua
            if (payment.status === "succeeded") {
                console.log("Lemon webhook: payment", paymentId, "already succeeded, skip");
                return res.status(200).send("OK");
            }

            // LemonSqueezy trả total theo cents, DB lưu theo đơn vị gốc
            const expectedCents = Math.round(Number(payment.amount) * 100);
            if (lemonTotal > 0 && lemonTotal !== expectedCents) {
                console.error("Lemon webhook: amount mismatch!", { lemonTotal, expectedCents, paymentId, orderId });
                return res.status(200).send("OK");
            }

            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query(
                    "UPDATE payments SET status = 'succeeded', lemon_order_id = ?, lemon_resource_id = ? WHERE id = ?",
                    [lemonOrderId || null, lemonResourceId || null, paymentId]
                );
                await conn.query(
                    "UPDATE orders SET status = 'paid' WHERE id = ?",
                    [orderId]
                );
                await conn.commit();
                console.log("Lemon webhook: order", orderId, "& payment", paymentId, "lemonOrder", lemonOrderId, "updated to paid/succeeded");
            } catch (err) {
                await conn.rollback();
                console.error("Lemon webhook DB error:", err.message);
            } finally {
                conn.release();
            }
        } else if (event === "order_refunded") {
            const custom = payload.meta?.custom_data || {};
            const orderId = parseInt(custom.orderId, 10);
            const paymentId = parseInt(custom.paymentId, 10);

            if (!orderId || !paymentId) {
                console.warn("Lemon webhook refund: missing orderId or paymentId", custom);
                return res.status(200).send("OK");
            }

            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query(
                    "UPDATE payments SET status = 'refunded' WHERE id = ?",
                    [paymentId]
                );
                await conn.query(
                    "UPDATE orders SET status = 'refunded' WHERE id = ?",
                    [orderId]
                );
                await conn.commit();
                console.log("Lemon webhook: order", orderId, "& payment", paymentId, "refunded");
            } catch (err) {
                await conn.rollback();
                console.error("Lemon webhook refund DB error:", err.message);
            } finally {
                conn.release();
            }
        }

        return res.status(200).send("OK");
    } catch (err) {
        console.error("Lemon webhook error:", err);
        return res.status(500).send("OK");
    }
}

module.exports = { lemonWebhook };