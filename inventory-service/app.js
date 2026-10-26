
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("redis");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const redis = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

redis.on("error", (error) => {
    console.error("Redis error:", error.message);
});

const TTL = Number(process.env.REDIS_TTL || 10);

async function getProductStock(productId) {
    const cacheKey = `inventory:product:${productId}`;

    // Coba baca cache terlebih dahulu
    const cached = await redis.get(cacheKey);

    if (cached) {
        return {
            data: JSON.parse(cached),
            source: "redis"
        };
    }

    // Cache tidak tersedia: baca database
    const [rows] = await db.query(
        "SELECT id, name, stock FROM products WHERE id = ?",
        [productId]
    );

    if (rows.length === 0) {
        return null;
    }

    await redis.set(cacheKey, JSON.stringify(rows[0]), {
        EX: TTL
    });

    return {
        data: rows[0],
        source: "database"
    };
}

// Status service, database, dan Redis
app.get("/health", async (req, res) => {
    try {
        await db.query("SELECT 1");
        await redis.ping();

        res.json({
            service: "Inventory Service",
            status: "ok",
            database: "connected",
            redis: "connected"
        });
    } catch (error) {
        res.status(503).json({
            service: "Inventory Service",
            status: "error",
            message: error.message
        });
    }
});

// Melihat stok seluruh produk (tanpa cache untuk daftar)
app.get("/api/inventory", async (req, res) => {
    try {
        const [products] = await db.query(
            "SELECT id, name, stock FROM products ORDER BY id"
        );

        res.json({
            success: true,
            service: "Inventory Service",
            data: products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Melihat stok satu produk dengan Redis cache
app.get("/api/inventory/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: "ID produk tidak valid."
        });
    }

    try {
        const result = await getProductStock(id);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Produk tidak ditemukan."
            });
        }

        res.json({
            success: true,
            service: "Inventory Service",
            cache: result.source,
            data: result.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Reservasi stok secara atomik dan sinkronisasi cache
app.post("/api/inventory/reserve", async (req, res) => {
    const productId = Number(req.body.product_id);
    const quantity = Number(req.body.quantity);

    if (
        !Number.isInteger(productId) || productId < 1 ||
        !Number.isInteger(quantity) || quantity < 1
    ) {
        return res.status(400).json({
            success: false,
            message: "product_id dan quantity harus berupa bilangan bulat positif."
        });
    }

    try {
        const [result] = await db.query(
            `UPDATE products
             SET stock = stock - ?
             WHERE id = ? AND stock >= ?`,
            [quantity, productId, quantity]
        );

        if (result.affectedRows === 0) {
            const [rows] = await db.query(
                "SELECT id, stock FROM products WHERE id = ?",
                [productId]
            );

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Produk tidak ditemukan."
                });
            }

            // Pastikan cache tidak menyimpan stok lama
            await redis.del(`inventory:product:${productId}`);

            return res.status(409).json({
                success: false,
                message: "Stok tidak mencukupi.",
                available_stock: rows[0].stock
            });
        }

        // Hapus cache agar pembacaan berikutnya mengambil stok terbaru
        await redis.del(`inventory:product:${productId}`);

        const [rows] = await db.query(
            "SELECT id, name, stock FROM products WHERE id = ?",
            [productId]
        );

        res.json({
            success: true,
            message: "Stok berhasil dicadangkan.",
            data: rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


app.post("/api/inventory/release", async (req, res) => {
    const productId = Number(req.body.product_id);
    const quantity = Number(req.body.quantity);

    if (
        !Number.isInteger(productId) || productId < 1 ||
        !Number.isInteger(quantity) || quantity < 1
    ) {
        return res.status(400).json({
            success: false,
            message: "product_id dan quantity harus berupa bilangan bulat positif."
        });
    }

    try {
        const [result] = await db.query(
            `UPDATE products
             SET stock = stock + ?
             WHERE id = ?`,
            [quantity, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Produk tidak ditemukan."
            });
        }

        // Hapus cache agar pembacaan selanjutnya memakai stok terbaru
        await redis.del(`inventory:product:${productId}`);

        const [rows] = await db.query(
            "SELECT id, name, stock FROM products WHERE id = ?",
            [productId]
        );

        res.json({
            success: true,
            message: "Reservasi stok berhasil dikembalikan.",
            data: rows[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

const PORT = process.env.PORT || 3003;

async function startServer() {
    await redis.connect();

    app.listen(PORT, () => {
        console.log(
            `Inventory Service berjalan di http://localhost:${PORT}`
        );
        console.log("Redis terhubung.");
    });
}

startServer().catch((error) => {
    console.error("Gagal menjalankan Inventory Service:", error.message);
    process.exit(1);
});
