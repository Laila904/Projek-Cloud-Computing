
require("dotenv").config();

const express = require("express");
const path = require("path");
const db = require("./db");

const productsRouter = require("./routes/products");
const cartRouter = require("./routes/cart");
const checkoutRouter = require("./routes/checkout");

const app = express();

app.use(express.json());

// Menampilkan frontend dari folder public
app.use(express.static(path.join(__dirname, "../public")));

// Memeriksa koneksi database
app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      database: "connected"
    });
  } catch (error) {
    console.error(error);
    res.status(503).json({
      status: "error",
      database: "disconnected"
    });
  }
});

// API aplikasi monolitik
app.use("/api/products", productsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/checkout", checkoutRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`FlashSale berjalan di http://localhost:${PORT}`);
});
