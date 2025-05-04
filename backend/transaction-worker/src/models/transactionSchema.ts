import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  tokenMintAddress: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  timestamp: {
    type: Number,
    required: true,
    index: true
  },
  signature: {
    type: String,
    required: true
  },
  solAmount: {
    type: Number,
    required: true
  },
  walletAddress: {
    type: String,
    required: true,
    index: true
  },
  price: {
    type: Number,
    required: true
  },
  tokenAmount: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Create compound index for common queries
transactionSchema.index({ tokenMintAddress: 1, timestamp: -1 });

export const Transaction = mongoose.model('Transaction', transactionSchema);