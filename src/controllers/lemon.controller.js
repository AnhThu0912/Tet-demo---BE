const pool = require("../db/db");
const axios = require("axios");

/**
 * Tạo payment + gọi Lemon Squeezy API, trả về checkout URL.
 * Dùng chung cho createCheckout (route Lemon) và payOrder (route Orders khi user bấm "Thanh toán ngay").
 */
async function getCheckoutUrlForOrder(orderId, totalPrice) {
    const [result] = await pool.query(
        "INSERT INTO payments (order_id, amount, status, provider) VALUES (?, ?, 'created', 'lemonsqueezy')",
        [orderId, totalPrice]
    );
    const paymentId = result.insertId;

    const payload = {
        data: {
            type: "checkouts",
            attributes: {
                checkout_data: {
                    custom: {
                        orderId: String(orderId),
                        paymentId: String(paymentId),
                    },
                },
                test_mode: true,
            },
            relationships: {
                store: {
                    data: {
                        type: "stores",
                        id: process.env.LEMONSQUEEZY_STORE_ID,
                    },
                },
                variant: {
                    data: {
                        type: "variants",
                        id: process.env.LEMONSQUEEZY_VARIANT_ID,
                    },
                },
            },
        },
    };

    const response = await axios.post(
        "https://api.lemonsqueezy.com/v1/checkouts",
        payload,
        {
            headers: {
                Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
                Accept: "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
        }
    );

    return response.data.data.attributes.url;
}

async function createCheckout(req, res) {
    try {
        const { orderId } = req.body || {};

        if (!orderId) {
            return res
                .status(400)
                .json({ message: "orderId is required in body" });
        }

        const [orders] = await pool.query(
            "SELECT id, user_id, total_price, status FROM orders WHERE id=? LIMIT 1",
            [orderId]
        );

        if (!orders.length) {
            return res.status(404).json({ message: "Order not found" });
        }

        const order = orders[0];

        // Phân quyền: user chỉ được tạo checkout cho đơn của mình; admin được mọi đơn
        const currentUser = req.user;
        const orderUserId = order.user_id != null ? Number(order.user_id) : null;
        const currentUserId = currentUser?.id != null ? Number(currentUser.id) : null;
        if (currentUser?.role !== "admin" && orderUserId !== currentUserId) {
            return res.status(403).json({ message: "Không có quyền thanh toán đơn hàng này" });
        }

        if (order.status === "paid") {
            return res.status(400).json({ message: "Order already paid" });
        }

        const checkoutUrl = await getCheckoutUrlForOrder(order.id, order.total_price);
        return res.json({ checkoutUrl });
    } catch (err) {
        console.error("Create checkout error:", err.response?.data || err);
        res.status(500).json({ message: "Create checkout failed" });
    }
}

module.exports = { createCheckout, getCheckoutUrlForOrder };