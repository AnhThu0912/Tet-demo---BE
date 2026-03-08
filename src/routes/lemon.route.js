const express = require("express");
const { createCheckout } = require("../controllers/lemon.controller");
const { lemonWebhook } = require("../controllers/lemon.webhook");
const { reconcilePendingOrders } = require("../controllers/lemon.reconcile");
const { authenticate, authorizeRole } = require("../middlewares/auth.middleware");

const router = express.Router();

// User/Admin đăng nhập mới được tạo link thanh toán; phân quyền xử lý trong controller
router.post("/create-checkout", express.json(), authenticate, createCheckout);

// Admin: kiểm tra và đồng bộ orders pending với LemonSqueezy (xử lý miss webhook)
router.get("/reconcile", express.json(), authenticate, authorizeRole("admin"), reconcilePendingOrders);

router.post(
    "/webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    lemonWebhook
);

module.exports = router;