const mysql = require("mysql2");

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

callbackPool.on("connection", (conn) => {
    conn.query("SET time_zone = '+07:00'");
});

const pool = callbackPool.promise();
module.exports = pool;