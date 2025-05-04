import { BN } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { AiAgent,IDL } from '../idl/ai_agent';
import { PoolData } from '../types/trading';
import { PROGRAM_ID } from '@/config';
const API_URL = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:3000';
const VIRTUAL_SOL = new BN(25_000_000_000); // 25 SOL in lamports
const POOL_SEED_PREFIX = "liquidity_pool";

export async function fetchPoolData(
  program: Program<AiAgent>,
  tokenMint: string
): Promise<PoolData> {
  try {
    const mint = new PublicKey(tokenMint);
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
      program.programId
    );

    const stateData = await program.account.liquidityPool.fetch(poolPda);
    const reserveSol = stateData.reserveSol;
    // Add virtual SOL to real SOL reserves to get mcap
    const totalSolWithVirtual = reserveSol.add(VIRTUAL_SOL);
    console.log(totalSolWithVirtual.toString())
    
    // Convert to SOL (divide by 1e9)
    const mcapInSol = parseInt(totalSolWithVirtual.toString())/ parseInt((new BN(1_000_000_000)).toString());
    console.log(mcapInSol)

    return {
      reserveSol: parseInt(reserveSol.toString()),
      reserveToken: parseInt((stateData.reserveToken).toString())
    };
  } catch (error) {
    console.log('Error fetching pool data:', error);
    throw error;
  }
}

export const getPoolTokenBalance = async ( program: Program<AiAgent>,
  tokenMint: string): Promise<BN> => {
  const mint = new PublicKey(tokenMint);
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
    program.programId 
  );

  const stateData = await program.account.liquidityPool.fetch(poolPda);
  const reserveToken = stateData.reserveToken;
  return reserveToken;
}

export const  getPoolSolBalance = async ( program: Program<AiAgent>,
  tokenMint: string): Promise<number> => {
  const mint = new PublicKey(tokenMint);
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
    program.programId 
  );

  const stateData = await program.account.liquidityPool.fetch(poolPda);
  const reserveSol = stateData.reserveSol;
  return parseInt(reserveSol.toString()) / 1e9;
};

export async function subscribeToPoolUpdates(
  PROGRAM_ID: PublicKey,
  connection: Connection,
  tokenMint: string,
  callback: (update: {price: number}) => void
): Promise<number> {

  const subscriptionId = connection.onLogs(
    PROGRAM_ID,
    (logs) => {
      try {
        let chartData = null;

        for (const log of logs.logs) {
          if (log.includes('CHART_DATA')) {
            const jsonStr = log.split('CHART_DATA')[1];
            chartData = JSON.parse(jsonStr);
            break;
          }
        }

        if (!chartData) return;
    
        if (chartData.token_mint_address !== tokenMint) {
          return;
        }
    
        const poolData = {
          price: chartData.mcap,
        };

        callback(poolData);
      } catch (error) {
        console.error('Error processing pool update:', error);
      }
    },
    "confirmed"
  );

  return subscriptionId;
}

export const unsubscribeFromPool = (
  connection: Connection,
  subscriptionId: number
) => {
  connection.removeAccountChangeListener(subscriptionId);
};

export const subscribeToPoolTransactions = async (
  PROGRAM_ID:PublicKey,
  connection: Connection,
  tokenMint: string,
  callback: (transaction: {
    type: 'BUY' | 'SELL';
    timestamp: number;
    solAmount: number;
    walletAddress: string;
    tokenAmount: number;
    signature: string;
    reserveToken: number;
    reserveSol: number;
  }) => void
) => {
  try {
    const subscriptionId = connection.onLogs(
      PROGRAM_ID,
      (logs) => {
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
              console.log('chartData', chartData)
              break;
            }
          }

          if (!transactionInfo) return;

          if (transactionInfo.token_mint_address !== tokenMint) {
            return;
          }

          const transaction = {
            type: transactionInfo.type as 'BUY' | 'SELL',
            timestamp: Date.now() / 1000,
            solAmount: transactionInfo.sol_amount / 1e9,
            walletAddress: transactionInfo.wallet,
            tokenAmount: transactionInfo.token_amount / 1e9,
            signature: logs.signature,
            reserveToken: chartData.reserve_token,
            reserveSol: chartData.reserve_sol
          };

          callback(transaction);
        } catch (error) {
          console.log('Error processing transaction logs:', error);
        }
      },
      'confirmed'
    );

    return subscriptionId;
  } catch (error) {
    console.log('Error in subscribeToPoolTransactions:', error);
    throw error;
  }
};

export const fetchHistoricalTransactions = async (
  tokenMint: string,
  limit: number = 100
): Promise<{
  type: 'BUY' | 'SELL';
  timestamp: number;
  solAmount: number;
  walletAddress: string;
  tokenAmount: number;
  signature: string;
}[]> => {
  try {
    const response = await fetch(`${API_URL}/transactions/${tokenMint}?limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch historical transactions');
    }
    const transactions = await response.json();
    return transactions;
  } catch (error) {
    console.log('Error fetching historical transactions:', error);
    return [];
  }
};

