// backend-hypermart/models/Discount.js
import mongoose from "mongoose";

const discountSchema = new mongoose.Schema({
  kategori: { type: String, required: true, unique: true },
  persen: { type: Number, required: true }, // misal 10 = 10%
  aktif: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Discount", discountSchema);
