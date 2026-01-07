// backend-hypermart/server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import Admin from "./models/Admin.js";
import Product from "./models/Product.js";
import Discount from "./models/Discount.js";
import Order from "./models/Order.js";

// ====== KONFIGURASI ======
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "RAHASIA_SUPERKUAT";

// ====== MIDDLEWARE ======
app.use(cors({
  origin: [
    "http://localhost:8080",
    "https://hypermart.namadomainkamu.com", 
    "https://hypermart-backend.onrender.com"
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Static files untuk gambar
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ====== DATABASE ======
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hypermart_kreo";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ====== UPLOAD GAMBAR ======
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_").toLowerCase();
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Gambar saja"), false),
  limits: { fileSize: 2 * 1024 * 1024 }
});

// ====== AUTH MIDDLEWARE ======
const authAdmin = (req, res, next) => {
  const token = req.cookies.token || req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Belum login" });

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Token tidak valid" });
  }
};

// ====== INVOICE ======
const generateInvoiceCode = () => {
  const now = new Date();
  const dateStr = now.getFullYear() + 
    String(now.getMonth() + 1).padStart(2, "0") + 
    String(now.getDate()).padStart(2, "0");
  return `INV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
};

// ====== AUTH ROUTES ======

// seed admin pertama, panggil sekali via Postman/Thunder Client
app.post("/api/auth/seed-admin", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username dan password wajib diisi" });
    }

    const exists = await Admin.findOne({ username });
    if (exists) {
      return res.status(400).json({ message: "Admin sudah ada" });
    }

    const hash = await bcrypt.hash(password, 10);
    await Admin.create({ username, passwordHash: hash });

    res.json({ message: "Admin dibuat" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal membuat admin" });
  }
});

// login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ message: "Username/password salah" });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Username/password salah" });
    }

    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
      })
      .json({ message: "Login berhasil", username: admin.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
});

// cek status login (dipakai JSP via fetch)
app.get("/api/auth/me", (req, res) => {
  const token =
    req.cookies.token || req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.json({ loggedIn: false });
  }

  try {
    const data = jwt.verify(token, JWT_SECRET);
    res.json({ loggedIn: true, username: data.username });
  } catch (err) {
    res.json({ loggedIn: false });
  }
});

// logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logout" });
});

// ====== PRODUCT ROUTES ======

// GET semua produk (untuk index.jsp & admin-dashboard.jsp)
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil produk" });
  }
});

// GET detail produk
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil produk" });
  }
});

// POST buat produk baru (admin only, dengan gambar optional)
app.post(
  "/api/products",
  authAdmin,
  upload.single("gambar"),
  async (req, res) => {
    try {
      const { nama, kategori, harga, stock, deskripsi } = req.body;

      const doc = {
        nama,
        kategori,
        harga: Number(harga),
        stock: Number(stock),
        deskripsi,
      };

      if (req.file) {
        doc.gambarUrl = "/uploads/" + req.file.filename;
      }

      const product = await Product.create(doc);
      res.status(201).json(product);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Gagal menyimpan produk" });
    }
  }
);

// PUT update produk (semua field + bisa ganti gambar)
app.put(
  "/api/products/:id",
  authAdmin,
  upload.single("gambar"),
  async (req, res) => {
    try {
      const { nama, kategori, harga, stock, deskripsi } = req.body;

      const update = {
        nama,
        kategori,
        harga: Number(harga),
        stock: Number(stock),
        deskripsi,
      };

      if (req.file) {
        update.gambarUrl = "/uploads/" + req.file.filename;
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true }
      );
      res.json(product);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Gagal mengubah produk" });
    }
  }
);

// DELETE hapus produk (sekalian hapus file gambar kalau ada)
app.delete("/api/products/:id", authAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (product && product.gambarUrl) {
      const filePath = path.join(
        __dirname,
        product.gambarUrl.replace("/uploads/", "uploads/")
      );
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, () => {});
      }
    }
    res.json({ message: "Produk dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menghapus produk" });
  }
});

// PATCH update stock saja (tombol Stock)
app.patch("/api/products/:id/stock", authAdmin, async (req, res) => {
  try {
    const { stock } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { stock: Number(stock) },
      { new: true }
    );
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengubah stock" });
  }
});

// ====== DISCOUNT ROUTES ======

// GET semua diskon kategori (untuk beranda dan halaman promo)
app.get("/api/discounts", async (req, res) => {
  try {
    const discounts = await Discount.find({ aktif: true });
    res.json(discounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil diskon" });
  }
});

// ADMIN ONLY – set / update diskon kategori
app.post("/api/discounts", authAdmin, async (req, res) => {
  try {
    const { kategori, persen, aktif } = req.body;
    const doc = await Discount.findOneAndUpdate(
      { kategori },
      { kategori, persen, aktif },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menyimpan diskon" });
  }
});

// ====== CHECKOUT ROUTES (KURANGI STOK + SIMPAN ORDER) ======

// POST /api/checkout
app.post("/api/checkout", async (req, res) => {
  try {
    const { customer, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Tidak ada item untuk checkout" });
    }

    if (!customer || !customer.nama || !customer.phone || !customer.alamat) {
      return res
        .status(400)
        .json({ message: "Data pelanggan tidak lengkap" });
    }

    // Ambil semua produk terkait
    const ids = items.map((it) => it.productId);
    const products = await Product.find({ _id: { $in: ids } });

    const productMap = {};
    products.forEach((p) => {
      productMap[p._id.toString()] = p;
    });

    // Ambil semua diskon aktif dan buat map per kategori
    const discounts = await Discount.find({ aktif: true });
    const discountMap = {};
    discounts.forEach((d) => {
      discountMap[d.kategori] = d;
    });

    let totalCalculated = 0;
    const orderItems = [];

    // Validasi stok dan hitung total + harga promo
    for (const it of items) {
      const prod = productMap[it.productId];
      if (!prod) {
        return res
          .status(400)
          .json({ message: "Produk tidak ditemukan: " + it.productId });
      }
      if (it.qty <= 0) {
        return res
          .status(400)
          .json({ message: "Qty tidak valid untuk produk " + prod.nama });
      }
      if (prod.stock < it.qty) {
        return res.status(400).json({
          message: `Stok tidak cukup untuk ${prod.nama}. Tersisa ${prod.stock}, diminta ${it.qty}`,
        });
      }

      const hargaNormal = prod.harga;
      const diskon = discountMap[prod.kategori];

      let hargaSetelahDiskon = hargaNormal;
      let namaPromo = null;

      if (diskon && diskon.persen > 0) {
        const factor = 1 - diskon.persen / 100;
        hargaSetelahDiskon = Math.round(hargaNormal * factor);
        namaPromo = `${diskon.persen}% ${diskon.kategori}`;
      }

      totalCalculated += hargaSetelahDiskon * it.qty;

      orderItems.push({
        productId: prod._id,
        nama: prod.nama,
        qty: it.qty,
        harga: hargaNormal,          // harga normal
        finalHarga: hargaSetelahDiskon, // harga setelah promo
        namaPromo,                      // bisa null
      });
    }

    // Kurangi stok produk
    for (const it of items) {
      await Product.updateOne(
        { _id: it.productId },
        { $inc: { stock: -it.qty } }
      );
    }

    // Buat invoice unik sederhana
    let invoiceCode;
    let unique = false;
    while (!unique) {
      invoiceCode = generateInvoiceCode();
      const existing = await Order.findOne({ invoiceCode });
      if (!existing) unique = true;
    }

    // Simpan order
    const order = new Order({
      invoiceCode,
      items: orderItems,
      total: totalCalculated,
      customer,
      status: "PROCESSING", // setiap checkout baru = sedang diproses
    });

    await order.save();

    res.json({
      success: true,
      message: "Checkout berhasil, stok diperbarui",
      invoiceCode,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ message: "Gagal memproses checkout" });
  }
});

// GET /api/orders - daftar pesanan untuk tracking.jsp
app.get("/api/orders", authAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil data pesanan" });
  }
});

// GET /api/orders/:id - detail satu invoice
app.get("/api/orders/:id", authAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order tidak ditemukan" });
    }
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil detail pesanan" });
  }
});

// PATCH /api/orders/:id/status - ubah status (PROCESSING <-> SHIPPED)
app.patch("/api/orders/:id/status", authAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["PROCESSING", "SHIPPED"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order tidak ditemukan" });
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengubah status pesanan" });
  }
});

// DELETE /api/orders/:id - hapus invoice
app.delete("/api/orders/:id", authAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order tidak ditemukan" });
    }
    res.json({ message: "Order dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menghapus pesanan" });
  }
});

// ====== START SERVER ======
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Hypermart Backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
