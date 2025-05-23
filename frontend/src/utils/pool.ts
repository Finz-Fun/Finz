import { BN, Idl } from '@coral-xyz/anchor';
import { CompiledInstruction, Connection, Message, MessageAccountKeys, PublicKey } from '@solana/web3.js';
import { connection, connectionMainnet, RAYDIUM_PLATFORM_ID, SOLANA_ENVIRONMENT } from '../config';
import { BorshEventCoder } from '@coral-xyz/anchor';
import { IDL as LaunchpadIDL} from '../idl/IDL';
import { IDL as MainnetLaunchpadIDL } from '../idl/MainnetIDL';
import bs58 from 'bs58';

const API_URL = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:3000';


const LOG_NOTIFICATION_PROGRAM_ID = new PublicKey(RAYDIUM_PLATFORM_ID);

// Program ID of the Raydium Launchpad program itself (used to identify its instructions in the fetched tx)
const TARGET_LAUNCHPAD_PROGRAM_ID = SOLANA_ENVIRONMENT === 'mainnet' ? new PublicKey(MainnetLaunchpadIDL.address) : new PublicKey(LaunchpadIDL.address);

const CPI_EVENT_OUTER_DISCRIMINATOR_HEX = "e445a52e51cb9a1d";
const launchpadEventCoder = new BorshEventCoder(SOLANA_ENVIRONMENT === 'mainnet' ? MainnetLaunchpadIDL as Idl : LaunchpadIDL as Idl);


// interface ParsedTransactionData {
//   tokenMintAddress: string;
//   type: 'BUY' | 'SELL';
//   timestamp: number;
//   solAmount: number;
//   walletAddress: string;
//   mcap: number; 
//   tokenAmount: number;
//   signature: string;
// }

// Adjusted to snake_case to match the actual decoded output from BorshEventCoder
interface DecodedTradeEventData {
    pool_state: PublicKey;
    total_base_sell: BN;
    virtual_base: BN;
    virtual_quote: BN;
    real_base_before: BN;
    real_quote_before: BN;
    real_base_after: BN;
    real_quote_after: BN;
    amount_in: BN;
    amount_out: BN;
    protocol_fee: BN;
    platform_fee: BN;
    share_fee: BN;
    trade_direction: { Buy: {} } | { Sell: {} }; 
    pool_status: { Fund: {} } | { Migrate: {} } | { Trade: {} }; 
}

let processingSignatures: Set<string> = new Set();



async function processTransactionForCPIEvent(signature: string) {
  if (processingSignatures.has(signature)) {
      return null;
  }
  processingSignatures.add(signature);
  setTimeout(() => processingSignatures.delete(signature), 60000); // 1 minute

  try {
      const txResponse = await connectionMainnet.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed"
      });

      if (!txResponse || !txResponse.meta) {
          return null;
      }
      if (txResponse.meta.err) {
          return null;
      }

      let decodedCpiEventData: DecodedTradeEventData | null = null;
      let launchpadInstructionInvoked: string | null = null;
      let baseMintFromTx: PublicKey | null = null;
      let quoteMintFromTx: PublicKey | null = null;
      let userWalletFromTxLaunchpadIx: PublicKey | null = null;

      // 1. Look for the CPI event data in inner instructions
      if (txResponse.meta.innerInstructions && txResponse.meta.innerInstructions.length > 0) {
          for (const innerInstructionSet of txResponse.meta.innerInstructions) {
              if (innerInstructionSet.instructions && innerInstructionSet.instructions.length > 0) {
                  const firstInnerInstruction = innerInstructionSet.instructions[0] as any; 
                  let iixDataBuffer: Buffer | undefined;

                  if (firstInnerInstruction.data && typeof firstInnerInstruction.data === 'string') {
                      try {
                          iixDataBuffer = Buffer.from(bs58.decode(firstInnerInstruction.data));
                      } catch (e) { continue; }
                  } else if (Buffer.isBuffer(firstInnerInstruction.data)) {
                      iixDataBuffer = firstInnerInstruction.data;
                  } else { continue; } 

                  if (iixDataBuffer && iixDataBuffer.length >= 8) {
                      const outerDiscriminator = iixDataBuffer.slice(0, 8).toString('hex');
                      if (outerDiscriminator === CPI_EVENT_OUTER_DISCRIMINATOR_HEX) {
                          const eventDataBuffer = iixDataBuffer.slice(8);
                          try {
                              const decodedEvent = launchpadEventCoder.decode(eventDataBuffer.toString("base64"));
                              
                              if (decodedEvent) {
                                  if (decodedEvent.name === "TradeEvent") {
                                      decodedCpiEventData = decodedEvent.data as DecodedTradeEventData;
                                  }
                              }
                          } catch (e: any) {
                          }
                      }
                  }
              }
              if (decodedCpiEventData) break; 
          }
      }
      
      let accountKeysList: PublicKey[] = [];
      const message = txResponse.transaction.message;

      if (message) {
          const accountKeysFromMsgObj: MessageAccountKeys = message.getAccountKeys({
              accountKeysFromLookups: txResponse.meta.loadedAddresses || undefined
          });
          accountKeysList = accountKeysFromMsgObj.staticAccountKeys;
          if (accountKeysFromMsgObj.accountKeysFromLookups) {
              accountKeysList = accountKeysList.concat(
                  accountKeysFromMsgObj.accountKeysFromLookups.writable,
                  accountKeysFromMsgObj.accountKeysFromLookups.readonly
              );
          }
      }
      
      if (accountKeysList.length === 0 && message && 'staticAccountKeys' in message && Array.isArray(message.staticAccountKeys)) {
      }

      if (accountKeysList.length === 0) {
      }

      // 2. Find the original Raydium Launchpad instruction for context (mints, user)
      let instructionsToParse: readonly CompiledInstruction[] = [];
      if (message && 'instructions' in message && Array.isArray(message.instructions)) {
          instructionsToParse = (message as Message).instructions;
      }

      if (instructionsToParse.length > 0 && accountKeysList.length > 0) { 
          for (const instruction of instructionsToParse) {
              if (instruction.programIdIndex >= accountKeysList.length) continue;
              const programId = accountKeysList[instruction.programIdIndex];

              if (programId.equals(TARGET_LAUNCHPAD_PROGRAM_ID)) {
                  const instructionDataBuffer = Buffer.from(bs58.decode(instruction.data));
                  if (instructionDataBuffer.length < 8) continue;
                  
                  const instructionDiscriminatorHex = instructionDataBuffer.slice(0, 8).toString('hex');

                  const launchpadIxInfo = LaunchpadIDL.instructions.find(
                      (ix) => Buffer.from(ix.discriminator).toString("hex") === instructionDiscriminatorHex
                  );

                  if (launchpadIxInfo && (launchpadIxInfo.name === "buy_exact_in" || launchpadIxInfo.name === "sell_exact_in")) {
                      launchpadInstructionInvoked = launchpadIxInfo.name;
                      const accNameToIdlIndex: { [key: string]: number } = {};
                      launchpadIxInfo.accounts.forEach((acc, idx) => { accNameToIdlIndex[acc.name] = idx; });

                      const mapAccountIndex = (idxInInstructionAccounts: number): PublicKey | null => {
                          if (idxInInstructionAccounts < instruction.accounts.length) {
                              const actualAccountIndexInTx = instruction.accounts[idxInInstructionAccounts];
                              if (actualAccountIndexInTx < accountKeysList.length) {
                                  return accountKeysList[actualAccountIndexInTx];
                              }
                          }
                          console.warn(`[${signature}] Failed to map account index ${idxInInstructionAccounts} for ${launchpadInstructionInvoked}`);
                          return null;
                      };

                      if (accNameToIdlIndex.hasOwnProperty('base_token_mint')) {
                         baseMintFromTx = mapAccountIndex(accNameToIdlIndex['base_token_mint']);
                      }
                      if (accNameToIdlIndex.hasOwnProperty('quote_token_mint')) {
                          quoteMintFromTx = mapAccountIndex(accNameToIdlIndex['quote_token_mint']);
                      }
                       if (accNameToIdlIndex.hasOwnProperty('payer')) {
                          userWalletFromTxLaunchpadIx = mapAccountIndex(accNameToIdlIndex['payer']);
                      }
                      break; 
                  }
              }
          }
      }
      
      if (decodedCpiEventData) {
          let solAmountActual: number = 0;
          let tokenAmountActual: number = 0;
          let calculatedPrice: string = "0";
          let tokenMintAddressActual: string | undefined = undefined;
          let tradeType: 'BUY' | 'SELL' = 'BUY'; // Default

          const amountInEvent = decodedCpiEventData.amount_in.toNumber(); 
          const amountOutEvent = decodedCpiEventData.amount_out.toNumber(); 

          // New price calculation based on the formula: (virtual_quote + real_quote_after) / (virtual_base - real_base_after)
          if (decodedCpiEventData.virtual_quote && 
              decodedCpiEventData.real_quote_after && 
              decodedCpiEventData.virtual_base && 
              decodedCpiEventData.real_base_after) {

              const numeratorBN = decodedCpiEventData.virtual_quote.add(decodedCpiEventData.real_quote_after);
              const denominatorBN = decodedCpiEventData.virtual_base.sub(decodedCpiEventData.real_base_after);

              const numeratorVal = numeratorBN.toNumber() / 1e9; // Convert sum of quotes (lamports) to SOL
              const denominatorVal = denominatorBN.toNumber() / 1e6; // Convert diff of bases (smallest units) to whole tokens (assuming 6 decimals)

              if (denominatorVal !== 0) {
                  calculatedPrice = ((numeratorVal / denominatorVal)*1e9).toString();
              } else {
                  calculatedPrice = "0"; // Avoid division by zero
              }
          } else {
              calculatedPrice = "0"; // Fallback if any required BN field for price calc is missing
          }

          if (decodedCpiEventData.trade_direction.hasOwnProperty('Buy')) { // User BUYS base token, SELLS quote token
              tradeType = 'BUY';
              tokenMintAddressActual = baseMintFromTx?.toBase58();
              tokenAmountActual = amountOutEvent / 1e6; // User changed: Base token received, div by 1e6
              solAmountActual = amountInEvent / 1e9;    // User changed: Quote token spent (SOL), div by 1e9
          } else if (decodedCpiEventData.trade_direction.hasOwnProperty('Sell')) { // User SELLS base token, BUYS quote token
              tradeType = 'SELL';
              tokenMintAddressActual = baseMintFromTx?.toBase58();
              tokenAmountActual = amountInEvent / 1e6;  // User changed: Base token sold, div by 1e6
              solAmountActual = amountOutEvent / 1e9;   // User changed: Quote token received (SOL), div by 1e9
          }

          return {
              p: Number(calculatedPrice),
              type: tradeType,
              solAmount: solAmountActual,
              walletAddress: userWalletFromTxLaunchpadIx?.toBase58() || "N/A",
              tokenAmount: tokenAmountActual,
              poolSolBalance: decodedCpiEventData.real_quote_after.toNumber() / 1e9
          };
      }
      return null;
  } catch (error) {
      return null;
  }
}

export async function subscribeToPoolUpdates(
  tokenMint: string,
  callback: (update: {
    price: number;
    type: 'BUY' | 'SELL';
    solAmount: number;
    walletAddress: string;
    tokenAmount: number;
    signature: string;
    poolSolBalance: number;
  }) => void
): Promise<number> {

  const logsSubscriptionId = connectionMainnet.onLogs(
    LOG_NOTIFICATION_PROGRAM_ID,
    async (logsResult, context) => {
      if (logsResult.err) {
        return;
      }

      // Check logs for Raydium Launchpad instructions before fetching transaction
      
      const isRaydiumLaunchpadTx = logsResult.logs.some(log => 
        log.includes("Program log: Instruction: BuyExactIn") || 
        log.includes("Program log: Instruction: SellExactIn")
      );
      // console.log("isRaydiumLaunchpadTx", isRaydiumLaunchpadTx)
      if (!isRaydiumLaunchpadTx) {
        return;
      }

      const update = await processTransactionForCPIEvent(logsResult.signature);
      if (update) {
        callback({
          price: update.p,
          type: update.type,
          solAmount: update.solAmount,
          walletAddress: update.walletAddress,
          tokenAmount: update.tokenAmount,
          signature: logsResult.signature,
          poolSolBalance: update.poolSolBalance
        });
      }
    },
    "confirmed"
  );

  return logsSubscriptionId;
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
              // console.log('chartData', chartData)
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
    console.log("fetching historical transactions")
    const response = await fetch(`${API_URL}/transactions/${tokenMint}?limit=${limit}`);
    // console.log("response", response)
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

