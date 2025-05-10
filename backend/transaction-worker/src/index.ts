import { connection } from './config';
import { PublicKey, Message, MessageAccountKeys, CompiledInstruction } from '@solana/web3.js';
import dotenv from 'dotenv';
import { IDL as LaunchpadIDL } from './IDL'; // Raydium Launchpad IDL
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { priceQueue, transactionQueue } from './queues';

dotenv.config();

// The Program ID you want to subscribe to for ANY log activity, to get a transaction signature.
// This should be an EXECUTABLE program.
// If JAwV... is the program that is the TARGET of the CPI and emits the event log, this is correct.
const LOG_NOTIFICATION_PROGRAM_ID = new PublicKey("JAwVBJTFd3XgxJ7FmqrZYcoBa9zBgRWErnqevtxg9xiF");

// Program ID of the Raydium Launchpad program itself (used to identify its instructions in the fetched tx)
const TARGET_LAUNCHPAD_PROGRAM_ID = new PublicKey(LaunchpadIDL.address);

const CPI_EVENT_OUTER_DISCRIMINATOR_HEX = "e445a52e51cb9a1d";
const launchpadEventCoder = new anchor.BorshEventCoder(LaunchpadIDL as anchor.Idl);

// Interface from user query
interface ParsedTransactionData {
  tokenMintAddress: string;
  type: 'BUY' | 'SELL';
  timestamp: number;
  solAmount: number;
  walletAddress: string;
  mcap: number; 
  tokenAmount: number;
  signature: string;
}

// Adjusted to snake_case to match the actual decoded output from BorshEventCoder
interface DecodedTradeEventData {
    pool_state: PublicKey;
    total_base_sell: anchor.BN;
    virtual_base: anchor.BN;
    virtual_quote: anchor.BN;
    real_base_before: anchor.BN;
    real_quote_before: anchor.BN;
    real_base_after: anchor.BN;
    real_quote_after: anchor.BN;
    amount_in: anchor.BN;
    amount_out: anchor.BN;
    protocol_fee: anchor.BN;
    platform_fee: anchor.BN;
    share_fee: anchor.BN;
    trade_direction: { Buy: {} } | { Sell: {} }; 
    pool_status: { Fund: {} } | { Migrate: {} } | { Trade: {} }; 
}

let processingSignatures: Set<string> = new Set();

async function processTransactionForCPIEvent(signature: string) {
    if (processingSignatures.has(signature)) {
        // console.log(`[${signature}] Already processing or recently processed.`);
        return;
    }
    processingSignatures.add(signature);
    setTimeout(() => processingSignatures.delete(signature), 60000); // 1 minute

    try {
        // console.log(`[${signature}] Fetching transaction details (triggered by log from ${LOG_NOTIFICATION_PROGRAM_ID.toBase58()})...`);
        const txResponse = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
        });

        if (!txResponse || !txResponse.meta) {
            // console.log(`[${signature}] Transaction not found or meta missing.`);
            return;
        }
        if (txResponse.meta.err) {
            // console.log(`[${signature}] Transaction failed:`, txResponse.meta.err);
            return;
        }

        let decodedCpiEventData: DecodedTradeEventData | null = null;
        let launchpadInstructionInvoked: string | null = null;
        let baseMintFromTx: PublicKey | null = null;
        let quoteMintFromTx: PublicKey | null = null;
        let userWalletFromTxLaunchpadIx: PublicKey | null = null;

        // 1. Look for the CPI event data in inner instructions
        if (txResponse.meta.innerInstructions && txResponse.meta.innerInstructions.length > 0) {
            // console.log("innerInstructions", bs58.decode(txResponse.meta.innerInstructions[0].instructions[0].data)); // Your debug log
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
                            // console.log(`[${signature}] Found CPI Event by outer discriminator in first inner instruction of a set.`);
                            const eventDataBuffer = iixDataBuffer.slice(8);
                            try {
                                const decodedEvent = launchpadEventCoder.decode(eventDataBuffer.toString("base64"));
                                
                                if (decodedEvent) {
                                    // Log the raw decoded event data structure
                                    // console.log(`[${signature}] RAW decodedEvent.data from CPI:`, JSON.stringify(decodedEvent.data, null, 2));

                                    if (decodedEvent.name === "TradeEvent") {
                                        decodedCpiEventData = decodedEvent.data as DecodedTradeEventData;
                                        // console.log(`[${signature}] Successfully decoded TradeEvent from CPI.`);
                                    }
                                } else {
                                    // console.log(`[${signature}] launchpadEventCoder.decode returned null or undefined for CPI data.`);
                                }
                            } catch (e: any) {
                                // console.error(`[${signature}] Error decoding CPI TradeEvent data:`, e.message, "Buffer (hex):", eventDataBuffer.toString('hex'));
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
            // console.warn(`[${signature}] Using direct staticAccountKeys as fallback (message.staticAccountKeys).`);
            // accountKeysList = message.staticAccountKeys;
        }

        if (accountKeysList.length === 0) {
            // console.log(`[${signature}] Could not resolve account keys from transaction message.`);
        }

        // 2. Find the original Raydium Launchpad instruction for context (mints, user)
        let instructionsToParse: readonly CompiledInstruction[] = [];
        if (message && 'instructions' in message && Array.isArray(message.instructions)) {
            instructionsToParse = (message as Message).instructions;
        } else {
            // console.warn(`[${signature}] Message format does not directly contain 'instructions'. This might be an unexpected V0 message format or message is null.`);
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
        
        // ADD DEBUG LOGS HERE
        // console.log(`[${signature}] DEBUG before finalData: launchpadInstructionInvoked = ${launchpadInstructionInvoked}`);
        // console.log(`[${signature}] DEBUG before finalData: userWalletFromTxLaunchpadIx = ${userWalletFromTxLaunchpadIx?.toBase58()}`);
        // console.log(`[${signature}] DEBUG before finalData: baseMintFromTx = ${baseMintFromTx?.toBase58()}`);
        // console.log(`[${signature}] DEBUG before finalData: quoteMintFromTx = ${quoteMintFromTx?.toBase58()}`);
        if (decodedCpiEventData) {
            // console.log(`[${signature}] DEBUG before finalData: decodedCpiEventData.pool_state = ${decodedCpiEventData.pool_state?.toBase58()}`);
        } else {
            // console.log(`[${signature}] DEBUG before finalData: decodedCpiEventData is null`);
        }

        // 3. Combine and Log/Process
        if (decodedCpiEventData) {
            // console.log("--- Processed Trade (from CPI Event via onLogs) ---");
            let solAmountActual: number = 0;
            let tokenAmountActual: number = 0;
            let calculatedPrice: string = "0";
            let tokenMintAddressActual: string | undefined = undefined;
            let tradeType: 'BUY' | 'SELL' = 'BUY'; // Default

            const amountInEvent = decodedCpiEventData.amount_in.toNumber(); 
            const amountOutEvent = decodedCpiEventData.amount_out.toNumber(); 
            // const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112"; // User commented out
            // const isSolQuote = quoteMintFromTx?.toBase58() === NATIVE_SOL_MINT; // User commented out

            // New price calculation based on the formula: (virtual_quote + real_quote_before) / (virtual_base - real_base_before)
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

            const finalData: ParsedTransactionData = {
                signature: signature,
                timestamp: Math.floor(Date.now() / 1000),
                type: tradeType,
                walletAddress: userWalletFromTxLaunchpadIx?.toBase58() || "N/A",
                tokenMintAddress: tokenMintAddressActual || baseMintFromTx?.toBase58() || "N/A",
                solAmount: solAmountActual, 
                tokenAmount: tokenAmountActual, 
                mcap: Number(calculatedPrice),
            };
            console.log("Formatted for DB/Queue (ParsedTransactionData):", finalData);

            const update = {
                ts:  Math.floor(Date.now() / 1000),
                m: tokenMintAddressActual || baseMintFromTx?.toBase58() || "N/A",   
                p: Number(calculatedPrice),
            }
            await Promise.all([transactionQueue.add('transaction', finalData, {
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
          
        } else if (launchpadInstructionInvoked) {
            // console.log(`[${signature}] CPI TradeEvent not found, but found Launchpad instruction: ${launchpadInstructionInvoked}.`);
            // console.log("  User Wallet (from Launchpad Ix):", userWalletFromTxLaunchpadIx?.toBase58() || "N/A");
            // console.log("  Base Mint (from Launchpad Ix):", baseMintFromTx?.toBase58() || "N/A");
            // console.log("  Quote Mint (from Launchpad Ix):", quoteMintFromTx?.toBase58() || "N/A");
        } else {
            // console.log(`[${signature}] Neither relevant CPI TradeEvent nor Launchpad instruction found.`);
        }

    } catch (error) {
        // console.error(`[${signature}] Error processing transaction:`, error);
    }
}

// console.log(`Subscribing to logs for program: ${LOG_NOTIFICATION_PROGRAM_ID.toBase58()} on ${connection.rpcEndpoint}`);

const logsSubscriptionId = connection.onLogs(
  LOG_NOTIFICATION_PROGRAM_ID,
  (logsResult, context) => {
    if (logsResult.err) {
      return;
    }
    processTransactionForCPIEvent(logsResult.signature);
  },
  "confirmed"
);

console.log(`Raw logs listener added with ID: ${logsSubscriptionId} for ${LOG_NOTIFICATION_PROGRAM_ID.toBase58()}. Waiting for logs...`);
console.log(`This will trigger for ANY log from ${LOG_NOTIFICATION_PROGRAM_ID.toBase58()}.`);

process.on('SIGINT', async () => {
  console.log('SIGINT received. Cleaning up...');
  if (logsSubscriptionId) {
    try {
      await connection.removeOnLogsListener(logsSubscriptionId);
      console.log('Successfully removed logs listener.');
    } catch (err) {
      console.error('Error removing logs listener:', err);
    }
  }
  process.exit(0);
});