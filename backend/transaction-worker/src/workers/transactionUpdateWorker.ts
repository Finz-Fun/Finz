import { Worker, Job } from 'bullmq';
import cluster from 'cluster';
import { cpus } from 'os';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Transaction } from '../models/transactionSchema';

dotenv.config();

interface ParsedTransactionData {
  tokenMintAddress: string;
  type: 'BUY' | 'SELL';
  timestamp: number;
  solAmount: number;
  walletAddress: string;
  price: number;
  tokenAmount: number;
  signature: string;
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

async function connectToMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dex');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

async function processTransaction(transaction: ParsedTransactionData) {
  try {
    // Create new transaction document
    const newTransaction = new Transaction(transaction);
    await newTransaction.save();
    
    console.log('Transaction saved:', transaction.tokenMintAddress);
  } catch (error) {
    console.error('Error processing transaction:', error);
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
  // Connect to MongoDB when worker starts
   connectToMongoDB().catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

  const worker = new Worker('transaction-updates', 
    async (job: Job<ParsedTransactionData>) => {
      console.log(`Worker ${process.pid} processing transaction ${job.id}`);
      await processTransaction(job.data);
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
    console.log(`Worker ${process.pid} completed transaction ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Worker ${process.pid} failed transaction ${job?.id}:`, error);
  });

  console.log(`Worker ${process.pid} started`);

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Cleaning up...');
    await worker.close();
    await mongoose.connection.close();
    process.exit(0);
  });
}