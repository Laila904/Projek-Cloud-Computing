
const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/products
router.get("/", async (req, res) => {
  try {
    const [products] = await db.query(
      "SELECT id, name, price, stock FROM products ORDER BY id"
    );

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar produk"
    });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
  try {
    const [products] = await db.execute(
      "SELECT id, name, price, stock FROM products WHERE id = ?",
      [req.params.id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    res.json({ success: true, data: products[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil produk"
    });
  }
});

module.exports = router;
