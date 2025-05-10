import express, { Request, Response } from 'express';
import { Connection, PublicKey, Keypair, sendAndConfirmTransaction, Transaction, SYSVAR_RENT_PUBKEY, SystemProgram, ComputeBudgetProgram, TransactionInstruction, AddressLookupTableProgram, TransactionMessage } from '@solana/web3.js';
import {TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo, createMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getMinimumBalanceForRentExemptMint, MINT_SIZE, createInitializeMint2Instruction, createMintToInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, createBurnInstruction, getAssociatedTokenAddressSync, createCloseAccountInstruction, createSetAuthorityInstruction, AuthorityType} from "@solana/spl-token"
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import {AiAgent, IDL } from './idl/ai_agent';
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token';
import {actionCorsMiddleware, ACTIONS_CORS_HEADERS, BLOCKCHAIN_IDS} from "@solana/actions"
import cors from "cors";
import {
  createMetadataAccountV3,
	createV1,
	findMetadataPda,
	mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import { 
  createSignerFromKeypair, keypairIdentity, percentAmount, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from '@metaplex-foundation/umi/serializers'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';
import Creator from './models/creatorSchema';
import { connectCandleDB, connectDB, getCandleDbConnection } from './db';
import nodeHtmlToImage from 'node-html-to-image';
import { Token } from './models/tokenSchema';
import Walletmodel from './models/walletSchema';
import Mentions from './models/mentionsSchema';
import { Transaction as TransactionModel } from './models/transactionSchema';
import { createClient } from 'redis';
import { 
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from '@solana/web3.js';
import { createTransferInstruction } from '@solana/spl-token';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
// @ts-ignore
import AmmImpl, { PROGRAM_ID, } from '@mercurial-finance/dynamic-amm-sdk';
// import { derivePoolAddressWithConfig } from '@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

import {
  TxVersion,
  DEV_LAUNCHPAD_PROGRAM,
  printSimulate,
  getPdaLaunchpadPoolId,
  Curve,
  PlatformConfig,
  LAUNCHPAD_PROGRAM,
  ApiV3Token,
  getCpmmPdaAmmConfigId,
  DEVNET_PROGRAM_ID,
  getPdaLaunchpadConfigId,
  LaunchpadConfig,
} from '@raydium-io/raydium-sdk-v2'
import { initSdk } from './config'
import axios from 'axios';
// import Decimal from 'decimal.js'


dotenv.config();

const SOLANA_ENVIRONMENT = process.env.SOLANA_ENVIRONMENT || 'devnet';

const app = express();
app.use((req, res, next) => {
  // Skip CORS for blinks routes
  if (req.path.startsWith('/blinks') || req.path.startsWith('/api/blinks')) {
    return next();
  }
  cors()(req, res, next);});
app.use(express.json());

app.use('/blinks', actionCorsMiddleware({headers: ACTIONS_CORS_HEADERS,chainId: (SOLANA_ENVIRONMENT === 'mainnet' ? BLOCKCHAIN_IDS.mainnet : BLOCKCHAIN_IDS.devnet),actionVersion:1}));
app.use('/api/blinks', actionCorsMiddleware({headers: ACTIONS_CORS_HEADERS, chainId: (SOLANA_ENVIRONMENT === 'mainnet' ? BLOCKCHAIN_IDS.mainnet : BLOCKCHAIN_IDS.devnet),actionVersion:1}));

connectDB()
connectCandleDB()



const PORT = process.env.PORT || 3000;

const SOLANA_RPC_URL = SOLANA_ENVIRONMENT === 'mainnet' ? process.env.MAINNET_RPC_URL as string : (process.env.DEVNET_RPC_URL || 'https://api.devnet.solana.com');
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || '';

const platformWallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(WALLET_PRIVATE_KEY)));
const platformWallet1 = new PublicKey("7tMpmwww2ZXu8kwNXh88tQS72h2eS86LGm5A3cPJbZZx")
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const readOnlyProvider = new AnchorProvider(connection, new Wallet(platformWallet), {});
const programId = new PublicKey(process.env.PROGRAM_ID as any);
const platformId = new PublicKey(process.env.PLATFORM_ID as any);

const program = new Program<AiAgent>(IDL, readOnlyProvider);
const POOL_SEED_PREFIX = "liquidity_pool"
const SOL_VAULT_PREFIX = "liquidity_sol_vault"
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}






const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

let cachedSolanaPrice: number | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 15 * 60 * 1000;



async function uploadToS3(
  name: string, 
  symbol: string, 
  imageBuffer: Buffer,
  contentType: string
): Promise<{metadataUri: string, imageUrl: string}> {
  try {

    const uniqueId = uuidv4();
    
    const imageKey = `token-images/${uniqueId}.png`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: imageKey,
      Body: imageBuffer,
      ContentType: contentType
    }));

    const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;

    const metadata = {
      name,
      symbol,
      description: `${name} token for our finz.fun`,
      image: imageUrl
    };

    const metadataKey = `token-metadata/${uniqueId}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: metadataKey,
      Body: JSON.stringify(metadata),
      ContentType: 'application/json'
    }));

    return {metadataUri: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${metadataKey}`, imageUrl: imageUrl}
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
}



interface TweetData {
  name: string;
  username: string;
  content: string;
  timestamp: string;
  ca: string;
  tweetImage?: string | null;
  avatarUrl?: string;
}


async function generateTweetImage(tweetData: TweetData): Promise<Buffer> {

  function formatTimestamp(timestamp: number | string): string {
    const date = new Date(Number(timestamp) * 1000); // Convert Unix timestamp to milliseconds
    
    // Format time
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12; // Convert 24h to 12h format
    const formattedMinutes = minutes.toString().padStart(2, '0');
    
    // Format date
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();
  
    return `${formattedHours}:${formattedMinutes} ${ampm} · ${month} ${day}, ${year}`;
  }
  const cleanContent = (content: string) => {
    return content
      .replace(/\s+https:\/\/t\.co\/\w+$/, '') 
      .replace(/@finzfunAI\s*/g, '');
  };

  function formatWalletAddress(address: string): string {
    if (!address) return '';
    // Take first 4 and last 4 characters
    const start = address.slice(0, 4);
    const end = address.slice(-4);
    return `${start}...${end}`;
  }

  const html= `<html>

  <head>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html,
      body {
        width: 598px;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: black;
        overflow: hidden;
        height: fit-content;
      }

      .tweet {
        background-color: black;
        color: white;
        padding: 16px;
        max-width: 598px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        margin: 0;
      }

      .time-date {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 12px;
        margin-bottom: 0;
        color: rgb(113, 118, 123);
        width: 100%;
      }

      .td {
        color: rgb(113, 118, 123);
        font-size: 15px;
        flex: 1;
      }

      .logo {
        margin-left: 12px;
        /* margin-top: 8px; */
        display: flex;
        align-items: center;
      }

      .logo img {
        height: 34px;
        width: auto;
        border-radius: 5px;
      }

      .container {
        display: flex;
      }

      .avatar-container {
        flex-shrink: 0;
        margin-right: 12px;
      }

      .avatar {
        width: 40px;
        height: 40px;
      }

      .avatar img {
        width: 100%;
        height: 100%;
        border-radius: 9999px;
        object-fit: cover;
      }

      .content-container {
        flex: 1;
        min-width: 0;
      }

      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        width: 100%;
      }

      .user-info {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }

      .name-row {
        display: flex;
        align-items: center;
      }

      .name {
        font-weight: 700;
        font-size: 15px;
        color: white;
        line-height: 1.2;
        margin-right: 12px;
      }

      .ca {
        color: rgb(113, 118, 123);
        font-size: 15px;
        margin-left: auto;
        margin-top: 4px;
      }

      .username {
        color: rgb(113, 118, 123);
        font-size: 15px;
        line-height: 1.2;
      }

      .dot {
        color: rgb(113, 118, 123);
        margin: 0 4px;
      }


      .more-button {
        color: rgb(113, 118, 123);
      }

      .more-button svg {
        width: 20px;
        height: 20px;
      }

      .tweet-content {
        margin-top: 10px;
        font-size: 17px;
        line-height: 1.3;
        white-space: pre-wrap;
        color: white;
        word-wrap: break-word;
        overflow-wrap: break-word;
        margin-bottom: 12px;
      }


      .tweet-image {
        margin-top: 10px;
        margin-bottom: 12px;
        border-radius: 16px;
        overflow: hidden;
        max-width: 100%;
      }

      .tweet-image img {
        width: 100%;
        height: auto;
        max-height: 350px;
        object-fit: cover;
        display: block;
      }
    </style>
  </head>

  <body>
    <div class="tweet">
      <div class="container">
        <div class="avatar-container">
          <div class="avatar">
            <img src="${tweetData.avatarUrl}" alt="https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_400x400.jpg" />
          </div>
        </div>
        <div class="content-container">
          <div class="header">
            <div class="user-info">
              <div class="name-row">
                <span class="name">${tweetData.name}</span>
              </div>
              <span class="username">@${tweetData.username}</span>
            </div>
            <span class="ca">${formatWalletAddress(tweetData.ca)}</span>
            <div class="logo">
              <img src="https://finz.fun/logo.png" alt="Logo" />
            </div>
          </div>

          <div class="tweet-content">${cleanContent(tweetData.content)}</div>

          ${tweetData.tweetImage ? `
            <div class="tweet-image">
              <img src="${tweetData.tweetImage}" alt="Tweet image" />
            </div>
          ` : ''}

          <div class="time-date">
            <div class="td">${formatTimestamp(tweetData.timestamp)}</div>
          </div>
        </div>
      </div>
    </div>
  </body>

</html>`;
  // Adjust height calculation to include image height if present
  const contentLength = tweetData.content.length;
  const lineHeight = 20;
  const charsPerLine = 60;
  const estimatedLines = Math.ceil(contentLength / charsPerLine);
  const baseHeight = 120;
  const imageHeight = tweetData.tweetImage ? 350 : 0; // Add image height if present
  const estimatedHeight = baseHeight + (estimatedLines * lineHeight) + imageHeight;

  const image = await nodeHtmlToImage({
    html,
    quality: 100,
    type: 'png',
    puppeteerArgs: {
      args: ['--no-sandbox'],
      defaultViewport: {
        width: 598,
        height: estimatedHeight,
      },
    },
  });

  return image as Buffer;
}

// Initialize route
// app.post('/initialize', async (req: Request, res: Response) => {
//   try {
//     const tx = new Transaction()
//     .add(
//       await program.methods
//         .initialize(2)
//         .accounts({
//           admin: platformWallet.publicKey,
//         })
//         .instruction()
//     )
//     tx.feePayer = platformWallet.publicKey
//     tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
//     console.log(await connection.simulateTransaction(tx))
//     const sig = await sendAndConfirmTransaction(connection, tx, [platformWallet], { skipPreflight: true })
//     console.log("Successfully initialized : ", `https://solscan.io/tx/${sig}?cluster=devnet`)

//     res.status(200).send({ message: 'Initialization successful' });
//   } catch (error:any) {
//     res.status(500).send({ error: error.message });
//   }
// });


app.post("/create-token", async (req, res) => {
  try {
    const { tokenName, symbol } = req.query;

    const requiredFields = [
      'tweetId',
      'name',
      'username',
      'content',
      'timestamp',
      'replies',
      'creator',
      'avatarUrl'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // const imageBuffer = Buffer.from(image.split(',')[1], 'base64');
    // const contentType = image.split(';')[0].split(':')[1];
    const contentType = "image/png"

    const mintKeypair = Keypair.generate();
    const tweetData = {
      tweetId: String(req.body.tweetId),
      name: String(req.body.name),
      username: String(req.body.username),
      content: String(req.body.content),
      timestamp: String(req.body.timestamp),
      ca: mintKeypair.publicKey.toBase58(),
      creator: String(req.body.creator),
      avatarUrl: String(req.body.avatarUrl),
      ...(req.body.tweetImage && { tweetImage: String(req.body.tweetImage) })
    };
    const imageBuffer = await generateTweetImage(tweetData);

    const {metadataUri, imageUrl} = await uploadToS3(tokenName as string, symbol as string, imageBuffer, contentType);
    await Token.create({
      creator: tweetData.creator,
      name:tokenName,
      symbol,
      metadataUri,
      imageUrl: imageUrl,
      tweetId: tweetData.tweetId,
      mintAddress: mintKeypair.publicKey.toBase58(),
      secretKey: Buffer.from(mintKeypair.secretKey).toString('base64')
    })

    // await mintTo(
    //   connection,
    //   platformWallet,
    //   mint,
    //   platformTokenAccount.address,
    //   platformWallet,
    //   BigInt(TOTAL_SUPPLY.toString())
    // );

    // await setAuthority(
    //   connection,
    //   platformWallet,
    //   mint,
    //   0,
    //   null
    // );
    

    res.json({
      success: true,
      secretKey: Buffer.from(mintKeypair.secretKey).toString('base64'),
      tokenMint: mintKeypair.publicKey.toBase58(),
      name: tokenName,
      symbol,
      metaData: metadataUri
    });

  } catch (error: any) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post("/create-add-liquidity-transaction", async (req, res) => {
  try {
    const { mintAddress, solAmount, account} = req.body; 

    const token = await Token.findOne({mintAddress})
    if(!token){
      throw new Error("Token not found")
    }
    const secretKey = token?.secretKey as string
    const secretKeyUint8Array = Uint8Array.from(
      Buffer.from(secretKey, 'base64')
    );
    const mintsecretpair = Keypair.fromSecretKey(secretKeyUint8Array);
    const mintSecretKey = mintsecretpair.secretKey
    const user = new PublicKey(account);
    const creator = await Creator.findOne({twitterId: token?.creator})
    if(!creator){
      throw new Error("Creator not found")
    }
    // const umi = createUmi(SOLANA_RPC_URL)
	  // .use(mplTokenMetadata())
	  // .use(mplToolbox());
    
    const mintKeypair = Keypair.fromSecretKey(new Uint8Array(mintSecretKey));
    // const keypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(WALLET_PRIVATE_KEY)))
    // const mintpair = umi.eddsa.createKeypairFromSecretKey(mintSecretKey)
    

    // const mintSigner = createSignerFromKeypair(umi, mintpair);

    // umi.use(keypairIdentity(keypair,true))



    // const platformTokenAccount = await getAssociatedTokenAddress(
    //   mintKeypair.publicKey,
    //   platformWallet.publicKey
    // );

    // const TOTAL_SUPPLY = new BN(1000000000).mul(new BN(10 ** 9))

    // const tokenMetadata = {
    //   name: token?.name as string,
    //   symbol: token?.symbol as string,
    //   uri: token?.metadataUri as string
    // };

    // const metadataAccountAddress = findMetadataPda(umi, {
    //   mint: publicKey(mintKeypair.publicKey.toBase58()),
    // });
    
    // const INITIAL_LIQUIDITY_SOL =Math.floor(parseFloat("0.02") * 1e9); 
    const buyAmount = Math.floor(parseFloat(solAmount)); 

    // const userTokenAccount = await getAssociatedTokenAddress(
    //   mintKeypair.publicKey,
    //   user
    // );

    // const [poolPda] = PublicKey.findProgramAddressSync(
    //   [Buffer.from(POOL_SEED_PREFIX), mintKeypair.publicKey.toBuffer()],
    //   program.programId
    // );

    // const [poolSolVault] = PublicKey.findProgramAddressSync(
    //   [Buffer.from(SOL_VAULT_PREFIX), mintKeypair.publicKey.toBuffer()],
    //   program.programId
    // );

    // const poolTokenAccount = await getAssociatedTokenAddress(
    //   mintKeypair.publicKey, 
    //   poolPda, 
    //   true
    // );


    // const metadataTx = createV1(umi, {
    //   mint: mintSigner,
    //   authority: umi.identity,
    //   updateAuthority: umi.identity,
    //   name: tokenMetadata.name,
    //   symbol: tokenMetadata.symbol,
    //   uri: tokenMetadata.uri,
    //   sellerFeeBasisPoints: percentAmount(0),
    //   tokenStandard: TokenStandard.Fungible,
    // })
    
    // const metadataInstructions = metadataTx.getInstructions().map(umiIx => {
    //   return new TransactionInstruction({
    //     keys: umiIx.keys.map(key => ({
    //       pubkey: new PublicKey(key.pubkey.toString()),
    //       isSigner: key.isSigner,
    //       isWritable: key.isWritable
    //     })),
    //     programId: new PublicKey(umiIx.programId.toString()),
    //     data: Buffer.from(umiIx.data)
    //   });
    // });

  //   const mintAuthorityInstruction = createSetAuthorityInstruction(
  //     mintKeypair.publicKey,
  //     platformWallet.publicKey,
  //     AuthorityType.MintTokens,
  //     null
  // )
   
  // createMint(connection, platformWallet, platformWallet.publicKey, null, 9, mintKeypair)

  //  const lamports = await getMinimumBalanceForRentExemptMint(connection);

    const tx = new Transaction()
    // .add(
    //   SystemProgram.createAccount({
    //     fromPubkey: user,
    //     newAccountPubkey: mintKeypair.publicKey,
    //     space: MINT_SIZE,
    //     lamports,
    //     programId: TOKEN_PROGRAM_ID
    // }),
    // createInitializeMint2Instruction(mintKeypair.publicKey, 9, platformWallet.publicKey, null, TOKEN_PROGRAM_ID),
    // createAssociatedTokenAccountInstruction(platformWallet.publicKey, platformTokenAccount, platformWallet.publicKey, mintKeypair.publicKey),
    // createMintToInstruction(mintKeypair.publicKey, platformTokenAccount, platformWallet.publicKey, BigInt(TOTAL_SUPPLY.toString()))
    // )


    // tx.add(...metadataInstructions)    
    const raydium = await initSdk()
    const  mintA = mintKeypair.publicKey
    const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey

    const configData = await raydium.connection.getAccountInfo(configId)
    if (!configData) throw new Error('config not found')
    const configInfo = LaunchpadConfig.decode(configData.data)
    const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB)

    const { execute, transactions, extInfo } = await raydium.launchpad.createLaunchpad({
      programId,
      mintA,
      decimals: 6,
      name: token?.name as string,
      symbol: token?.symbol as string,
      migrateType: 'cpmm',
      uri: token?.metadataUri as string,
  
      configId,
      // configInfo, // optional, sdk will get data by configId if not provided
      mintBDecimals: mintBInfo.decimals, // default 9
      platformId: new PublicKey(platformId),
      txVersion: TxVersion.LEGACY,
      slippage: new BN(100), // means 1%
      buyAmount: new BN(buyAmount),
      createOnly: false, // true means create mint only, false will "create and buy together"
      extraSigners: [mintKeypair],
  
      supply: new BN(1_000_000_000_000_000), // lauchpad mint supply amount, default: LaunchpadPoolInitParam.supply
      totalSellA: new BN(793_100_000_000_000),  // lauchpad mint sell amount, default: LaunchpadPoolInitParam.totalSellA
      totalFundRaisingB: new BN(85_000_000_000),  // if mintB = SOL, means 85 SOL, default: LaunchpadPoolInitParam.totalFundRaisingB
      // totalLockedAmount: new BN(0),  // total locked amount, default 0
      // cliffPeriod: new BN(0),  // unit: seconds, default 0
      // unlockPeriod: new BN(0),  // unit: seconds, default 0
  
      // shareFeeReceiver: new PublicKey(platformWallet.publicKey.toString()), // only works when createOnly=false
      // shareFeeRate: new BN(1000), // only works when createOnly=false
  
      // computeBudgetConfig: {
      //   units: 600000,
      //   microLamports: 46591500,
      // },
    })

    tx.add(...transactions)
    tx.feePayer = user;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.partialSign(mintKeypair)

    const serializedTransaction = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    }).toString('base64');

    res.json({
      success: true,
      transaction: serializedTransaction,
      message: "Transaction created successfully. Sign and submit to add liquidity and buy tokens.",
      // initialLiquiditySol: INITIAL_LIQUIDITY_SOL/1e9,
      buyAmountSol: buyAmount / 1e9,
      tx: tx
    });

  } catch (error: any) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});





// Remove liquidity route
// app.post('/remove-liquidity', async (req: Request, res: Response) => {
//   try {
//     const { pool, tokenMint, poolTokenAccount, userTokenAccount, poolSolVault, user, bump } = req.body;

//     await program.methods
//       .removeLiquidity(bump)
//       .accounts({
//         pool: new PublicKey(pool),
//         tokenMint: new PublicKey(tokenMint),
//         poolTokenAccount: new PublicKey(poolTokenAccount),
//         userTokenAccount: new PublicKey(userTokenAccount),
//         poolSolVault: new PublicKey(poolSolVault),
//         user: new PublicKey(user),
//         rent: web3.SYSVAR_RENT_PUBKEY,
//         systemProgram: web3.SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
//       })
//       .rpc();

//     res.status(200).send({ message: 'Liquidity removed successfully' });
//   } catch (error:any) {
//     res.status(500).send({ error: error.message });
//   }
// });




const fetchPoolData = async (tokenMint:string)=>{
  try{
    const VIRTUAL_SOL = new BN(25_000_000_000);
    const mint = new PublicKey(tokenMint)
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
      program.programId
    );
    const stateData = await program.account.liquidityPool.fetch(poolPda)
    const reserveSol = stateData.reserveSol
  
    const totalSolWithVirtual = reserveSol.add(VIRTUAL_SOL);
    
    const mcapInSol = parseInt(totalSolWithVirtual.toString())/ parseInt((new BN(1_000_000_000)).toString());
  
    return { price:mcapInSol}
  } catch (error:any) {
    console.log(error)
    return { price:0}
}
}

const fetchReserveToken = async (tokenMint: string) => {
  try {
    const token = await Token.findOne({ mintAddress: tokenMint });
    const creator = await Creator.findOne({ twitterId: token?.creator });
    if (!token) {
      console.log("Token not found in database:", tokenMint);
      return { 
        reserveToken: new BN(0), 
        mcap: 0,
        creatorName: creator?.username,
        creatorImage: creator?.profileImage,
        tweetLink: null,
        tokenName: null,
        tokenSymbol: null, 
        isLiquidityActive: false,
        imageUrl: null 
      };
    }

    try {
      const VIRTUAL_SOL = new BN(25_000_000_000);
      const mint = new PublicKey(tokenMint);
      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
        program.programId
      );
      const stateData = await program.account.liquidityPool.fetch(poolPda);
      const reserveSol = stateData.reserveSol
  
      const totalSolWithVirtual = reserveSol.add(VIRTUAL_SOL);
    
      const mcapInSol = parseInt(totalSolWithVirtual.toString())/ parseInt((new BN(1_000_000_000)).toString());
      
      return { 
        reserveToken: stateData.reserveToken,
        mcap: mcapInSol,
        creatorName: creator?.username,
        creatorImage: creator?.profileImage,
        tweetLink: `https://x.com/${creator?.username}/status/${token.tweetId}`,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        isLiquidityActive: token.liquidity,
        imageUrl: token.imageUrl
      };
    } catch (onChainError) {
      console.log("Failed to fetch on-chain data:", onChainError);
      return { 
        reserveToken: new BN(0),
        mcap: 0,
        creatorName: creator?.username,
        creatorImage: creator?.profileImage,
        tweetLink: `https://x.com/${creator?.username}/status/${token.tweetId}`,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        isLiquidityActive: token.liquidity,
        imageUrl: token.imageUrl
      };
    }
  } catch (dbError) {
    console.log("Database error:", dbError);
    return { 
      reserveToken: new BN(0), 
      mcap: 0,
      creatorName: null,
      creatorImage: null,
      tweetLink: null,
      tokenName: null,
      tokenSymbol: null, 
      isLiquidityActive: false,
      imageUrl: null 
    };
  }
};


app.get('/blinks/:tokenMint', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const baseHref = `/api/blinks/${tokenMint}`
    const poolData = await fetchPoolData(tokenMint);
    const token = await Token.findOne({mintAddress:tokenMint})
    const tokenData= {
      title: token?.name,
      description: "Trade $"+token?.symbol+" token from finz platform launched by AI agents! Trade here: https://app.finz.fun/coin?tokenMint="+tokenMint,
      icon: token?.imageUrl,
      label: "Trade Token",
    }

    const blinksMetadata = {
      type: "action",
      title: tokenData.title,
      icon: tokenData.icon, 
      description: tokenData.description+`\n`+`Current mcap: ${poolData.price} SOL`,
      label: tokenData.label,
      links: {
        actions: [
          { label: "0.1 SOL buy", href: `${baseHref}/buy?amount=0.1` },
          { label: "0.5 SOL buy", href: `${baseHref}/buy?amount=0.5` },
          { label: "1 SOL buy", href: `${baseHref}/buy?amount=1` },
          // { label: "2 SOL buy", href: `${baseHref}/buy&amount=2` },
          {
            label: "Buy Tokens",
            href: `${baseHref}/buy?amount={amount}`,
            parameters: [
              {
                name: "amount",
                type: "string",
                label: "SOL Amount",
                required: true,
                placeholder: "Enter SOL amount",
                pattern: "^[0-9]*[.]?[0-9]{0,2}$",
                min: 0.01,
                max: 100,
                patternDescription: "Enter amount between 0.01 and 100 SOL (max 2 decimal places)"
              }
            ]
          },
          {
            label: "Sell Tokens",
            href: `${baseHref}/sell?amount={amount}`,
            parameters: [
              {
                name: "amount",
                type: "string",
                label: "Token Amount",
                required: true,
                placeholder: "Enter percentage",
                pattern: "^[0-9]{1,10}$",
                patternDescription: "Enter token amount to sell"
              }
            ]
          },
          // { label: "25% sell", href: `${baseHref}/sell&percentage=25` },
          { label: "50% sell", href: `${baseHref}/sell?percentage=50` },
          { label: "75% sell", href: `${baseHref}/sell?percentage=75` },
          { label: "100% sell", href: `${baseHref}/sell?percentage=100` },
        ]
      }
    };

    res.json(blinksMetadata);
  } catch (error: any) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/blinks/:tokenMint/buy', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const {amount} = req.query
    const {account} = req.body;


    if (!amount) {
      throw new Error('Amount is required');
    }

    // if(!minTokensOut){
    //   throw new Error('Min tokens out is required');
    // }

    // if(minTokensOut.lt(new BN(0))){
    //   throw new Error('Min tokens out must be greater than 0');
    // }

    // if(minTokensOut.gt(new BN(1000000000000000000))){
    //   throw new Error('Min tokens out must be less than 1000000000000000000');
    // }

    const token = await Token.findOne({mintAddress: tokenMint})
    if(!token){
      throw new Error('Token not found');
    }

    const creator = await Creator.findOne({twitterId: token?.creator})
    if(!creator){
      throw new Error('Creator not found');
    }

    const userPubkey = new PublicKey(account);
    const mint = new PublicKey(tokenMint);

    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      userPubkey,
      false
    );
    
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
      program.programId
    );
    console.log("poolPda", poolPda)
    // const [poolSolVault] = PublicKey.findProgramAddressSync(
    //   [Buffer.from(SOL_VAULT_PREFIX), mint.toBuffer()],
    //   program.programId
    // );
    
    // const poolTokenAccount = await getAssociatedTokenAddress(
    //   mint, poolPda, true
    // );

    const amountInLamports = Math.floor(parseFloat(amount as string) * 1e9);


    const tx = new Transaction();
    

    const tokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
    console.log("tokenAccountInfo", tokenAccountInfo)

    if (!tokenAccountInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          userPubkey,
          userTokenAccount,
          userPubkey,
          mint
        )
      );
    }

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
      await program.methods
        .buy(new BN(amountInLamports), new BN(0))
        .accounts({
          tokenMint: mint,
          user: userPubkey,
          platformFeeWallet1: platformWallet1,
          creatorFeeWallet: new PublicKey(creator.walletAddress as string)
        })
        .instruction()
    );

    console.log("tx", tx)
    tx.feePayer = userPubkey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;


    const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');

    res.json({
      transaction: serializedTx,
      message: `Buy ${amount} SOL worth of tokens`
    });
  } catch (error: any) {
    console.error('Buy error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/blinks/:tokenMint/sell', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const { amount, percentage } = req.query;
    const { account } = req.body;

    if (!amount && !percentage) {
      throw new Error('Either amount or percentage is required');
    }

    // if(!minSolOut){
    //   throw new Error('Min sol out is required');
    // }
    
    // if(minSolOut.lt(new BN(0))){
    //   throw new Error('Min sol out must be greater than 0');
    // }

    // if(minSolOut.gt(new BN(50000000000))){
    //   throw new Error('Min sol out must be less than 50000000000');
    // }

    const token = await Token.findOne({mintAddress: tokenMint})
    if(!token){
      throw new Error('Token not found');
    }
    
    const creator = await Creator.findOne({twitterId: token?.creator})
    if(!creator){
      throw new Error('Creator not found');
    }

    

    const userPubkey = new PublicKey(account);
    const mint = new PublicKey(tokenMint);


    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      userPubkey,
      false
    );

    try {
      const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);

      if (!tokenBalance.value.amount || tokenBalance.value.amount === '0') {
        throw new Error('No tokens to sell');
      }

      let tokenAmount: BN;
      let sellMessage: string;

      if (percentage) {
        const sellPercentage = parseInt(percentage as string) / 100;
        const rawAmount = new BN(tokenBalance.value.amount);
        tokenAmount = rawAmount.muln(sellPercentage);
        sellMessage = `Sell ${tokenBalance.value.uiAmount as number * sellPercentage} tokens (${percentage}% of your balance)`;
      } else {
        const rawAmount = parseFloat(amount as string) * 1e9;
        tokenAmount = new BN(Math.floor(rawAmount));
        
        if (tokenAmount.gt(new BN(tokenBalance.value.amount))) {
          throw new Error('Insufficient token balance');
        }
        sellMessage = `Sell ${amount} tokens`;
      }
      
      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
        program.programId
      );

      const [poolSolVault, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from(SOL_VAULT_PREFIX), mint.toBuffer()],
        program.programId
      );

      const poolTokenAccount = await getAssociatedTokenAddress(
        mint,
        poolPda,
        true
      );

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
        await program.methods
          .sell(tokenAmount, bump, new BN(0))
          .accounts({
            tokenMint: mint,
            user: userPubkey,
            platformFeeWallet1: platformWallet1,
            creatorFeeWallet: new PublicKey(creator.walletAddress as string)
          })
          .instruction()
      );

      tx.feePayer = userPubkey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');

      res.json({
        transaction: serializedTx,
        message: sellMessage
      });
    } catch (error: any) {
      if (error.message.includes('Account does not exist')) {
        throw new Error('No token account found. You need tokens to sell.');
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Sell error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:tokenMint/pool-data', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const token = await fetchReserveToken(tokenMint);
    res.json({reserveToken: token.reserveToken.toString(), tokenName:token.tokenName, tokenSymbol:token.tokenSymbol, isLiquidityActive:token.isLiquidityActive, imageUrl:token.imageUrl, creatorName:token.creatorName, mcap:token.mcap.toString(), creatorImage:token.creatorImage, tweetLink:token.tweetLink});
  } catch (error: any) {
    console.error('Error fetching pool data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:tokenMint/add-liquidity', async (req: Request, res: Response) => {
  const { tokenMint } = req.params;
  const token = await Token.findOne({mintAddress:tokenMint})
  if (token) {
    token.liquidity = true
    await token.save()
    res.json({success: true, message: "Liquidity added successfully"});
  } else {
    res.status(404).json({error: "Token not found"});
  }
})


// app.get('/generate', async (req: Request, res: Response) => {
//   try {
//     const tweetData = {
//       name: String(req.query.name || 'John Doe'),
//       username: String(req.query.username || 'johndoe'),
//       content: String(req.query.content || 'Hello, World!'),
//       timestamp: String(req.query.timestamp || '2h'),
//       replies: Number(req.query.replies || 0),
//       retweets: Number(req.query.retweets || 0),
//       likes: Number(req.query.likes || 0),
//     };

//     const imageBuffer = await generateTweetImage(tweetData);

//     res.setHeader('Content-Type', 'image/png');
//     res.send(imageBuffer);

//   } catch (error) {
//     console.error('Error generating tweet image:', error);
//     res.status(500).json({
//       error: 'Failed to generate image',
//       message: error instanceof Error ? error.message : 'Unknown error'
//     });
//   }
// });


app.put('/api/creators/agent-status', async (req: Request, res: Response) => {
  try {
    const { twitterId, agentEnabled } = req.body;

    // Find and update the creator
    const creator = await Creator.findOneAndUpdate(
      { twitterId },
      { agentEnabled },
      { new: true } // Return the updated document
    );

    if (!creator) {
      res.status(404).json({ error: 'Creator not found' });
      return
    }

    // Return the updated creator
    res.json({
      success: true,
      agentEnabled: creator.agentEnabled,
      message: `AI agent ${agentEnabled ? 'enabled' : 'disabled'} successfully`
    });
    return

  } catch (error) {
    console.error('Error updating agent status:', error);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
});

app.get('/api/tokens', async (req: Request, res: Response) => {
  try {

    interface tokenType {
      title: string;
      symbol: string;
      imageUrl: string;
      priceSol: number;
      avatarUrl: string;
      tokenMint: string;
      tweetLink: string;
      username: string;
    }
    const tokens = await Token.find();
    
    const tokenDataPromises = tokens.map(async (token) => {
      try {
        const poolData = await fetchPoolData(token.mintAddress as string);
        const creator = await Creator.findOne({ twitterId: token.creator });
        
        return {
          title: token.name,
          symbol: token.symbol,
          imageUrl: token.imageUrl,
          priceSol: poolData.price,
          avatarUrl: creator?.profileImage || '',
          tokenMint: token.mintAddress,
          tweetLink:  `https://x.com/${creator?.username}/status/${token.tweetId}`,
          username: creator?.username
        };
      } catch (error) {
        console.error(`Error fetching data for token ${token.mintAddress}:`, error);
        return null;
      }
    });
    const tokenData = (await Promise.all(tokenDataPromises)).filter(
      (token): token is tokenType => token !== null
    );

    res.json(tokenData);
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tokens',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


app.get('/api/tokens/creator/:creatorId', async (req: Request, res: Response) => {
  try {

    interface tokenType {
      title: string;
      symbol: string;
      imageUrl: string;
      priceSol: number;
      avatarUrl: string;
      tokenMint: string;
      tweetLink: string;
      username: string;
    }
    const tokens = await Token.find({creator: req.params.creatorId });
    
    const tokenDataPromises = tokens.map(async (token) => {
      try {
        const poolData = await fetchPoolData(token.mintAddress as string);
        const creator = await Creator.findOne({ twitterId: token.creator });
        
        return {
          title: token.name,
          symbol: token.symbol,
          imageUrl: token.imageUrl,
          priceSol: poolData.price,
          avatarUrl: creator?.profileImage || '',
          tokenMint: token.mintAddress,
          tweetLink:  `https://x.com/${creator?.username}/status/${token.tweetId}`,
          username: creator?.username
        };
      } catch (error) {
        console.error(`Error fetching data for token ${token.mintAddress}:`, error);
        return null;
      }
    });
    const tokenData = (await Promise.all(tokenDataPromises)).filter(
      (token): token is tokenType => token !== null
    );

    res.json(tokenData);
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tokens',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/analytics', async (req: Request, res: Response) => {
  try {
    const tokens = await Token.find();
    const wallets = await Walletmodel.find();
    const mentions = await Mentions.find();
    let totalCreators = 0;
    let totalTokensCreated = tokens.length;

    const creators = await Creator.find();
    totalCreators = creators.length;

    const nonCreatorUsers = wallets.length - totalCreators;
    const totalMentions = mentions.length;  

    res.json({
      totalUsers: wallets.length,
      numberOfMentions: totalMentions,
      numberOfCreators: totalCreators,
      nonCreatorUsers: nonCreatorUsers > 0 ? nonCreatorUsers : 0,
      totalTokensCreated: totalTokensCreated
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


app.get("/candles/:tokenMint", async (req, res) => {
  const { tokenMint } = req.params;
  const { start, end } = req.query;
  
  try {
    const startTime = Number(start) || 0;
    const endTime = Number(end) || Math.floor(Date.now() / 1000);
    
    // Convert Unix timestamps to Date objects for MongoDB time series query
    const startDate = new Date(startTime * 1000);
    const endDate = new Date(endTime * 1000);
    
    // Use the separate candle DB connection
    const db = getCandleDbConnection().useDb('candles');
 
    const historicalCandles = await db.collection('candles').aggregate([
      { 
        $match: {
          m: tokenMint, 
          t: { $gte: startDate, $lte: endDate }
        }
      },
      { 
        $sort: { t: 1 } 
      },
      {
        // Convert Date objects back to Unix timestamps for the frontend
        $addFields: {
          t: { $divide: [{ $toLong: "$t" }, 1000] }
        }
      },
      { 
        $project: {
          _id: 0,
          t: 1, 
          o: 1, 
          h: 1, 
          l: 1, 
          c: 1
        }
      }
    ]).toArray();
    
    const currentCandleDoc = await db.collection('current_candles').findOne(
      { m: tokenMint },
      { projection: { _id: 0, candle: 1 } }
    );
    
    const response = [
      ...historicalCandles,
      ...(currentCandleDoc?.candle ? [currentCandleDoc.candle] : [])
    ];
    res.json(response);
  } catch (error:any) {
    console.error('Error fetching candles:', error);
    res.status(500).json({ error: "Failed to fetch candles" });
  }
});


app.get('/transactions/:tokenMintAddress', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 100;
  const recentTransactions = await TransactionModel.find({ tokenMintAddress: req.params.tokenMintAddress })
  .sort({ timestamp: -1 })
  .limit(limit);
  const transactions = recentTransactions.map((transaction) => ({
    type: transaction.type,
    timestamp: transaction.timestamp,
    solAmount: transaction.solAmount,
    walletAddress: transaction.walletAddress,
    tokenAmount: transaction.tokenAmount,
    signature: transaction.signature
  }));
  res.json(transactions);
});


app.get('/actions.json', (req: Request, res: Response) => {
  res.json({
    rules: [
      {
        pathPattern: "/blinks/*",
        apiPath: "/blinks/*"
      },
      {
        pathPattern: "/api/blinks/**",
        apiPath: "/api/blinks/**"
      }
    ]
  });
});

app.get(`/health`, (req: Request, res: Response) => {
  res.send("ok");
});






app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
