import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  creator: {
    type: String,
    required: true,
  },
  mintAddress: { 
    type: String, 
    required: false, 
    unique: true 
  },
  secretKey: {
    type: String,
    required: false,
  },
  name: {
    type: String,
    required: true,
  },
  symbol: {
    type: String,
    required: true,
  },
  tweetId: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  metadataUri: {
    type: String,
    required: true,
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  },
  liquidity: {
    type: Boolean,
    default: false
  },
  migratedToMeteora: {
    type: Boolean,
    default: false
  }
});

export const Token = mongoose.model('Token', tokenSchema);
