import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now },
  authorized: {type: Boolean, default: false},
  authorizedAt: {type: Date, required: false}
});

const Wallet = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);

export default Wallet;
