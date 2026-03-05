const express = require("express");
const cartController = require("../controllers/cart.controller");
const { getCart } = require("../controllers/cart.controller");

const router = express.Router();

// GET /api/cart
router.get("/", getCart);

// POST /api/cart/items
router.post("/items", cartController.addItem);

// PATCH /api/cart/items/:productId
router.patch("/items/:productId", cartController.updateItem);

// DELETE /api/cart/items/:productId
router.delete("/items/:productId", cartController.removeItem);

// DELETE /api/cart
router.delete("/", cartController.clearCart);

module.exports = router;