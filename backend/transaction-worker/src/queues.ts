import { Queue, QueueEvents } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

const connection = {
  host: process.env.QUEUE_HOST || 'localhost',
  port: parseInt(process.env.QUEUE_PORT || '6379'),
  password: process.env.QUEUE_PASSWORD,
  username: process.env.QUEUE_USER,
};

export const transactionQueue = new Queue('transaction-updates', {
  connection,
});

const queueEvents = new QueueEvents('transaction-updates', { connection });

queueEvents.on('waiting', ({ jobId }) => {
  console.log(`Added transaction ${jobId} to queue`);
});

queueEvents.on('active', ({ jobId }) => {
  console.log(`Processing transaction ${jobId}`);
});

queueEvents.on('completed', ({ jobId }) => {
  console.log(`Completed transaction ${jobId}`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Failed transaction ${jobId}:`, failedReason);
});

queueEvents.on('error', error => {
  console.error('Queue error:', error);
});

export const priceQueue = new Queue('price-updates', { connection });

const priceQueueEvents = new QueueEvents('price-updates', { connection });

priceQueueEvents.on('waiting', ({ jobId }) => {
  console.log(`Added candle ${jobId} to queue`);
});

priceQueueEvents.on('active', ({ jobId }) => {
  console.log(`Processing candle ${jobId}`);
});

priceQueueEvents.on('completed', ({ jobId }) => {
  console.log(`Completed candle ${jobId}`);
});

priceQueueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Failed candle ${jobId}:`, failedReason);
});

priceQueueEvents.on('error', error => {
  console.error('Queue error:', error);
});