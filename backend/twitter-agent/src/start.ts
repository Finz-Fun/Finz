import mongoose from 'mongoose';
import { TwitterService } from './services/twitter-service';
import dotenv from 'dotenv';

dotenv.config();

async function testMentions() {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dex')
      .then(() => console.log('Connected to MongoDB'))
      .catch((err: any) => console.error('MongoDB connection error:', err));
  const service = new TwitterService();
  await service.initialize();

  console.log('Starting mention listener test...');

  await service.listenToMentions();

  // Optional: Stop after 5 minutes
//   setTimeout(() => {
//     service.stopListening();
//     process.exit(0);
//   }, 5 * 60 * 1000);
}

testMentions().catch((error: any) => console.log('Error:', error));