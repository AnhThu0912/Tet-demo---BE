const express = require("express");
const {
    checkout,
    getOrders,
    getOrderDetail,
    payOrder,
    createPayment,
    confirmPayment,
    failPayment,
} = require("../controllers/order.controller");
const {
    authenticate,
    authorizeRole,
} = require("../middlewares/auth.middleware");

const router = express.Router();

// tất cả route orders yêu cầu đăng nhập
router.use(authenticate);

// user tạo order từ cart của mình
router.post("/checkout", checkout);

// admin: tất cả orders; user: chỉ đơn của mình (logic trong controller)
router.get("/", getOrders);

// chi tiết order: logic phân quyền xử lý trong controller
router.get("/:id", getOrderDetail);

// user: trả checkoutUrl (Lemon); admin: đánh dấu đã thanh toán (logic trong controller)
router.post("/:id/pay", payOrder);

// user: tạo payment/checkout cho đơn của mình; admin: mọi đơn (logic trong controller)
router.post("/:id/payments", createPayment);
// fake gateway: user confirm/fail payment của đơn của mình; admin: mọi payment (logic trong controller)
router.post("/payments/:id/confirm", confirmPayment);
router.post("/payments/:id/fail", failPayment);

module.exports = router;