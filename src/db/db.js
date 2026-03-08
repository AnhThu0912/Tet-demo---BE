const mysql = require("mysql2");

// Tạo callback pool để dùng event 'connection'
const callbackPool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "tet_db",
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "+07:00",
});

// Set timezone VN cho mỗi connection mới trong pool
callbackPool.on("connection", (conn) => {
    conn.query("SET time_zone = '+07:00'");
});

// Export promise-based pool
const pool = callbackPool.promise();
module.exports = pool;