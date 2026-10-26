
const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/cart/:userId
router.get("/:userId", async (req, res) => {
  try {
    const [items] = await db.execute(
      `SELECT c.product_id, p.name, p.price, c.quantity,
              (p.price * c.quantity) AS subtotal
       FROM cart_items c
       JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?`,
      [req.params.userId]
    );

    res.json({ success: true, data: items });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil keranjang"
    });
  }
});

// POST /api/cart
// Body: { "userId": 1, "productId": 1, "quantity": 2 }
router.post("/", async (req, res) => {
  const { userId, productId, quantity } = req.body;

  if (
    !Number.isInteger(Number(userId)) || Number(userId) < 1 ||
    !Number.isInteger(Number(productId)) || Number(productId) < 1 ||
    !Number.isInteger(Number(quantity)) || Number(quantity) < 1
  ) {
    return res.status(400).json({
      success: false,
      message: "userId, productId, dan quantity harus bilangan bulat positif"
    });
  }

  try {
    const [products] = await db.execute(
      "SELECT id FROM products WHERE id = ?",
      [productId]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    await db.execute(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
      [userId, productId, quantity, quantity]
    );

    res.status(201).json({
      success: true,
      message: "Produk ditambahkan ke keranjang"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan produk ke keranjang"
    });
  }
});

// DELETE /api/cart/:userId/:productId
router.delete("/:userId/:productId", async (req, res) => {
  try {
    await db.execute(
      "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
      [req.params.userId, req.params.productId]
    );

    res.json({
      success: true,
      message: "Produk dihapus dari keranjang"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus produk"
    });
  }
});

module.exports = router;
