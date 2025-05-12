"use client";
// import { Tweet } from "react-tweet";
import { FaCopy } from "react-icons/fa";
import { toast } from "@/hooks/use-toast";

import { useState, useRef, useEffect, useCallback, Dispatch, SetStateAction, useMemo } from "react";

import dynamic from "next/dynamic";
import {  useSearchParams, useRouter } from "next/navigation";
import {Transaction, Connection} from "@solana/web3.js";
import {  useAppKitProvider } from "@reown/appkit/react";
import { Provider } from "@reown/appkit-adapter-solana/react";
import { getAssociatedTokenAddress, NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Suspense } from 'react';
import {   unsubscribeFromPool } from "@/utils/pool";
import { connection, initSdk } from "@/config";
import { Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

import { subscribeToPoolTransactions, fetchHistoricalTransactions } from "@/utils/pool";
import {
  Card,
  CardBody,
  Button,
  Typography,
  Tabs,
  TabsHeader,
  TabsBody,
  Tab,
  TabPanel,
  Input,
  IconButton,
} from "@material-tailwind/react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import { Cog6ToothIcon } from "@heroicons/react/24/solid";
import { SettingsModal } from "@/components/ui/SettingsModal";
import { Curve, PlatformConfig, TxVersion, getPdaLaunchpadPoolId } from "@raydium-io/raydium-sdk-v2";
import Decimal from 'decimal.js'
import { e } from "@raydium-io/raydium-sdk-v2/lib/api-7daf490d";

const API_URL = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:3000';
const DUMMY_PRIVATE_KEY = process.env.NEXT_PUBLIC_DUMMY_PRIVATE_KEY as string

const TradingChart = dynamic(() => import("../../components/ui/TradingChart"), {
  ssr: false,
});


interface OnChainTransaction {
  type: 'BUY' | 'SELL';
  timestamp: number;
  solAmount: number;
  walletAddress: string;
  tokenAmount: number;
  signature: string;
}

function CoinContent() {
  // const [activeTab, setActiveTab] = useState("BUY");
  // const [amount, setAmount] = useState("0.327543");
  // const [selectedToken, setSelectedToken] = useState("SOL");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // const [activeButton, setActiveButton] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const SOL_PRICE_CACHE_KEY = 'solana_price_cache';
  const CACHE_DURATION = 10 * 60 * 1000;

  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenMint = searchParams.get("tokenMint");
  const action = searchParams.get("action");
  const [displayCurrency, setDisplayCurrency] = useState<"SOL" | "USD">("USD");
  const [reserveToken, setReserveToken] = useState<number>(0);
  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [isLiquidityActive, setIsLiquidityActive] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [creatorImageUrl, setCreatorImageUrl] = useState<string>("");
  const [tweetLink, setTweetLink] = useState<string>("");
  const [creatorName, setCreatorName] = useState<string>("");
  const [mcap, setMcap] = useState<string>("35");
  const [transactions, setTransactions] = useState<OnChainTransaction[]>([]);
  const [poolSolBalance, setPoolSolBalance] = useState<number>(0);
  // const lastPriceRef = useRef<number | null>(null);
  const subscriptionIdRef = useRef<number | null>(null);
  const programRef = useRef<Program<any> | null>(null);
  const [graduatingMarketCap, setGraduatingMarketCap] = useState<string>("");
  const [migrationStatus, setMigrationStatus] = useState<'pre' | 'during' | 'post'>('pre');
  // const { walletProvider } = useAppKitProvider<Provider>('solana');

  const fetchSolPrice = async () => {
    try {
      const cachedData = localStorage.getItem(SOL_PRICE_CACHE_KEY);
      if (cachedData) {
        const { price, timestamp } = JSON.parse(cachedData);
        const isExpired = Date.now() - timestamp > CACHE_DURATION;
        
        if (!isExpired) {
          return price;
        }
      }

      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      const newPrice = data.solana.usd;
      
      localStorage.setItem(SOL_PRICE_CACHE_KEY, JSON.stringify({
        price: newPrice,
        timestamp: Date.now()
      }));
      return newPrice;
    } catch (error) {
      console.error('Error fetching SOL price:', error);
      const cachedData = localStorage.getItem(SOL_PRICE_CACHE_KEY);
      return cachedData ? JSON.parse(cachedData).price : 1;
    }
  };

  

  // const tokenOptions: TokenOption[] = [
  //   { value: "SOL", label: "SOL", image: "/pngwing.com.png" },
  //   { value: "USDT", label: "USDT", image: "/pngwing.com.png" },
  //   { value: "BTC", label: "BTC", image: "/pngwing.com.png" },
  //   { value: "ETH", label: "ETH", image: "/pngwing.com.png" },
  // // ];
  // useEffect(() => {
  //   const fetchPoolBalance = async () => {
  //     if (!programRef.current || !tokenMint) return;
      
  //     try {
  //       const balance = await getPoolSolBalance(programRef.current, tokenMint);
  //       setPoolSolBalance(balance);
  //     } catch (error) {
  //       console.log('Error fetching pool balance:', error);
  //     }
  //   };
    
  //   if (programRef.current) {
  //     fetchPoolBalance();
  //   }
  // }, [tokenMint, programRef.current]);
  
  useEffect(() => {
    const fetchPoolData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/${tokenMint}/pool-data`);
        const data = await response.json();
        setReserveToken(Number(new BN(data.reserveToken.toString())));
        setTokenSymbol(data.tokenSymbol);
        setTokenName(data.tokenName);
        setImageUrl(data.imageUrl);
        setIsLiquidityActive(data.isLiquidityActive || false);
        setCreatorName(data.creatorName);
        setMcap(data.mcap);
        setCreatorImageUrl(data.creatorImage);
        setTweetLink(data.tweetLink);
        const graduatingMarketCap = async () => {
          const solPrice = await fetchSolPrice();
          setGraduatingMarketCap((370* solPrice/1000).toFixed(2));
        }
        graduatingMarketCap();
      } catch (error) {
        console.log('Error fetching pool data:', error);
      }
    };
    fetchPoolData();
  }, [tokenMint]);
  
  // useEffect(() => {
  //   try {
  //     const dummyWallet = {
  //       publicKey: Keypair.fromSecretKey(new Uint8Array(JSON.parse(DUMMY_PRIVATE_KEY))).publicKey,
  //       signTransaction: async (tx: any) => tx,
  //       signAllTransactions: async (txs: any) => txs,
  //     };

  //     const provider = new AnchorProvider(
  //       connection,
  //       dummyWallet,
  //       AnchorProvider.defaultOptions()
  //     );
      
  //     console.log('Program initialized with wallet:', dummyWallet.publicKey.toString());
  //   } catch (error) {
  //     console.log('Error initializing program:', error);
  //   }
  // }, []);

  // Add a callback ref to receive data from TradingChart
  const onTransactionUpdate = useCallback((transaction: OnChainTransaction) => {
    setTransactions(prev => [transaction, ...prev].slice(0, 100));
  }, []);

  useEffect(() => {
    const loadHistoricalAndSubscribe = async () => {
      if (!tokenMint) return;

      try {
        const historical = await fetchHistoricalTransactions(
          tokenMint.toString(),
          100
        );
        console.log(historical)
        setTransactions(historical as any);
      } catch (error) {
        console.log('Error setting up transactions:', error);
      }
    };

    loadHistoricalAndSubscribe();
  }, [tokenMint]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // const updateReserveTokenAmount = useCallback(async () => {
  //   if (!programRef.current || !tokenMint) return;
  //   const balance = await getPoolTokenBalance(programRef.current, tokenMint);
  //   setReserveToken(parseInt(new BN(balance).toString()));
  // }, [tokenMint]);

  const handleCopyToClipboard = (value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() =>
        toast({
          title: "CA copied",
          description:
            "The contract address of this token has been copied to clipboard",
        })
      )
      .catch(() => alert("Failed to copy!"));
  };

  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };
  const formatTx = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getTransactionColor = (type: string) => {
    return type === 'BUY' ? 'text-green-500' : 'text-red-500';
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    
    // Get month name
    const month = date.toLocaleString('en-US', { month: 'short' });
    
    // Get day
    const day = date.getDate();
    
    // Get time in 12-hour format with AM/PM
    const time = date.toLocaleString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    });

    return `${month} ${day} ${time}`;
  };

  return (
    // <div className="min-h-screen bg-primary-gradient lg:overflow-y-hidden">
    //   <div className="p-4 mt-52">
    //     <div className="flex flex-wrap items-center gap-4 mb-4">
    //       {/* <img
    //         src="/pngwing.com.png"
    //         alt="Rounded Avatar"
    //         className="w-12 h-12 rounded-full"
    //       /> */}
    //       <div className="flex flex-col">
    //         <p className="font-bold text-lg">{tokenName} (${tokenSymbol})</p>
    //       </div>
    //       <div className="flex flex-col">
    //         <p className="text-sm text-muted-foreground">by @{creatorName}</p>
    //       </div>
    //       <div className="flex flex-col">
    //         <p className="text-sm text-muted-foreground flex items-center">
    //           ca: <span id="contract-address">{tokenMint}</span>
    //           <FaCopy
    //             className="ml-2 cursor-pointer"
    //             onClick={() => {
    //               const contractAddress = document
    //                 .getElementById("contract-address")
    //                 ?.textContent?.trim();
    //               if (contractAddress) {
    //                 handleCopyToClipboard(contractAddress);
    //               }
    //             }}
    //           />
    //         </p>
    //       </div>
    //       <div className="flex flex-col">
    //         {displayCurrency === "USD" ? <p className="text-sm">market cap: <span>${mcap}</span></p> : <p className="text-sm">market cap: <span>{mcap} </span></p>}
    //       </div>
    //       <div className="flex flex-col">
    //         <select
    //           value={displayCurrency}
    //           onChange={(e) =>
    //             setDisplayCurrency(e.target.value as "SOL" | "USD")
    //           }
    //           className="px-4 py-2 bg-[#2a2e39] text-white rounded"
    //         >
    //           <option value="SOL">SOL</option>
    //           <option value="USD">USD</option>
    //         </select>
    //       </div>
    //     </div>

    //     {/* Remaining Code */}
    //     <div className="flex flex-col lg:flex-row gap-4">
    //       {/* Chart and Table */}
    //       <div className="w-full lg:w-3/4">
    //         <TradingChart
    //           displayCurrency={displayCurrency}
    //           tokenMint={tokenMint as string}
    //           setMcap={setMcap}
    //           tokenName={tokenName}
    //         />
    //         <div className="mt-6 max-h-[400px] overflow-y-auto">
    //           <Table>
    //             <TableCaption className="sticky bottom-0 bg-primary-gradient">
    //               The latest txs on this token.
    //             </TableCaption>
    //             <TableHeader className="sticky top-0 bg-primary-gradient">
    //               <TableRow>
    //                 <TableHead>Type</TableHead>
    //                 <TableHead>Amount (SOL)</TableHead>
    //                 <TableHead>Wallet</TableHead>
    //                 <TableHead>Time</TableHead>
    //               </TableRow>
    //             </TableHeader>
    //             <TableBody>
    //               {transactions.map((tx, index) => (
    //                 <TableRow key={index}>
    //                   <TableCell className={getTransactionColor(tx.type)}>
    //                     {tx.type}
    //                   </TableCell>
    //                   <TableCell>{tx.solAmount.toFixed(4)}</TableCell>
    //                   <TableCell className="font-medium">
    //                     {formatWalletAddress(tx.walletAddress)}
    //                   </TableCell>
    //                   <TableCell>
    //                     {new Date(tx.timestamp * 1000).toLocaleTimeString()}
    //                   </TableCell>
    //                 </TableRow>
    //               ))}
    //               {transactions.length === 0 && (
    //                 <TableRow>
    //                   <TableCell colSpan={4} className="text-center text-gray-500">
    //                     No transactions yet
    //                   </TableCell>
    //                 </TableRow>
    //               )}
    //             </TableBody>
    //           </Table>
    //         </div>
    //       </div>
    //       {/* Side Panel */}
    //       <div className="w-full lg:w-1/4 flex flex-col gap-4">
    //         <div className="h-[530px] overflow-hidden relative">
    //            {imageUrl && (
    //                <Image 
    //                    src={imageUrl} 
    //                    alt="Token Image"
    //                    fill
    //                    sizes="(max-width: 768px) 100vw, 33vw"
    //                    className="object-contain object-center"
    //                    priority
    //                />
    //            )}
    //         </div>
    //         <TradingPanel tokenMint={tokenMint as string} tokenSymbol={tokenSymbol} isLiquidityActive={isLiquidityActive} reserveToken={reserveToken} setIsLiquidityActive={setIsLiquidityActive} />
    //       </div>
    //     </div>
    //   </div>
    // </div>
    <div className="flex flex-col gap-6 p-6 pt-8 pb-24 md:pt-6 md:pb-6 lg:px-12 xl:px-24 2xl:px-6 max-w-7xl mx-auto lg:mt-12">
      {/* TradingView Chart */}
      {/*@ts-ignore*/}
      <Card className="w-full overflow-hidden bg-gray-900">
        {tokenName ? (
          migrationStatus === 'post' ? (
            <div className="h-[600px]">
              <iframe 
                height="100%" 
                width="100%" 
                id="geckoterminal-embed" 
                title="GeckoTerminal Embed" 
                src="https://www.geckoterminal.com/solana/pools/9fmdkQipJK2teeUv53BMDXi52uRLbrEvV38K8GBNkiM7?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=15m" 
                frameBorder="0" 
                allow="clipboard-write" 
                allowFullScreen
              />
            </div>
          ) : (
            <TradingChart
              displayCurrency={displayCurrency}
              tokenMint={tokenMint || ''}
              setMcap={setMcap}
              tokenName={tokenName}
              onTransactionUpdate={onTransactionUpdate}
            />
          )
        ) : (
          <div className="flex items-center justify-center h-[400px] text-gray-400">
            Loading...
          </div>
        )}
      </Card>

      {/* Tweet Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/*@ts-ignore*/}
        <Card color="gray" variant="gradient" className="p-6">
            {/*@ts-ignore*/}
          <CardBody className="flex flex-col gap-4 p-0">
            <div className="relative w-full h-[120px] rounded-lg overflow-hidden cursor-zoom-in">
              <a
                href={tweetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-2 left-2 z-50 text-white hover:text-gray-200 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </a>
              {/*@ts-ignore*/}
              <Zoom overlayBgColorEnd="rgba(17, 17, 17, 0.75)"
                overlayBgColorStart="rgba(17, 17, 17, 0.75)"
                closeText="Close"
                zoomMargin={40}
                classDialog="zoom-overlay"
                overlayProps={{
                  className: 'zoom-overlay'
                }}
              >
                {imageUrl && <img
                  src={imageUrl}
                  alt="Featured tweet"
                  className="w-full h-full object-cover"
                />}
              </Zoom>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-base text-white font-bold">
                    {tokenName} (${tokenSymbol})
                  </p>
                  {tokenMint && <FaCopy
                    className="cursor-pointer text-gray-400 hover:text-white transition-colors"
                    onClick={() => handleCopyToClipboard(tokenMint)}
                  />}
                </div>
                <p className="text-sm font-normal text-green-500">
                  Market Cap: ${mcap}
                </p>
              </div>
              <a
                href={tweetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 group"
              >
                <div className="relative w-8 h-8 rounded overflow-hidden">
                  {creatorImageUrl && <img
                    src={creatorImageUrl}
                    alt="Profile picture"
                    className="w-full h-full object-cover"
                  />}
                </div>
                <span className="text-xs text-gray-400 group-hover:underline">
                  By:@{creatorName}
                </span>
              </a>
            </div>
            <div className="">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-400">bonding curve progress:</span>
                <span className="text-sm text-gray-400">{(poolSolBalance/85*100).toFixed(2)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white rounded-full" 
                  style={{ width: `${(poolSolBalance/85*100).toFixed(2)}%` }}
                />    
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {migrationStatus === 'pre' && `graduating at: ${graduatingMarketCap}k market cap`}
                {migrationStatus === 'during' && 'bonding curve is completed. token is migrating. pls wait 5-20 mins'}
                {migrationStatus === 'post' && 'this token has graduated'}
              </div>
              <div className="text-xs text-gray-400">
                {migrationStatus === 'pre' && `SOL in bonding curve: ${poolSolBalance.toFixed(2)} SOL`}
                {migrationStatus === 'during' && 'liquidity in the raydium pool: $10,477'}
                {migrationStatus === 'post' && (
                  <a href="https://raydium.io/swap" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    raydium pool seeded - view on raydium here
                  </a>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
        {/* Trading Interface */}
        {/*@ts-ignore*/}  
        <TradingPanel 
          tokenMint={tokenMint as string} 
          tokenSymbol={tokenSymbol} 
          isLiquidityActive={isLiquidityActive} 
          setIsLiquidityActive={setIsLiquidityActive} 
          action={action || "BUY"}
        />
        
      </div>

      {/* Transactions Table */}
      {/*@ts-ignore*/}
      <Card color="gray" variant="gradient" className="p-6">
        {/*@ts-ignore*/}
        <Typography variant="h6" color="white" className="mb-4">
          Latest Transactions
        </Typography>
        {/* <div className="overflow-x-auto"> */}
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full min-w-max table-auto text-left">
              <thead className="sticky top-0 ">
                <tr>
                  {["Type", "Amount", "Token Amount", "Time", "Wallet", "Tx"].map((head) => (
                    <th key={head} className="border-b border-gray-700  p-4">
                      {/*@ts-ignore*/}
                      <Typography
                        variant="small"
                        className="font-bold leading-none text-[#BDBDBD]"
                      >
                        {head}
                      </Typography>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 99).map(({ type, solAmount, timestamp, walletAddress, tokenAmount, signature }, index) => (
                  <tr key={index} className="border-b border-gray-700">
                    <td className="p-4">
                      {/*@ts-ignore*/}
                      <Typography
                        variant="small"
                        color={type === "BUY" ? "green" : "red"}
                        className=""
                      >
                        {type}
                      </Typography>
                    </td>
                    <td className="p-4 text-[#BDBDBD]">
                      {/*@ts-ignore*/}
                      <Typography variant="small" >
                      {solAmount.toFixed(3)}
                      </Typography>
                    </td>
                    <td className="p-4 text-[#BDBDBD]">
                      {/*@ts-ignore*/}
                      <Typography variant="small" >
                        {Math.floor(tokenAmount).toString()}
                      </Typography>
                    </td>
                    <td className="p-4 text-[#BDBDBD]">
                      {/*@ts-ignore*/}
                      <Typography variant="small">
                        {formatDateTime(timestamp)}
                      </Typography>
                    </td>
                    <td className="p-4">
                      {/*@ts-ignore*/}
                      <Typography
                        variant="small"
                     
                        className="font-mono text-[#BDBDBD]"
                      >
                        <a 
                          href={`https://solscan.io/account/${walletAddress}?cluster=${process.env.SOLANA_ENVIRONMENT === 'mainnet' ? 'mainnet-beta' : 'devnet'}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:text-white transition-colors"
                        >
                          {formatWalletAddress(walletAddress)}
                        </a>
                      </Typography>
                    </td>
                    <td className="p-4">
                      {/*@ts-ignore*/}
                      <Typography
                        variant="small"
                     
                        className="font-mono text-[#BDBDBD]"
                      >
                        <a 
                          href={`https://solscan.io/tx/${signature}?cluster=${process.env.SOLANA_ENVIRONMENT === 'mainnet' ? 'mainnet-beta' : 'devnet'}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:text-white transition-colors"
                        >
                          {formatTx(signature)}
                        </a>
                      </Typography>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </Card>
    </div>
  );
}


export default function Coin() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CoinContent />
    </Suspense>
  );
}


interface TradingPanelProps {
  tokenMint: string;
  tokenSymbol: string;
  isLiquidityActive: boolean;
  setIsLiquidityActive: Dispatch<SetStateAction<boolean>>;
  action: string;
}

const TradingPanel = ({ tokenMint, tokenSymbol, isLiquidityActive, setIsLiquidityActive, action }: TradingPanelProps) => {
  const [activeTab, setActiveTab] = useState(action || "BUY");
  const [amount, setAmount] = useState<BN>(new BN(0));
  const [tokenAmount, setTokenAmount] = useState<string>("0");
  const [inputValue, setInputValue] = useState<string>("");
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [estimatedSol, setEstimatedSol] = useState<string>("0");
  const [transaction, setTransaction] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [slippageTolerance, setSlippageTolerance] = useState(0.5);
  const [priorityFee, setPriorityFee] = useState('Normal');
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const [minSolOut, setMinSolOut] = useState<string>("");
  const [minTokensOut, setMinTokensOut] = useState<string>("");

  // State for Raydium SDK info
  const [sdkPlatformInfo, setSdkPlatformInfo] = useState<any>(null);

  const publicKey = walletProvider?.publicKey;
  const walletIdentifier = useMemo(() => {
    return publicKey ? publicKey.toString() : null;
  }, [publicKey]);

  const RAYDIUM_LAUNCHPAD_PROGRAM_ID = process.env.NEXT_PUBLIC_RAYDIUM_LAUNCHPAD_PROGRAM_ID || 'LanD8FpTBBvzZFXjTxsAoipkFsxPUCDB4qAqKxYDiNP';
  const RAYDIUM_PLATFORM_ID_ENV = process.env.NEXT_PUBLIC_RAYDIUM_PLATFORM_ID;

  useEffect(() => {
    const fetchPlatformData = async () => {
      if (!RAYDIUM_PLATFORM_ID_ENV) {
        console.error("Raydium Platform ID not found in environment variables.");
        setSdkPlatformInfo(null);
        return;
      }

      try {
        const raydium = await initSdk();
        const platformIdPublicKey = new PublicKey(RAYDIUM_PLATFORM_ID_ENV);
        
        const platformDataAccount = await raydium.connection.getAccountInfo(platformIdPublicKey);
        if (platformDataAccount) {
          const platformInfoData = PlatformConfig.decode(platformDataAccount.data);
          setSdkPlatformInfo(platformInfoData);
        } else {
          console.error("Failed to fetch platform data account for Raydium using Platform ID from ENV.");
          setSdkPlatformInfo(null);
        }
      } catch (error) {
        console.error("Error fetching Raydium SDK platform info using ENV Platform ID:", error);
        setSdkPlatformInfo(null);
      }
    };

    fetchPlatformData();
  }, [RAYDIUM_PLATFORM_ID_ENV]);
  

  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!walletProvider?.publicKey) return;
      
      try {
        const userTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          walletProvider.publicKey
        );
        const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
        console.log('Token Balance:', tokenBalance.value.amount);
        setTokenBalance(BigInt(tokenBalance.value.amount));
      } catch (error) {
        console.log('Error fetching token balance:', error);
        setTokenBalance(BigInt(0));
      }
    };
    
    fetchTokenBalance();
  }, [tokenMint, walletIdentifier, transaction]);
  
  const updateEstimatedOutputs = useCallback(async (currentInputBN: BN, currentTab: string) => {
    if (!sdkPlatformInfo || !tokenMint || currentInputBN.isZero() || currentInputBN.isNeg()) {
      if (currentTab === "BUY") {
        setTokenAmount("0");
        setMinTokensOut("");
        } else {
        setEstimatedSol("0");
        setMinSolOut("");
      }
      return;
    }

    try {
      const raydium = await initSdk();
      const mintA = new PublicKey(tokenMint);
      const mintB = NATIVE_MINT;
      const programId = new PublicKey(RAYDIUM_LAUNCHPAD_PROGRAM_ID);
      const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey;
      const currentPoolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });

      if (!currentPoolInfo) {
        console.error("Failed to fetch fresh pool info in updateEstimatedOutputs.");
        if (currentTab === "BUY") {
            setTokenAmount("0"); setMinTokensOut("");
        } else {
            setEstimatedSol("0"); setMinSolOut("");
        }
        return;
      }

      const slippageDecimal = new Decimal(slippageTolerance).div(100);
      const TOKEN_DECIMALS = 6; // Hardcoded token decimals
      const SOL_DECIMALS = 9;   // Hardcoded SOL decimals

      if (currentTab === "BUY") {
        const res = Curve.buyExactIn({
          poolInfo: currentPoolInfo,
          amountB: currentInputBN, 
          protocolFeeRate: currentPoolInfo.configInfo.tradeFeeRate,
          platformFeeRate: sdkPlatformInfo.feeRate,
          curveType: currentPoolInfo.configInfo.curveType,
          shareFeeRate: new BN(100), 
        });
        console.log("Curve.buyExactIn response:", res);

        const expectedTokensSmallestUnit = new Decimal(res.amountA.toString());
        
        const expectedTokensDisplay = expectedTokensSmallestUnit.div(new Decimal(10).pow(TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS);
        console.log(`Setting tokenAmount (BUY) to: "${expectedTokensDisplay}"`);
        setTokenAmount(expectedTokensDisplay);

        const minTokensSmallestUnit = expectedTokensSmallestUnit.mul(new Decimal(1).minus(slippageDecimal)).toFixed(0, Decimal.ROUND_DOWN);
        const minTokensDisplay = new Decimal(minTokensSmallestUnit).div(new Decimal(10).pow(TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS);
        console.log(`Setting minTokensOut (BUY) to: "${minTokensDisplay}"`);
        setMinTokensOut(minTokensDisplay);

      } else { // currentTab === "SELL"
        const res = Curve.sellExactIn({
          poolInfo: currentPoolInfo,
          amountA: currentInputBN, 
          protocolFeeRate: currentPoolInfo.configInfo.tradeFeeRate,
          platformFeeRate: sdkPlatformInfo.feeRate,
          curveType: currentPoolInfo.configInfo.curveType,
          shareFeeRate: new BN(100), 
        });
        console.log("Curve.sellExactIn response:", res);

        const expectedSolLamports = new Decimal(res.amountB.toString());
        
        const expectedSolDisplay = expectedSolLamports.div(new Decimal(10).pow(SOL_DECIMALS)).toFixed(SOL_DECIMALS);
        console.log(`Setting estimatedSol (SELL) to: "${expectedSolDisplay}"`);
        setEstimatedSol(expectedSolDisplay);

        const minSolLamports = expectedSolLamports.mul(new Decimal(1).minus(slippageDecimal)).toFixed(0, Decimal.ROUND_DOWN);
        const minSolDisplay = new Decimal(minSolLamports).div(new Decimal(10).pow(SOL_DECIMALS)).toFixed(SOL_DECIMALS);
        console.log(`Setting minSolOut (SELL) to: "${minSolDisplay}"`);
        setMinSolOut(minSolDisplay);
      }
    } catch (error) {
      console.error(`Error calculating ${currentTab} outputs via Raydium SDK (inside updateEstimatedOutputs):`, error);
      if (currentTab === "BUY") {
        setTokenAmount("0");
        setMinTokensOut("");
      } else {
        setEstimatedSol("0");
        setMinSolOut("");
      }
    }
  }, [tokenMint, sdkPlatformInfo, slippageTolerance, setTokenAmount, setMinTokensOut, setEstimatedSol, setMinSolOut]);


const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setInputValue("");
    setAmount(new BN(0));
    setActiveButton(null);
    setEstimatedSol("");
    setMinTokensOut("");
    setTokenAmount("0");
    setMinSolOut("");
};

const getButtonOptions = () => {
    return activeTab === "SELL"   
        ? ["25%", "50%", "75%", "100%"]
        : ["0.5", "1", "2", "5"]
};

const handleQuickBuyClick = useCallback((value: string) => {
    setActiveButton(value);
    let newAmountBN: BN;
    let inputDisplayValue = value;

    const TOKEN_DECIMALS = 6; // Hardcoded - Re-added
    const SOL_DECIMALS = 9;   // Hardcoded - Re-added

    if (activeTab === "BUY") { 
        const solAmount = parseFloat(value);
        if (!isNaN(solAmount) && solAmount >= 0) {
            newAmountBN = new BN(new Decimal(solAmount).mul(new Decimal(10).pow(SOL_DECIMALS)).toFixed(0));
            setAmount(newAmountBN);
            setInputValue(value); 
            updateEstimatedOutputs(newAmountBN, activeTab);
            setEstimatedSol(""); setMinSolOut(""); 
      } else {
             setAmount(new BN(0)); setInputValue("0"); updateEstimatedOutputs(new BN(0), activeTab);
        }
    } else { // activeTab === "SELL"
        if (value.includes('%')) {
            const percentage = parseInt(value) / 100;
            const sellAmountSmallestUnits = new Decimal(tokenBalance.toString()).mul(percentage).toDP(0, Decimal.ROUND_DOWN);
            newAmountBN = new BN(sellAmountSmallestUnits.toFixed(0));
            inputDisplayValue = sellAmountSmallestUnits.div(new Decimal(10).pow(TOKEN_DECIMALS)).toFixed(TOKEN_DECIMALS);
    } else {
            const tokenSellAmount = parseFloat(value); 
            if (!isNaN(tokenSellAmount) && tokenSellAmount >= 0) {
                newAmountBN = new BN(new Decimal(tokenSellAmount).mul(new Decimal(10).pow(TOKEN_DECIMALS)).toFixed(0));
        } else {
                newAmountBN = new BN(0); inputDisplayValue = "0";
            }
        }
        setAmount(newAmountBN);
        setInputValue(inputDisplayValue);
        updateEstimatedOutputs(newAmountBN, activeTab);
        setTokenAmount("0"); setMinTokensOut(""); 
    }
}, [activeTab, tokenBalance, updateEstimatedOutputs, setAmount, setInputValue, setActiveButton, setTokenAmount, setMinTokensOut, setEstimatedSol, setMinSolOut]);

// useEffect for debouncing calls to updateEstimatedOutputs when inputValue changes
useEffect(() => {
  // If inputValue is empty or represents zero, reset outputs and don't debounce a call
  const numericValue = parseFloat(inputValue);
  if (inputValue.trim() === "" || numericValue === 0 || isNaN(numericValue)) {
        if (activeTab === "BUY") {
      setTokenAmount("0");
      setMinTokensOut("");
        } else {
      setEstimatedSol("0");
            setMinSolOut("");
        }
    return;
  }

  const handler = setTimeout(() => {
    // 'amount' state should already be updated by handleInputChange with the BN value of inputValue
    if (amount && !amount.isZero() && !amount.isNeg()) {
      console.log(`Debounced query running for tab: ${activeTab}, amount: ${amount.toString()}, input: ${inputValue}`);
      updateEstimatedOutputs(amount, activeTab);
    }
  }, 300); // 300ms debounce delay

  return () => {
    clearTimeout(handler);
  };
}, [inputValue, amount, activeTab, updateEstimatedOutputs, setTokenAmount, setMinTokensOut, setEstimatedSol, setMinSolOut]);

const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const currentInputString = e.target.value;
    setInputValue(currentInputString);
    setActiveButton(null);
    
    const TOKEN_DECIMALS = 6; // Hardcoded - Re-added
    const SOL_DECIMALS = 9;   // Hardcoded - Re-added

    const numericValue = parseFloat(currentInputString);

    if (isNaN(numericValue) || numericValue < 0) {
        setAmount(new BN(0));
        setInputValue(currentInputString); 
        if (activeTab === "BUY") {
            setTokenAmount("0"); setMinTokensOut("");
    } else {
            setEstimatedSol("0"); setMinSolOut("");
        }
        return;
    }

    let newAmountBN: BN;
    if (activeTab === "BUY") { 
        newAmountBN = new BN(new Decimal(numericValue).mul(new Decimal(10).pow(SOL_DECIMALS)).toFixed(0));
        setEstimatedSol(""); setMinSolOut("");
    } else { 
        newAmountBN = new BN(new Decimal(numericValue).mul(new Decimal(10).pow(TOKEN_DECIMALS)).toFixed(0));
        setTokenAmount("0"); setMinTokensOut("");
    }
    setAmount(newAmountBN);
}, [activeTab, setAmount, setInputValue, setActiveButton, setTokenAmount, setMinTokensOut, setEstimatedSol, setMinSolOut]);
  

  const handleTransaction = useCallback(async () => {
    if (!walletProvider || !amount) return;
  
    setIsLoading(true);
    try {
      let transaction:Transaction;
      let transactionResponse;
      let liquidity = false;
      if (activeTab === "BUY" && !isLiquidityActive) {
        toast({
          title: "Adding Liquidity",
        });

        console.log("amount", amount.toString())
  
        transactionResponse = await fetch(`${API_URL}/create-add-liquidity-transaction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mintAddress: tokenMint,
            solAmount: amount.toString(),
            account: walletProvider.publicKey?.toBase58(),
          }),
        });
        liquidity = true;

        const { transaction: serializedTransaction, message } = await transactionResponse.json();

        console.log("serializedTransaction", serializedTransaction)
        if(!serializedTransaction){
          throw new Error('Failed to create transaction');
        }
        transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));
      } else {
        // Calculate minimum tokens out for BUY or minimum SOL out for SELL based on slippage
        // let minTokensOutValue, minSolOutValue;
        
        // if (activeTab === "BUY" && minTokensOut) {
        //   minTokensOutValue = Math.floor(parseFloat(minTokensOut) * 1_000_000);
        //   console.log('Min Tokens Out Value:', minTokensOutValue.toString());
        // } else if (activeTab === "SELL" && minSolOut) {
        //   minSolOutValue = Math.floor(parseFloat(minSolOut));
        //   console.log('Min Sol Out Value:', minSolOutValue.toString());
        // }

        // const endpoint = activeTab === "BUY" 
        //   ? `${API_URL}/api/${tokenMint}/buy?amount=${amount}`
        //   : `${API_URL}/api/${tokenMint}/sell?amount=${tokenAmount}`;
  
        // transactionResponse = await fetch(endpoint, {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({
        //     account: walletProvider.publicKey?.toBase58(),
        //     minTokensOut: new BN(minTokensOutValue?.toString() || 0).toString(),
        //     minSolOut: new BN(minSolOutValue?.toString() || 0).toString()
        //   }),
        // });
      
  
      // if (!transactionResponse.ok) {
      //   throw new Error('Failed to create transaction');
      // }
      
      transaction = new Transaction();

      const raydium = await initSdk({ owner: walletProvider.publicKey })

      const mintA = new PublicKey(tokenMint)
      const mintB = NATIVE_MINT

      const programId = new PublicKey ('LanD8FpTBBvzZFXjTxsAoipkFsxPUCDB4qAqKxYDiNP') // devnet: DEV_LAUNCHPAD_PROGRAM

      const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey
      const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId })
      const data = await raydium.connection.getAccountInfo(poolInfo.platformId)
      const platformInfo = PlatformConfig.decode(data!.data)

      const slippage = new BN(slippageTolerance*100)

      if (activeTab === "BUY") {
        
        // const res = Curve.buyExactIn({
        //   poolInfo,
        //   amountB: new BN(amount.toString()),
        //   protocolFeeRate: poolInfo.configInfo.tradeFeeRate,
        //   platformFeeRate: platformInfo.feeRate,
        //   curveType: poolInfo.configInfo.curveType,
        //   shareFeeRate: new BN(100),
        // })
        // console.log(
        //   'expected out amount: ',
        //   res.amountA.toString(),
        //   'minimum out amount: ',
        //   new Decimal(res.amountA.toString()).mul((10000 - slippage.toNumber()) / 10000).toFixed(0)
        // )
      
        // Raydium UI usage: https://github.com/raydium-io/raydium-ui-v3-public/blob/master/src/store/useLaunchpadStore.ts#L563
        const { transaction: tx } = await raydium.launchpad.buyToken({
          programId,
          mintA,
          // mintB: poolInfo.configInfo.mintB, // optional, default is sol
          // minMintAAmount: res.amountA, // optional, default sdk will calculated by realtime rpc data
          slippage,
          configInfo: poolInfo.configInfo,
          platformFeeRate: platformInfo.feeRate,
          txVersion: TxVersion.LEGACY,
          buyAmount: new BN(amount.toString()),
          // shareFeeReceiver, // optional
          // shareFeeRate,  // optional, do not exceed poolInfo.configInfo.maxShareFeeRate
      
          // computeBudgetConfig: {
          //   units: 600000,
          //   microLamports: 600000,
          // },
        })

        transaction.add(tx)
      } else {
        // const res = Curve.sellExactIn({
        //   poolInfo,
        //   amountA: new BN(amount.toString()),
        //   protocolFeeRate: poolInfo.configInfo.tradeFeeRate,
        //   platformFeeRate: platformInfo.feeRate,
        //   curveType: poolInfo.configInfo.curveType,
        //   shareFeeRate: new BN(100),
        // })
        // console.log(
        //   'expected out amount: ',
        //   res.amountB.toString(),
        //   'minimum out amount: ',
        //   new Decimal(res.amountB.toString()).mul((10000 - slippage.toNumber()) / 10000).toFixed(0)
        // )
      
        // Raydium UI usage: https://github.com/raydium-io/raydium-ui-v3-public/blob/master/src/store/useLaunchpadStore.ts#L637
        const { transaction:tx } = await raydium.launchpad.sellToken({
          programId,
          mintA,
          // mintB, // default is sol
          configInfo: poolInfo.configInfo,
          platformFeeRate: platformInfo.feeRate,
          txVersion: TxVersion.LEGACY,
          sellAmount: new BN(amount.toString()),
        })

        transaction.add(tx)

        
      }
      transaction.feePayer = walletProvider.publicKey
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    }

      
      
      const signature = await walletProvider.sendTransaction(transaction, connection, {
        skipPreflight: false,
        maxRetries: 5,
        preflightCommitment: 'confirmed'
      });
  
      toast({
        title: "Transaction sent",
        description: "Confirming transaction...",
      });
  
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }
  
      console.log("Transaction confirmed:", signature);
      setTransaction(signature);
      toast({
        title: "Transaction successful!",
        description: "Your transaction has been confirmed",
      });
      
      if (liquidity) {
        await Promise.all([
          fetch(`${API_URL}/api/${tokenMint}/add-liquidity`)
        ]);
        
        setIsLiquidityActive(true);
        toast({
          title: "Liquidity initialized!",
          description: "Pool is now active for trading",
        });
      }

     
  
    } catch (error: any) {
      console.error('Transaction error:', error);
      
      let errorMessage = 'Transaction failed';
      if (error.logs) {
        console.error('Transaction logs:', error.logs);
        errorMessage = error.logs[error.logs.length - 1] || errorMessage;
      }
  
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setAmount(new BN(0));
      setTokenAmount("");
      setEstimatedSol("");
      setMinTokensOut("");
      setMinSolOut("");
    }
  }, [walletProvider?.publicKey, amount, activeTab, tokenMint, isLiquidityActive, tokenAmount, minTokensOut, minSolOut]);
  
  return (
    <>
    {/*@ts-ignore*/}
    <Card color="gray" variant="gradient" className="p-6">
      {/*@ts-ignore*/}
      <CardBody className="p-0">
        {/*@ts-ignore*/}
        <Tabs value={activeTab} className="overflow-visible">
          {/*@ts-ignore*/}
          <TabsHeader className="bg-gray-800">
            {/*@ts-ignore*/}
            <Tab value="BUY" onClick={() => handleTabChange("BUY")} className="text-black hover:text-white transition-colors">
              Buy
            </Tab>
            {/*@ts-ignore*/}
            <Tab value="SELL" onClick={() => handleTabChange("SELL")} className="text-black hover:text-white transition-colors">
              Sell
            </Tab>
          </TabsHeader>
          {/*@ts-ignore*/}
          <TabsBody className="!overflow-x-hidden !overflow-y-visible">
            {/*@ts-ignore*/}
            <TabPanel value="BUY" className="p-0">
              <div className="flex flex-col gap-4 mt-4">
                <div className="relative">
                  {/* <div className="text-xs text-gray-400 mb-1">
                    Amount {activeTab === "SELL" && `(Available: ${(Number(tokenBalance) / 1_000_000).toFixed(2)})`}
                  </div> */}
                  <div className="flex">
                    {/*@ts-ignore*/}
                  <Input
                    // onPointerEnterCapture={() => {}}
                    // onPointerLeaveCapture={() => {}}
                    // crossOrigin={undefined}
                    type="number"
                    value={inputValue}
                    onChange={handleInputChange}
                    className="!text-white bg-[#181816] rounded-lg w-[510px] pr-20"
                    containerProps={{
                      className: "!min-w-0 flex items-center gap-2"
                    }}
                    icon={
                      <div className="absolute right-2 text-gray-400">
                        {"SOL"}
                      </div>
                    }
                  />
                  {/*@ts-ignore*/}
                  <IconButton
                    placeholder="0"
                    variant="text"
                    className="bg-white/10 text-white rounded-full hover:bg-white/20 transition-all duration-200"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <Cog6ToothIcon className="h-5 w-5" />
                  </IconButton>
                  </div>
                  
                  {tokenAmount && tokenAmount !== "0" && (
                    <div className="text-xs text-gray-400 mt-1">
                      ≈ {Number(tokenAmount).toFixed(4)} {tokenSymbol}
                    </div>
                  )}
                  {minTokensOut && (
                    <div className="text-xs text-gray-400 mt-1">
                      Minimum received: {minTokensOut} {tokenSymbol} (slippage: {slippageTolerance}%)
                    </div>
                  )}
                  
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {getButtonOptions().map((value) => (
                    <button
                      key={value}
                      onClick={() => handleQuickBuyClick(value)}
                      className={`py-2 px-4 rounded-lg text-sm transition-colors ${activeButton === value
                        ? "bg-gray-900 text-white shadow-lg"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:shadow-md"}
                      } hover:scale-[1.02] focus:scale-[1.02] active:scale-100`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {/*@ts-ignore*/}
                <Button
                  size="lg"
                  className="mt-4 bg-green-500 hover:bg-green-600 hover:scale-[1.02] focus:scale-[1.02] active:scale-100"
                  fullWidth
                  onClick={handleTransaction}
                  disabled={isLoading || !walletProvider?.publicKey || !amount}
                >
                  {isLoading 
                    ? "Processing..." 
                    : !walletProvider?.publicKey 
                    ? "Connect Wallet" 
                    : `BUY ${tokenSymbol}`}
                </Button>
              </div>
            </TabPanel>
            <TabPanel value="SELL" className="p-0">
              <div className="flex flex-col gap-4 mt-4">
                <div className="relative">
                  <div className="text-xs text-gray-400 mb-1">
                    Amount (Available: {(Number(tokenBalance) / 1_000_000).toFixed(2)})
                  </div>
                  {/*@ts-ignore*/}
                  <div className="flex">
                      {/*@ts-ignore*/}
                  <Input
                    type="number"
                    value={inputValue}
                    onChange={handleInputChange}
                    className="!text-white bg-[#181816] rounded-lg w-[510px] pr-20"
                    containerProps={{
                      className: "!min-w-0 flex items-center gap-2"
                    }}
                    labelProps={{
                      className: "hidden"
                    }}
                    min="0"
                    step="any"
                    inputMode="decimal"
                    autoComplete="off"
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    icon={
                      <span className="absolute right-2 text-gray-400">
                        {tokenSymbol}
                      </span>
                    }
                  />
                  {/*@ts-ignore*/}
                  <IconButton
                    placeholder="0"
                    variant="text"
                    className="bg-white/10 text-white rounded-full hover:bg-white/20 transition-all duration-200"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <Cog6ToothIcon className="h-5 w-5" />
                  </IconButton>
                  </div>

                  {estimatedSol && (
                    <div className="text-xs text-gray-400 mt-1">
                      ≈ {estimatedSol} SOL
                    </div>
                  )}
                  {minSolOut && (
                    <div className="text-xs text-gray-400 mt-1">
                      Minimum received: {minSolOut} SOL (slippage: {slippageTolerance}%)
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {getButtonOptions().map((value) => (
                    <button
                      key={value}
                      onClick={() => handleQuickBuyClick(value)}
                      className={`py-2 px-4 rounded-lg text-sm transition-colors ${activeButton === value
                        ? "bg-gray-900 text-white shadow-lg"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:shadow-md"}
                      } hover:scale-[1.02] focus:scale-[1.02] active:scale-100`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {/*@ts-ignore*/}
                <Button
                  size="lg"
                  color="red"
                  className="mt-4 hover:scale-[1.02] focus:scale-[1.02] active:scale-100"
                  fullWidth
                  onClick={handleTransaction}
                  disabled={isLoading || !walletProvider?.publicKey || !amount}
                >
                  {isLoading 
                  ? "Processing..." 
                  : !walletProvider?.publicKey 
                  ? "Connect Wallet" 
                  : `SELL ${tokenSymbol}`}
                </Button>
              </div>
            </TabPanel>
          </TabsBody>
        </Tabs>
      </CardBody>
    </Card>
    <SettingsModal
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      onSave={({ slippageTolerance: newSlippage, priorityFee: newPriorityFee }) => {
        setSlippageTolerance(newSlippage);
        {/*@ts-ignore*/}
        setPriorityFee(newPriorityFee);
      }}
    />
    </>
  );
};

