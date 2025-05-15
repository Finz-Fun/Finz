import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';

dotenv.config();

export const PORT = process.env.PORT || 8080;
export const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';


export const connection = new Connection(RPC_URL, 'confirmed');

export const platformId = new PublicKey(process.env.PLATFORM_ID || '');

export const SOLANA_ENVIRONMENT = process.env.SOLANA_ENVIRONMENT || 'devnet'


