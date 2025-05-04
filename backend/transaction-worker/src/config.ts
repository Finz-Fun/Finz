import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { createClient } from 'redis';

dotenv.config();

export const PORT = process.env.PORT || 8080;
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';


export const connection = new Connection(RPC_URL, 'confirmed');


export const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID as string);

export const redisClient = createClient({
    url: REDIS_URL || 'redis://localhost:6379',
    socket: {
      keepAlive: 30000,
      reconnectStrategy: (retries) => {
        if (retries > 20) {
          console.error('Max redis reconnection attempts reached');
          return new Error('Max redis reconnection attempts reached');
        }
        return Math.min(retries * 100, 3000);
      },
    }
  });

