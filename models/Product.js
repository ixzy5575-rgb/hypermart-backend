// backend-hypermart/models/Product.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  kategori: { type: String, required: true },
  harga: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  deskripsi: { type: String },
  gambarUrl: { type: String } // path/URL gambar produk
}, { timestamps: true });

export default mongoose.model("Product", productSchema);
