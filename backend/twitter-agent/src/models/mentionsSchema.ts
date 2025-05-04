import mongoose from 'mongoose';

const mentionsSchema = new mongoose.Schema({
  tweetId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Mentions', mentionsSchema);
