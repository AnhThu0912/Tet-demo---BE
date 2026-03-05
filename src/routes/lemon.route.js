const express = require("express");
const { createCheckout } = require("../controllers/lemon.controller");
const { lemonWebhook } = require("../controllers/lemon.webhook");
const { authenticate } = require("../middlewares/auth.middleware");

const router = express.Router();

// User/Admin đăng nhập mới được tạo link thanh toán; phân quyền xử lý trong controller
router.post("/create-checkout", express.json(), authenticate, createCheckout);

router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    lemonWebhook
);

module.exports = router;