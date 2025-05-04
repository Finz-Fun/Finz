import { connection, PROGRAM_ID } from './config';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import dotenv from 'dotenv';
import { transactionQueue, priceQueue } from './queues';

dotenv.config();

interface ParsedTransactionData {
  tokenMintAddress: string;
  type: 'BUY' | 'SELL';
  timestamp: number;
  solAmount: number;
  walletAddress: string;
  price: string;
  tokenAmount: number;
  signature: string;
}

connection.onLogs(PROGRAM_ID, async (logs, ctx) => {
  try {
    let transactionInfo = null;
    let chartData = null;
    for (const log of logs.logs) {
      if (log.includes('TRANSACTION_INFO')) {
        const jsonStr = log.split('TRANSACTION_INFO')[1];
        transactionInfo = JSON.parse(jsonStr);
      }
      if (log.includes('CHART_DATA')) {
        const jsonStr = log.split('CHART_DATA')[1];
        chartData = JSON.parse(jsonStr);
        break;
      }
    }

    if (!transactionInfo || !chartData) return;

    if (transactionInfo.token_mint_address !== chartData.token_mint_address) {
      console.error('Token mint address mismatch in logs');
      return;
    }
    const timestamp = Date.now()/1000;
    const timestampSeconds = Math.floor(timestamp);
    const parsedData: ParsedTransactionData = {
      tokenMintAddress: transactionInfo.token_mint_address,
      type: transactionInfo.type,
      timestamp: timestamp,
      solAmount: transactionInfo.sol_amount / LAMPORTS_PER_SOL,
      walletAddress: transactionInfo.wallet,
      price: transactionInfo.price,
      tokenAmount: transactionInfo.token_amount/1E9,
      signature: logs.signature
    };

    const update = {
      m: chartData.token_mint_address,
      p: chartData.mcap,
      ts: timestampSeconds
    } 
    console.log(update);
    await Promise.all([transactionQueue.add('transaction', parsedData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: 1000,
      priority: 1
    }), priceQueue.add('price-update', update, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: 1000,
      priority: 1
    })
  ])


    
  } catch (error) {
    console.error('Error processing transaction:', error);
  }
}, 'confirmed');

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Cleaning up...');
  await transactionQueue.close();
  await priceQueue.close();
});