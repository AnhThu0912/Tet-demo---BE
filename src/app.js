const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// CORS: cho phép FE (local + production). Trên Railway set CORS_ORIGIN = URL FE (vd: https://tet-demo-fe.vercel.app — không cần dấu / cuối)
const rawOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"];
const allowedOrigins = rawOrigins.map((o) => o.replace(/\/+$/, ""));

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) return callback(null, true);
            const normalizedOrigin = origin.replace(/\/+$/, "");
            if (allowedOrigins.includes("*") || allowedOrigins.includes(normalizedOrigin)) {
                return callback(null, true);
            }
            callback(null, false);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma", "X-Cart-Token"],
    })
);

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
