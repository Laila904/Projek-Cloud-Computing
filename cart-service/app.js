
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const DEFAULT_USER_ID = 1;

// Cek status service dan koneksi database
app.get("/health", async (req, res) => {
    try {
        await db.query("SELECT 1");

        res.json({
            service: "Shopping Cart Service",
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        res.status(500).json({
            service: "Shopping Cart Service",
            status: "error",
            message: error.message
        });
    }
});

// Melihat keranjang pengguna
app.get("/api/cart", async (req, res) => {
    try {
        const [items] = await db.query(
            `SELECT
                c.id,
                c.product_id,
                p.name,
                p.price,
                c.quantity,
                (p.price * c.quantity) AS subtotal
             FROM cart_items c
             JOIN products p ON p.id = c.product_id
             WHERE c.user_id = ?
             ORDER BY c.id DESC`,
            [DEFAULT_USER_ID]
        );

        res.json({
            success: true,
            service: "Shopping Cart Service",
            data: items
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Menambahkan produk ke keranjang
app.post("/api/cart", async (req, res) => {
    const productId = Number(req.body.product_id);
    const quantity = Number(req.body.quantity ?? 1);

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
        const [products] = await db.query(
            "SELECT id, stock FROM products WHERE id = ?",
            [productId]
        );

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Produk tidak ditemukan."
            });
        }

        const [existingItems] = await db.query(
            `SELECT id, quantity
             FROM cart_items
             WHERE user_id = ? AND product_id = ?
             LIMIT 1`,
            [DEFAULT_USER_ID, productId]
        );

        const existingQuantity = existingItems.length > 0
            ? Number(existingItems[0].quantity)
            : 0;

        const newQuantity = existingQuantity + quantity;

        if (newQuantity > Number(products[0].stock)) {
            return res.status(409).json({
                success: false,
                message: "Jumlah di keranjang melebihi stok tersedia."
            });
        }

        if (existingItems.length > 0) {
            await db.query(
                "UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?",
                [newQuantity, existingItems[0].id, DEFAULT_USER_ID]
            );
        } else {
            await db.query(
                `INSERT INTO cart_items (user_id, product_id, quantity)
                 VALUES (?, ?, ?)`,
                [DEFAULT_USER_ID, productId, quantity]
            );
        }

        res.status(201).json({
            success: true,
            message: "Produk berhasil ditambahkan ke keranjang."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Mengubah jumlah produk di keranjang
app.put("/api/cart/:id", async (req, res) => {
    const cartId = Number(req.params.id);
    const quantity = Number(req.body.quantity);

    if (
        !Number.isInteger(cartId) || cartId < 1 ||
        !Number.isInteger(quantity) || quantity < 1
    ) {
        return res.status(400).json({
            success: false,
            message: "ID keranjang dan quantity harus berupa bilangan bulat positif."
        });
    }

    try {
        const [items] = await db.query(
            `SELECT c.id, c.product_id, p.stock
             FROM cart_items c
             JOIN products p ON p.id = c.product_id
             WHERE c.id = ? AND c.user_id = ?`,
            [cartId, DEFAULT_USER_ID]
        );

        if (items.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Item keranjang tidak ditemukan."
            });
        }

        if (quantity > Number(items[0].stock)) {
            return res.status(409).json({
                success: false,
                message: "Jumlah melebihi stok tersedia."
            });
        }

        await db.query(
            "UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?",
            [quantity, cartId, DEFAULT_USER_ID]
        );

        res.json({
            success: true,
            message: "Jumlah produk berhasil diperbarui."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Menghapus item milik pengguna
app.delete("/api/cart/:id", async (req, res) => {
    const cartId = Number(req.params.id);

    if (!Number.isInteger(cartId) || cartId < 1) {
        return res.status(400).json({
            success: false,
            message: "ID keranjang tidak valid."
        });
    }

    try {
        const [result] = await db.query(
            "DELETE FROM cart_items WHERE id = ? AND user_id = ?",
            [cartId, DEFAULT_USER_ID]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Item keranjang tidak ditemukan."
            });
        }

        res.json({
            success: true,
            message: "Item berhasil dihapus dari keranjang."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
    console.log(`Shopping Cart Service berjalan di http://localhost:${PORT}`);
});
