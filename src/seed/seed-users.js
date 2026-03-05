const bcrypt = require("bcryptjs");
require("dotenv").config();
const pool = require("../db/db");

async function main() {
    const adminPassword = "admin123";
    const userPassword = "user123";

    const adminHash = await bcrypt.hash(adminPassword, 10);
    const userHash = await bcrypt.hash(userPassword, 10);

    await pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
        ["admin@example.com", adminHash, "admin"]
    );

    await pool.query(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
        ["user@example.com", userHash, "user"]
    );

    console.log("Seeded admin & user");
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});