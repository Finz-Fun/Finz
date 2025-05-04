import { Connection, PublicKey } from '@solana/web3.js';
export const RPC_URL = (process.env.SOLANA_ENVIRONMENT === 'mainnet') ? process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';

export const connection = new Connection(RPC_URL, 'confirmed');

export const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID as string);

