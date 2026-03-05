const mysql = require("mysql2/promise");
const products = require("../data/products.json");

(async () => {
    const connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "Anhthu@0912", // 🔴 đổi
        database: "tet_db"         // 🔴 đổi đúng tên DB
    });

    for (const p of products) {
        await connection.execute(
            `
      INSERT INTO products (name, price, category, is_active, image)
      VALUES (?, ?, ?, ?, ?)
      `,
            [
                p.name,
                p.price,
                p.category,
                p.isActive,
                p.image || null
            ]
        );
    }

    console.log("✅ Import products thành công!");
    await connection.end();
})();