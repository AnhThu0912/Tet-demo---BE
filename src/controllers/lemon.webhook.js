const crypto = require("crypto");
const pool = require("../db/db");

async function lemonWebhook(req, res) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = req.get("X-Signature");

    const digest = crypto
        .createHmac("sha256", secret)
        .update(req.body)
        .digest("hex");

    if (digest !== signature) {
        return res.status(401).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload.meta.event_name;

    if (event === "order_created") {
        const custom = payload.meta.custom_data || {};
        const orderId = parseInt(custom.orderId, 10);
        const paymentId = parseInt(custom.paymentId, 10);

        if (!orderId || !paymentId) {
            console.warn("Lemon webhook: missing orderId or paymentId", custom);
            return res.status(200).send("OK");
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                "UPDATE payments SET status = 'succeeded' WHERE id = ?",
                [paymentId]
            );
            await conn.query(
                "UPDATE orders SET status = 'paid' WHERE id = ?",
                [orderId]
            );
            await conn.commit();
            console.log("Lemon webhook: order", orderId, "& payment", paymentId, "updated to paid/succeeded");
        } catch (err) {
            await conn.rollback();
            console.error("Lemon webhook error:", err);
        } finally {
            conn.release();
        }
    }

    return res.status(200).send("OK");
}

module.exports = { lemonWebhook };