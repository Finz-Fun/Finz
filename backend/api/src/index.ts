import express, { Request, Response } from 'express';
import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {createCloseAccountInstruction, getAssociatedTokenAddress, NATIVE_MINT} from "@solana/spl-token"
import { BN } from '@coral-xyz/anchor';
import { actionCorsMiddleware, ACTIONS_CORS_HEADERS, BLOCKCHAIN_IDS } from "@solana/actions"
import cors from "cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';
import Creator from './models/creatorSchema';
import { connectCandleDB, connectDB, getCandleDbConnection } from './db';
import nodeHtmlToImage from 'node-html-to-image';
import { Token } from './models/tokenSchema';
import Walletmodel from './models/walletSchema';
import Mentions from './models/mentionsSchema';
import { Transaction as TransactionModel } from './models/transactionSchema';

import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import * as dotenv from 'dotenv';

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
  getPdaLaunchpadConfigId,
  LaunchpadConfig,
  LaunchpadPool,
  Raydium,
  API_URLS,
  LaunchpadConfigInfo,
  DEVNET_PROGRAM_ID,
  CREATE_CPMM_POOL_PROGRAM,
} from '@raydium-io/raydium-sdk-v2'
import { initSdk } from './config'
import axios from 'axios';
import Decimal from 'decimal.js';
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
const CREATION_SECRET = process.env.CREATION_SECRET as string;
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

const programId = new PublicKey(process.env.PROGRAM_ID as any);
const platformId = new PublicKey(process.env.PLATFORM_ID as any);

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
      .replace(/@TweetToToken\s*/g, '');
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

    const creationSecret = req.body.creationSecret
    if(!creationSecret){
      throw new Error("Creation secret is required")
    }
    if(creationSecret !== CREATION_SECRET){
      throw new Error("Invalid creation secret")
    }
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
    const { mintAddress, account} = req.body; 

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
    
    
    const mintKeypair = Keypair.fromSecretKey(new Uint8Array(mintSecretKey));
    

   const walletAddress = creator.walletAddress
    // tx.add(...metadataInstructions)    
    const raydium = await Raydium.load({
      owner: walletAddress ? new PublicKey(walletAddress) : user,
      connection,
      cluster: SOLANA_ENVIRONMENT as "mainnet" | "devnet",
      disableFeatureCheck: true,
      disableLoadToken: true,
      blockhashCommitment: 'confirmed',
      // urlConfigs: {
      //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
      // },
    })
    const  mintA = mintKeypair.publicKey
    const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey

    const configData = await raydium.connection.getAccountInfo(configId)
    if (!configData) throw new Error('config not found')
    const configInfo = LaunchpadConfig.decode(configData.data)
    const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB)

    const { transactions} = await raydium.launchpad.createLaunchpad({
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
      buyAmount: new BN(1),
      createOnly: true, // true means create mint only, false will "create and buy together"
      feePayer: user, // ADDED: Ensure the fee payer is correctly set
  
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
    
    const createTx = transactions[0]; // Cast to VersionedTransaction for clarity
    
    createTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    createTx.partialSign(mintKeypair);
    const serializedCreateTransaction = createTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
   
    const serializedCreateTransactionString = Buffer.from(serializedCreateTransaction).toString('base64');


    res.json({
      success: true,
      createTransaction: serializedCreateTransactionString, // Send as base64 string
      message: "Transaction created successfully. Sign and submit to add liquidity.",
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



const fetchReserveToken = async (tokenMint: string) => {
  try {
    const token = await Token.findOne({ mintAddress: tokenMint });
    const creator = await Creator.findOne({ twitterId: token?.creator });
    if (!token) {
      console.log("Token not found in database:", tokenMint);
      return { 
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
      
      return { 
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
      description: tokenData.description,  //todo: add mcap
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

    
    const mintA = new PublicKey(tokenMint)
    const mintB = NATIVE_MINT
 // devnet: DEV_LAUNCHPAD_PROGRAM

      const raydium = await Raydium.load({
        owner: userPubkey,
        connection,
        cluster: SOLANA_ENVIRONMENT as "mainnet" | "devnet",
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: 'confirmed',
      })
      const amountInLamports = Math.floor(parseFloat(amount as string) * 1e9);
      const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId })
      const data = await raydium.connection.getAccountInfo(poolInfo.platformId)
      const platformInfo = PlatformConfig.decode(data!.data)
      
      const { transaction:tx } = await raydium.launchpad.buyToken({
        programId,
        mintA,
        slippage: new BN(100),
        // mintB, // default is sol
        configInfo: poolInfo.configInfo,

        platformFeeRate: platformInfo.feeRate,
        txVersion: TxVersion.LEGACY,
        buyAmount: new BN(amountInLamports),
      })
    
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
        const rawAmount = parseFloat(amount as string) * 1e6;
        tokenAmount = new BN(Math.floor(rawAmount));
        
        if (tokenAmount.gt(new BN(tokenBalance.value.amount))) {
          throw new Error('Insufficient token balance');
        }
        sellMessage = `Sell ${amount} tokens`;
      }
    
      const mintB = NATIVE_MINT
 // devnet: DEV_LAUNCHPAD_PROGRAM

      const raydium = await Raydium.load({
        owner: userPubkey,
        connection,
        cluster: SOLANA_ENVIRONMENT as "mainnet" | "devnet",
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: 'confirmed',
      })

      const poolId = getPdaLaunchpadPoolId(programId, mint, mintB).publicKey
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId })
      const data = await raydium.connection.getAccountInfo(poolInfo.platformId)
      const platformInfo = PlatformConfig.decode(data!.data)
      
      const { transaction:tx } = await raydium.launchpad.sellToken({
        programId,
        mintA: mint,
        slippage: new BN(100),
        // mintB, // default is sol
        configInfo: poolInfo.configInfo,

        platformFeeRate: platformInfo.feeRate,
        txVersion: TxVersion.LEGACY,
        sellAmount: tokenAmount,
      })
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
    res.json({tokenName:token.tokenName, tokenSymbol:token.tokenSymbol, isLiquidityActive:token.isLiquidityActive, imageUrl:token.imageUrl, creatorName:token.creatorName,  creatorImage:token.creatorImage, tweetLink:token.tweetLink});
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
      avatarUrl: string;
      tokenMint: string;
      tweetLink: string;
      username: string;
      mcap: number;
    }
    const tokens = await Token.find();
  
    const raydium = await initSdk();
    const mintB = NATIVE_MINT;
    
    const tokenDataPromises = tokens.map(async (token) => {
      try {
        const creator = await Creator.findOne({ twitterId: token.creator });
        try {
        
          const mintA = new PublicKey(token.mintAddress as string);
          
          const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey;
          const r = await raydium.connection.getAccountInfo(poolId);
          const info = LaunchpadPool.decode(r!.data);
      
          const configData = await raydium.connection.getAccountInfo(info.configId);
          const configInfo = LaunchpadConfig.decode(configData!.data);
  
          const poolPrice = (Curve.getPrice({
            poolInfo: info,
            curveType: configInfo.curveType,
            decimalA: info.mintDecimalsA,
            decimalB: info.mintDecimalsB,
          }).toNumber())*1e9;
          
          return {
            title: token.name,
            symbol: token.symbol,
            imageUrl: token.imageUrl,
            avatarUrl: creator?.profileImage || '',
            tokenMint: token.mintAddress,
            tweetLink:  `https://x.com/${creator?.username}/status/${token.tweetId}`,
            username: creator?.username,
            mcap: poolPrice || 30
          };
        } catch (error) {
          return {
            title: token.name,
            symbol: token.symbol,
            imageUrl: token.imageUrl,
            avatarUrl: creator?.profileImage || '',
            tokenMint: token.mintAddress,
            tweetLink:  `https://x.com/${creator?.username}/status/${token.tweetId}`,
            username: creator?.username,
            mcap: 30
          };
        }
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
      avatarUrl: string;
      tokenMint: string;
      tweetLink: string;
      username: string;
      mcap: number;
    }
    
    const tokens = await Token.find({creator: req.params.creatorId });
    const raydium = await initSdk();
    const mintB = NATIVE_MINT;
    const tokenDataPromises = tokens.map(async (token) => {
      try {
        const creator = await Creator.findOne({ twitterId: token.creator });
        const mintA = new PublicKey(token.mintAddress as string);
        
        const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey;
        const r = await raydium.connection.getAccountInfo(poolId);
        const info = LaunchpadPool.decode(r!.data);
    
        const configData = await raydium.connection.getAccountInfo(info.configId);
        const configInfo = LaunchpadConfig.decode(configData!.data);

        const poolPrice = (Curve.getPrice({
          poolInfo: info,
          curveType: configInfo.curveType,
          decimalA: info.mintDecimalsA,
          decimalB: info.mintDecimalsB,
        }).toNumber())*1e9;
        
        return {
          title: token.name,
          symbol: token.symbol,
          imageUrl: token.imageUrl,
          avatarUrl: creator?.profileImage || '',
          tokenMint: token.mintAddress,
          tweetLink:  `https://x.com/${creator?.username}/status/${token.tweetId}`,
          username: creator?.username,
          mcap: poolPrice || 30
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



// export const claimPlatformFeeAll = async () => {
//   const raydium = await initSdk()

//   if (raydium.owner === undefined) {
//     console.log('please config owner info')
//     return
//   }

//   const allPlatformPool = await raydium.connection.getProgramAccounts(
//     programId,
//     {
//       filters: [
//         { dataSize: LaunchpadPool.span },
//         { memcmp: { offset: LaunchpadPool.offsetOf('platformId'), bytes: platformId.toString() } },
//       ],
//     },
//   )
//   console.log('allPlatformPool', allPlatformPool.length)

//   const minClaimVault = 10
//   const itemRunClaimPool = 100

//   const cacheMintPriceB: { [mint: string]: number } = {}
//   const cacheConfigInfo: { [configId: string]: LaunchpadConfigInfo } = {}

//   for (let i = 0; i < allPlatformPool.length; i += itemRunClaimPool) {
//     console.log('item start', i)
//     const itemPools = allPlatformPool.slice(i, i + itemRunClaimPool)

//     await Promise.all(itemPools.map(async itemPool => {
//       const poolInfo = LaunchpadPool.decode(itemPool.account.data)
//       const configId = poolInfo.configId.toString()
//       if (cacheConfigInfo[configId] === undefined) {
//         const configInfo = await raydium.connection.getAccountInfo(poolInfo.configId)

//         if (configInfo === null) {
//           console.log('fetch config info error: ' + JSON.stringify({ poolId: itemPool.pubkey.toString(), configId }))
//           return
//         }

//         cacheConfigInfo[configId] = LaunchpadConfig.decode(configInfo.data)
//       }

//       const mintB = cacheConfigInfo[configId].mintB
//       const mintBStr = mintB.toString()

//       if (cacheMintPriceB[mintBStr] === undefined) {
//         const apiPriceUrl = `${API_URLS.BASE_HOST}${API_URLS.MINT_PRICE}` + `?mints=${mintBStr}`
//         const apiData = await (await fetch(apiPriceUrl)).json()
//         cacheMintPriceB[mintBStr] = apiData?.data[mintBStr] ?? 0
//       }

//       const mintPriceB = cacheMintPriceB[mintBStr]

//       const pendingClaim = new Decimal(poolInfo.platformFee.toString()).div(new Decimal(10).pow(poolInfo.mintDecimalsB))
//       const pendingClaimU = pendingClaim.mul(mintPriceB)

//       if (pendingClaimU.lt(minClaimVault)) {
//         console.log('pendingClaimU', pendingClaimU)
//         return
//       }

//       const { execute, transaction, extInfo, builder } = await raydium.launchpad.claimPlatformFee({
//         programId, // devnet: DEV_LAUNCHPAD_PROGRAM
//         platformId,
//         platformClaimFeeWallet: raydium.ownerPubKey,
//         poolId: itemPool.pubkey,

//         mintB: NATIVE_MINT,
//         vaultB: poolInfo.vaultB,

//         txVersion: TxVersion.V0,
//         // computeBudgetConfig: {
//         //   units: 600000,
//         //   microLamports: 600000,
//         // },
//       })

//       // printSimulate([transaction])

//       try {
//         const sentInfo = await execute({ sendAndConfirm: true })
//         console.log(sentInfo)
//       } catch (e: any) {
//         console.log(e)
//       }

//     }))
//   }

//   process.exit() // if you don't want to end up node execution, comment this line
// }


// claimPlatformFeeAll()

// export const claimPlatformFee = async () => {
//   const raydium = await initSdk()
//   console.log(connection.rpcEndpoint)
//   const poolId = new PublicKey('9jf1pWTWjvaZCBvuRqnubatBZSdajzaBKnvF9AEM57Ve')

//   const { execute, transaction, extInfo, builder } = await raydium.launchpad.claimPlatformFee({
//     programId: LAUNCHPAD_PROGRAM, // devnet: DEV_LAUNCHPAD_PROGRAM
//     platformId,
//     platformClaimFeeWallet: raydium.ownerPubKey,
//     poolId,

//     // mintB: NATIVE_MINT,
//     // vaultB: new PublicKey('4hovbmAKVRCyj6vmBxZ533ntnrUVGkQfwxzdxzewnR47'),
//     // mintBProgram?: PublicKey;

//     txVersion: TxVersion.V0,
//     // computeBudgetConfig: {
//     //   units: 600000,
//     //   microLamports: 600000,
//     // },
//   })

//   //   printSimulate([transaction])

//   try {
//     const sentInfo = await execute({ sendAndConfirm: true })
//     console.log(sentInfo)
//   } catch (e: any) {
//     console.log(e)
//   }

//   process.exit() // if you don't want to end up node execution, comment this line
// }

/** uncomment code below to execute */
// claimPlatformFee()

// const wallet: Keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY as any)))
// async function unwrapSol(
//   wallet: Keypair,
// ): Promise<void> {
//   const associatedTokenAccount = await getAssociatedTokenAddress(
//     NATIVE_MINT,
//     wallet.publicKey
//   );
//   console.log(associatedTokenAccount.toBase58())
//   console.log(wallet.publicKey.toBase58())
//   const unwrapTransaction = new Transaction().add(
//       createCloseAccountInstruction(
//         associatedTokenAccount,
//           wallet.publicKey,
//           wallet.publicKey
//       )
//   );
//   await sendAndConfirmTransaction(connection, unwrapTransaction, [wallet]);
//   console.log("✅ - Step 4: SOL unwrapped");
// }

// unwrapSol(wallet)





app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
