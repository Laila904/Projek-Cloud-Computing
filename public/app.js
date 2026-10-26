
const USER_ID = 1;

// API Kubernetes melalui port-forward
const CATALOG_API = "http://localhost:33001/api";
const CART_API = "http://localhost:33002/api";

const productGrid = document.getElementById("productGrid");
const productCount = document.getElementById("productCount");
const productMessage = document.getElementById("productMessage");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const cartMessage = document.getElementById("cartMessage");
const checkoutButton = document.getElementById("checkoutButton");

let products = [];
let cart = [];

const rupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value));

const productEmoji = (name) => {
  const value = name.toLowerCase();

  if (value.includes("mouse")) return "🖱️";
  if (value.includes("keyboard")) return "⌨️";
  if (value.includes("headset")) return "🎧";
  if (value.includes("hub")) return "🔌";

  return "📦";
};

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `message ${type}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Server memberikan respons yang tidak valid.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Permintaan gagal.");
  }

  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// =========================
// CATALOG SERVICE
// =========================

async function loadProducts() {
  try {
    const result = await request(`${CATALOG_API}/products`);

    products = result.data || [];
    renderProducts();
    showMessage(productMessage, "");
  } catch (error) {
    productGrid.textContent = "Gagal memuat produk.";
    showMessage(
      productMessage,
      `${error.message} Pastikan Catalog Service Kubernetes aktif.`,
      "error"
    );
  }
}

function renderProducts() {
  productCount.textContent = `${products.length} produk`;

  if (products.length === 0) {
    productGrid.textContent = "Produk belum tersedia.";
    return;
  }

  productGrid.innerHTML = products.map((product) => `
    <article class="product-card">
      <div class="product-art">
        <span class="sale-badge">FLASH SALE</span>
        <span aria-hidden="true">${productEmoji(product.name)}</span>
      </div>
      <div class="product-info">
        <h3>${escapeHtml(product.name)}</h3>
        <p class="price">${rupiah(product.price)}</p>
        <p class="stock">Stok tersedia: ${product.stock}</p>
        <button
          class="add-button"
          data-add="${product.id}"
          ${Number(product.stock) < 1 ? "disabled" : ""}>
          ${Number(product.stock) < 1 ? "Stok habis" : "+ Keranjang"}
        </button>
      </div>
    </article>
  `).join("");
}

// =========================
// CART SERVICE
// =========================

async function loadCart() {
  try {
    const result = await request(`${CART_API}/cart`);

    cart = result.data || [];
    renderCart();
    showMessage(cartMessage, "");
  } catch (error) {
    showMessage(
      cartMessage,
      `${error.message} Pastikan Cart Service Kubernetes aktif.`,
      "error"
    );
  }
}

function renderCart() {
  const count = cart.reduce(
    (sum, item) => sum + Number(item.quantity),
    0
  );

  const total = cart.reduce(
    (sum, item) => sum + Number(item.subtotal),
    0
  );

  cartCount.textContent = count;
  cartTotal.textContent = rupiah(total);
  checkoutButton.disabled = cart.length === 0;

  if (cart.length === 0) {
    cartItems.innerHTML =
      '<p class="muted">Keranjang masih kosong.</p>';
    return;
  }

  cartItems.innerHTML = cart.map((item) => `
    <div class="cart-item">
      <div class="cart-icon" aria-hidden="true">
        ${productEmoji(item.name)}
      </div>
      <div class="cart-item-info">
        <strong>${escapeHtml(item.name)}</strong>
        <span>
          ${rupiah(item.price)} × ${item.quantity}
          = ${rupiah(item.subtotal)}
        </span>
      </div>
      <button class="remove-button" data-remove="${item.id}">
        Hapus
      </button>
    </div>
  `).join("");
}

// Menambahkan produk ke keranjang
productGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add]");

  if (!button) return;

  button.disabled = true;

  try {
    await request(`${CART_API}/cart`, {
      method: "POST",
      body: JSON.stringify({
        product_id: Number(button.dataset.add),
        quantity: 1
      })
    });

    await loadCart();

    showMessage(
      productMessage,
      "Produk ditambahkan ke keranjang.",
      "success"
    );
  } catch (error) {
    showMessage(productMessage, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

// Menghapus produk dari keranjang
cartItems.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove]");

  if (!button) return;

  button.disabled = true;

  try {
    await request(
      `${CART_API}/cart/${button.dataset.remove}`,
      { method: "DELETE" }
    );

    await loadCart();

    showMessage(
      cartMessage,
      "Produk dihapus dari keranjang.",
      "success"
    );
  } catch (error) {
    showMessage(cartMessage, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

// =========================
// CHECKOUT
// =========================

checkoutButton.addEventListener("click", async () => {
  if (cart.length === 0) return;

  checkoutButton.disabled = true;
  showMessage(cartMessage, "Memproses checkout...");

  try {
    // Mengarah ke FlashSale App pada origin halaman yang dibuka.
    const result = await request("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ userId: USER_ID })
    });

    showMessage(
      cartMessage,
      `Checkout berhasil! Pesanan #${result.orderId}, total ${rupiah(result.total)}.`,
      "success"
    );

    await loadProducts();
    await loadCart();
  } catch (error) {
    showMessage(cartMessage, error.message, "error");

    await loadProducts();
    await loadCart();
  } finally {
    checkoutButton.disabled = cart.length === 0;
  }
});

// =========================
// NAVIGASI DAN PENCARIAN
// =========================

document.getElementById("cartButton").addEventListener("click", () => {
  document.getElementById("cartSection").scrollIntoView({
    behavior: "smooth"
  });
});

document.getElementById("searchButton").addEventListener(
  "click",
  filterProducts
);

document.getElementById("searchInput").addEventListener(
  "input",
  filterProducts
);

function filterProducts() {
  const query = document.getElementById("searchInput")
    .value.trim().toLowerCase();

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(query)
  );

  productCount.textContent = `${filtered.length} produk`;

  if (filtered.length === 0) {
    productGrid.innerHTML = "<p>Produk tidak ditemukan.</p>";
    return;
  }

  productGrid.innerHTML = filtered.map((product) => `
    <article class="product-card">
      <div class="product-art">
        <span class="sale-badge">FLASH SALE</span>
        <span aria-hidden="true">${productEmoji(product.name)}</span>
      </div>
      <div class="product-info">
        <h3>${escapeHtml(product.name)}</h3>
        <p class="price">${rupiah(product.price)}</p>
        <p class="stock">Stok tersedia: ${product.stock}</p>
        <button
          class="add-button"
          data-add="${product.id}"
          ${Number(product.stock) < 1 ? "disabled" : ""}>
          ${Number(product.stock) < 1 ? "Stok habis" : "+ Keranjang"}
        </button>
      </div>
    </article>
  `).join("");
}

// =========================
// INISIALISASI
// =========================

async function init() {
  await Promise.all([
    loadProducts(),
    loadCart()
  ]);
}

init();
