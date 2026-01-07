// backend-hypermart/models/Order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  invoiceCode: { type: String, required: true, unique: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    nama: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    harga: { type: Number, required: true },     // normal
    finalHarga: { type: Number },               // setelah promo
    namaPromo: { type: String }
  }],
  total: { type: Number, required: true },
  customer: {
    nama: { type: String, required: true },
    phone: { type: String, required: true },
    alamat: { type: String, required: true }
  },
  status: {
    type: String,
    enum: ["PROCESSING", "SHIPPED"],
    default: "PROCESSING"
  }
}, { timestamps: true });

export default mongoose.model("Order", orderSchema);
