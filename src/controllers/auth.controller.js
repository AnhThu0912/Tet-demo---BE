const pool = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function login(req, res) {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
    }

    const [rows] = await pool.query(
        "SELECT id, email, password_hash, role FROM users WHERE email=? LIMIT 1",
        [email]
    );

    if (!rows.length) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);
    // Nếu tạm thời chưa hash, có thể dùng: const ok = password === user.password_hash;
    if (!ok) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role },
    });
}

module.exports = { login };