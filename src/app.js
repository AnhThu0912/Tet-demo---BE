const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());

// middleware logger
const logger = require("./middlewares/logger.middleware");
app.use(logger);

// lemon route
const lemonRoute = require("./routes/lemon.route");
app.use("/api/lemon", lemonRoute);

// middleware đọc json
app.use(express.json());

// images
app.use("/images", express.static(path.join(__dirname, "../public/images")));

// product route
const productRoute = require("./routes/product.route");
app.use("/api/products", productRoute);

//cart route
const cartRoute = require("./routes/cart.route");
app.use("/api/cart", cartRoute);

// order route
const orderRoute = require("./routes/order.route");
app.use("/api/orders", orderRoute);

// auth route
const authRoute = require("./routes/auth.route");
app.use("/api/auth", authRoute);

// routes
const healthRoute = require("./routes/health.route");
app.use("/api/health", healthRoute);

module.exports = app;
