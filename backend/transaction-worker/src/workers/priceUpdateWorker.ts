import { Worker, Job } from 'bullmq';
import { MongoClient, Collection, Document, ClientSession } from 'mongodb';
import cluster from 'cluster';
import { cpus } from 'os';
import dotenv from 'dotenv';

dotenv.config();

// Types
interface PriceUpdate {
  ts: number;
  m: string; // market/symbol
  p: number; // price
}

interface Candle {
  t: number; // timestamp (as Unix timestamp)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  m: string; // market/symbol
}

// Define a specific type for the time series document
interface TimeSeriesDocument {
  t: number;
  o: number;
  h: number;
  l: number; 
  c: number;
  m: string;
}

interface Lock {
  lockId: string;
  createdAt: Date;
}

interface CurrentCandle {
  m: string;
  candle: Candle;
}

// MongoDB connection
let mongoClient: MongoClient;
let candlesCollection: Collection<Document>;
let locksCollection: Collection<Lock>;
let currentCandlesCollection: Collection<CurrentCandle>;

async function connectToMongoDB() {
  try {
    // Use replica set or MongoDB Atlas for transactions support
    mongoClient = new MongoClient(process.env.CANDLE_DB_URI || 'mongodb://localhost:27017', {
      // Required for transactions
      replicaSet: process.env.MONGO_REPLICA_SET || undefined
    });
    await mongoClient.connect();
    console.log('MongoDB connected');
    
    const db = mongoClient.db('candles');
    
    // Create collections if they don't exist
    if (!(await db.listCollections({name: 'candles'}).toArray()).length) {
      await db.createCollection('candles', {
        timeseries: {
          timeField: 't',
          metaField: 'm',
          granularity: 'seconds'
        }
      });
    }
    
    if (!(await db.listCollections({name: 'locks'}).toArray()).length) {
      await db.createCollection('locks');
      await db.collection('locks').createIndex({ createdAt: 1 }, { expireAfterSeconds: 5 });
    }
    
    if (!(await db.listCollections({name: 'current_candles'}).toArray()).length) {
      await db.createCollection('current_candles');
    }
    
    candlesCollection = db.collection('candles');
    locksCollection = db.collection('locks');
    currentCandlesCollection = db.collection('current_candles');

    await db.collection('candles').createIndex({ m: 1, t: 1 });
    await db.collection('current_candles').createIndex({ m: 1 });
    
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

const WORKER_COUNT = process.env.WORKER_COUNT ? 
  parseInt(process.env.WORKER_COUNT) : 
  cpus().length;

const connection = {
  host: process.env.QUEUE_HOST || 'localhost',
  port: parseInt(process.env.QUEUE_PORT || '6379'),
  password: process.env.QUEUE_PASSWORD,
  username: process.env.QUEUE_USER,
};

async function processUpdate(update: PriceUpdate) {
  const candleTime = Math.floor(update.ts / 30) * 30;
  const lockId = `lock_${update.m}`;
  
  try {
    // First, try to acquire lock without a transaction
    const lockResult = await locksCollection.insertOne({
      lockId: lockId,
      createdAt: new Date()
    });
    
    if (!lockResult.acknowledged) {
      console.log(`Lock acquisition failed for ${update.m}, skipping update`);
      return;
    }
    
    try {
      // Get current candle
      const currentCandleDoc = await currentCandlesCollection.findOne({ m: update.m });
      let candle: Candle;
      let completedCandle = null;
      
      if (!currentCandleDoc) {
        candle = {
          t: candleTime,
          o: update.p,
          h: update.p,
          l: update.p,
          c: update.p,
          m: update.m
        };
      } else {
        candle = currentCandleDoc.candle;

        if (candleTime > candle.t) {
          // Store the completed candle first (outside of transaction)
          completedCandle = { ...candle };
          
          // Start new candle
          candle = {
            t: candleTime,
            o: update.p,
            h: update.p,
            l: update.p,
            c: update.p,
            m: update.m
          };
        } else {
          // Update existing candle
          candle.h = Math.max(candle.h, update.p);
          candle.l = Math.min(candle.l, update.p);
          candle.c = update.p;
        }
      }

      // Insert historical candle if needed (outside of transaction)
      if (completedCandle) {
        try {
          // Convert numeric timestamp to Date object required by MongoDB time series collection
          const timeSeriesDoc = {
            ...completedCandle,
            t: new Date(completedCandle.t * 1000) // Convert from seconds to milliseconds
          };
          
          await candlesCollection.insertOne(timeSeriesDoc as any);
          console.log(`Stored historical candle for ${update.m} at time ${candleTime-30}`);
        } catch (error) {
          console.error(`Error storing historical candle for ${update.m}:`, error);
          // This error is non-critical
        }
      }

      // Update current candle
      await currentCandlesCollection.updateOne(
        { m: update.m },
        { $set: { candle } },
        { upsert: true }
      );
      
    } finally {
      // Always release the lock
      await locksCollection.deleteOne({ lockId: lockId });
    }
    
  } catch (error) {
    console.error(`Error processing update for ${update.m}:`, error);
    throw error;
  }
}

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  console.log(`Starting ${WORKER_COUNT} workers...`);

  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  // Connect to MongoDB before starting the worker
  connectToMongoDB().then(() => {
    const worker = new Worker('price-updates', 
      async (job: Job<PriceUpdate>) => {
        console.log(`Worker ${process.pid} processing job ${job.id}`);
        await processUpdate(job.data);
      }, 
      { 
        connection,
        concurrency: 10,
        autorun: true
      }
    );

    worker.on('error', (error) => {
      console.error(`Worker ${process.pid} encountered error:`, error);
    });

    worker.on('completed', (job) => {
      console.log(`Worker ${process.pid} completed job ${job.id}`);
    });

    worker.on('failed', (job, error) => {
      console.error(`Worker ${process.pid} failed job ${job?.id}:`, error);
    });

    console.log(`Worker ${process.pid} started`);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Cleaning up...');
      await worker.close();
      await mongoClient.close();
      process.exit(0);
    });
  }).catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Cleaning up...');
  if (!cluster.isPrimary && mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});