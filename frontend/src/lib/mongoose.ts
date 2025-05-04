import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

let isConnected = false;

export async function connectDB() {
  console.log('connectDB called. Current connection state:', {
    isConnected,
    mongooseReadyState: mongoose.connection.readyState
  });

  if (isConnected) {
    console.log('Already connected to MongoDB');
    return;
  }

  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MongoDB URI:', MONGODB_URI?.substring(0, 20) + '...'); // Log partial URI for safety

    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    const db = await mongoose.connect(MONGODB_URI as string, opts);
    
    isConnected = db.connections[0].readyState === 1;
    
    console.log('Connection established. ReadyState:', db.connections[0].readyState);
    console.log('Database name:', db.connection.name);
    
    if (isConnected) {
      console.log('✅ Successfully connected to MongoDB');
    } else {
      console.log('❌ Failed to connect to MongoDB');
    }

  } catch (error) {
    isConnected = false;
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Development hot reload handling
if (process.env.NODE_ENV !== 'production') {
  console.log('Development mode detected');
  
  if (mongoose.connection.readyState === 1) {
    console.log('Existing connection found in development');
  }
}