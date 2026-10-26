
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// Memeriksa koneksi database
app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");

    res.json({
      service: "Product Catalog Service",
      status: "ok",
      database: "connected"
    });
  } catch (error) {
    console.error(error.message);

    res.status(503).json({
      service: "Product Catalog Service",
      status: "error",
      database: "disconnected"
    });
  }
});

// Mengambil seluruh produk
app.get("/api/products", async (req, res) => {
  try {
    const [products] = await db.query(
      "SELECT id, name, price, stock FROM products ORDER BY id"
    );

    res.json({
      success: true,
      service: "Product Catalog Service",
      data: products
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar produk"
    });
  }
});

// Mengambil detail produk berdasarkan ID
app.get("/api/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "ID produk tidak valid"
      });
    }

    const [products] = await db.execute(
      "SELECT id, name, price, stock FROM products WHERE id = ?",
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    res.json({
      success: true,
      service: "Product Catalog Service",
      data: products[0]
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail produk"
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(
    `Product Catalog Service berjalan di http://localhost:${PORT}`
  );
});
