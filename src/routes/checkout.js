
const express = require("express");
const router = express.Router();
const db = require("../db");


const INVENTORY_URL =
  process.env.INVENTORY_SERVICE_URL ||
  "http://localhost:3003/api/inventory";
const activeCheckouts = new Set();

async function inventoryRequest(action, payload) {
  const response = await fetch(`${INVENTORY_URL}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  });

  const result = await response.json();

  if (!response.ok) {
    const error = new Error(
      result.message || "Permintaan Inventory Service gagal"
    );
    error.status = response.status;
    throw error;
  }

  return result;
}

router.post("/", async (req, res) => {
  const userId = Number(req.body.userId);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      success: false,
      message: "userId harus berupa bilangan bulat positif"
    });
  }

  if (activeCheckouts.has(userId)) {
    return res.status(409).json({
      success: false,
      message: "Checkout pengguna ini sedang diproses."
    });
  }

  activeCheckouts.add(userId);

  const reservedItems = [];
  let conn;
  let transactionStarted = false;
  let orderCommitted = false;

  try {
    // Baca keranjang tanpa FOR UPDATE agar tidak menahan
    // lock pada tabel products ketika memanggil Inventory Service.
    const [items] = await db.execute(
      `SELECT c.product_id, c.quantity, p.price, p.name
       FROM cart_items c
       JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?`,
      [userId]
    );

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Keranjang masih kosong"
      });
    }

    const total = items.reduce(
      (sum, item) =>
        sum + Number(item.price) * Number(item.quantity),
      0
    );

    // Reservasi stok dilakukan sebelum transaksi penyimpanan pesanan.
    for (const item of items) {
      await inventoryRequest("reserve", {
        product_id: Number(item.product_id),
        quantity: Number(item.quantity)
      });

      reservedItems.push({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        name: item.name
      });
    }

    // Transaksi database hanya untuk penyimpanan pesanan.
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (user_id, total, status)
       VALUES (?, ?, 'SUCCESS')`,
      [userId, total]
    );

    for (const item of items) {
      await conn.execute(
        `INSERT INTO order_items
         (order_id, product_id, quantity, price)
         VALUES (?, ?, ?, ?)`,
        [
          orderResult.insertId,
          item.product_id,
          item.quantity,
          item.price
        ]
      );
    }

    // Pastikan keranjang tidak berubah selama checkout.
    // Jika berubah, batalkan transaksi dan kompensasikan stok.
    for (const item of items) {
      const [current] = await conn.execute(
        `SELECT quantity FROM cart_items
         WHERE user_id = ? AND product_id = ?`,
        [userId, item.product_id]
      );

      if (
        current.length === 0 ||
        Number(current[0].quantity) !== Number(item.quantity)
      ) {
        throw new Error(
          "Keranjang berubah selama checkout. Silakan coba lagi."
        );
      }
    }

    await conn.execute(
      "DELETE FROM cart_items WHERE user_id = ?",
      [userId]
    );

    await conn.commit();
    transactionStarted = false;
    orderCommitted = true;

    return res.status(201).json({
      success: true,
      message: "Checkout berhasil",
      orderId: orderResult.insertId,
      total
    });
  } catch (error) {
    console.error("Checkout gagal:", error);

    if (conn && transactionStarted) {
      try {
        await conn.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        console.error("Rollback gagal:", rollbackError);
      }
    }

    // Kembalikan stok jika pesanan belum berhasil di-commit.
    if (!orderCommitted) {
      let releaseFailed = false;

      for (const item of [...reservedItems].reverse()) {
        try {
          await inventoryRequest("release", {
            product_id: item.product_id,
            quantity: item.quantity
          });
        } catch (releaseError) {
          releaseFailed = true;
          console.error(
            `Gagal mengembalikan stok ${item.name}:`,
            releaseError.message
          );
        }
      }

      if (releaseFailed) {
        return res.status(500).json({
          success: false,
          message:
            "Checkout gagal. Pengembalian stok perlu diperiksa secara manual."
        });
      }
    }

    if (error.status === 409) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Checkout gagal. Periksa log server sebelum mencoba lagi."
    });
  } finally {
    if (conn) conn.release();
    activeCheckouts.delete(userId);
  }
});

module.exports = router;
