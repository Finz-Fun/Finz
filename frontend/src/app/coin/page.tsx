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
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Suspense } from 'react';
import { getPoolSolBalance,  getPoolTokenBalance,  unsubscribeFromPool } from "@/utils/pool";
import { connection } from "@/config";
import { Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { AiAgent, IDL } from "@/idl/ai_agent";
import { PROGRAM_ID } from "@/config";
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
  const programRef = useRef<Program<AiAgent> | null>(null);
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
  // ];
  useEffect(() => {
    const fetchPoolBalance = async () => {
      if (!programRef.current || !tokenMint) return;
      
      try {
        const balance = await getPoolSolBalance(programRef.current, tokenMint);
        setPoolSolBalance(balance);
      } catch (error) {
        console.log('Error fetching pool balance:', error);
      }
    };
    
    if (programRef.current) {
      fetchPoolBalance();
    }
  }, [tokenMint, programRef.current]);
  
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
  
  useEffect(() => {
    try {
      const dummyWallet = {
        publicKey: Keypair.fromSecretKey(new Uint8Array(JSON.parse(DUMMY_PRIVATE_KEY))).publicKey,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
      };

      const provider = new AnchorProvider(
        connection,
        dummyWallet,
        AnchorProvider.defaultOptions()
      );
      
      const program = new Program<AiAgent>(
        IDL,
        provider
      );
      programRef.current = program;
      
      console.log('Program initialized with wallet:', dummyWallet.publicKey.toString());
    } catch (error) {
      console.log('Error initializing program:', error);
    }
  }, []);

  useEffect(() => {
    const loadHistoricalAndSubscribe = async () => {
      if (!programRef.current || !tokenMint) return;

      try {
        const historical = await fetchHistoricalTransactions(
          tokenMint.toString(),
          100
        );
        console.log(historical)
        setTransactions(historical as any);
        if (subscriptionIdRef.current !== null) {
          unsubscribeFromPool(connection, subscriptionIdRef.current);
          subscriptionIdRef.current = null;
        }

        const subscriptionId = await subscribeToPoolTransactions(
          PROGRAM_ID,
          connection,
          tokenMint.toString(),
          (transaction) => {
            setTransactions(prev => [transaction, ...prev].slice(0, 50));
            setReserveToken(transaction.reserveToken);
            setPoolSolBalance(transaction.reserveSol);
          }
        );

        subscriptionIdRef.current = subscriptionId;
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
  
  const updateReserveTokenAmount = useCallback(async () => {
    if (!programRef.current || !tokenMint) return;
    const balance = await getPoolTokenBalance(programRef.current, tokenMint);
    setReserveToken(parseInt(new BN(balance).toString()));
  }, [tokenMint]);

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
          reserveToken={reserveToken} 
          setIsLiquidityActive={setIsLiquidityActive} 
          action={action || "BUY"}
          updateReserveTokenAmount={updateReserveTokenAmount}
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
  reserveToken: number;
  setIsLiquidityActive: Dispatch<SetStateAction<boolean>>;
  action: string;
  updateReserveTokenAmount: () => Promise<void>;
}

const TradingPanel = ({ tokenMint, tokenSymbol, isLiquidityActive, reserveToken, setIsLiquidityActive, action, updateReserveTokenAmount }: TradingPanelProps) => {
  const [activeTab, setActiveTab] = useState(action || "BUY");
  const [amount, setAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState<string>("0");
  const [activeButton, setActiveButton] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [estimatedSol, setEstimatedSol] = useState<string>("");
  const [transaction, setTransaction] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [slippageTolerance, setSlippageTolerance] = useState(0.5);
  const [priorityFee, setPriorityFee] = useState('Normal');
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const [minSolOut, setMinSolOut] = useState<string>("");
  const [minTokensOut, setMinTokensOut] = useState<string>("");

  const publicKey = walletProvider?.publicKey;
  const walletIdentifier = useMemo(() => {
    return publicKey ? publicKey.toString() : null;
  }, [publicKey]);

  

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
  
  const calculateSolValue = useCallback((tokenAmount: number) => {
    // Implements the sell function calculation using area under the curve
    try {
        const EXPONENT = 4.62;
        const PROPORTION_BASE = 2.26;
        const PROPORTION_EXP = 39;
        const MIN_PRICE = 3.5e-8;
        const FEE_PERCENTAGE = 2.0;
        
        // Verify input
        if (tokenAmount <= 0) return "0";
        console.log('Token Amount:', reserveToken);
        // Convert to proper units (9 decimals)
        const reserveTokenBig = BigInt(reserveToken);
        const totalSupply = BigInt("1000000000000000000");
        
        // Check if operation is valid
        if (totalSupply <= reserveTokenBig) return "0";
        
        // Calculate tokens_sold (tokens in circulation) with careful decimal handling
        const currentTokensSold = Number(totalSupply - reserveTokenBig) / 1_000_000_000.0;
        const tokensToSell = tokenAmount / 1_000_000_000.0;
        
        // Calculate new tokens sold after this sale
        const newTokensSold = currentTokensSold - tokensToSell;
        
        // Calculate the integral function for area under the curve
        const integral = (x: number): number => {
            return (Math.pow(x, EXPONENT)) / (PROPORTION_BASE * Math.pow(10, PROPORTION_EXP)) + MIN_PRICE * x;
        };
        
        // Calculate SOL to receive based on area under the curve
        let solReceived;
        if (newTokensSold <= 0) {
            // Edge case - selling all tokens or more than exist
            return "0"; // This would be the reserve SOL in the pool
        } else {
            // Calculate area under curve between current_tokens_sold and new_tokens_sold
            const area = integral(currentTokensSold) - integral(newTokensSold);
            solReceived = area * 1_000_000_000.0; // Convert to lamports
        }
        
        // Apply fee
        const amountBeforeFee = solReceived;
        const amountOut = amountBeforeFee * (1.0 - FEE_PERCENTAGE / 100.0);
        
        // Guard against negative amounts due to precision errors
        if (amountOut <= 0) return "0";
        
        return amountOut.toFixed(9);
    } catch (error) {
        console.error('Error calculating SOL value:', error);
        return "0";
    }
}, [reserveToken]);

const calculateTokenValue = useCallback((solAmount: number) => {
    // Implements the buy function calculation using area under the curve and numerical approximation (fix todos)
    try {
        const EXPONENT = 4.62;
        const PROPORTION_BASE = 2.26;
        const PROPORTION_EXP = 39;
        const MIN_PRICE = 3.5e-8;
        const FEE_PERCENTAGE = 2.0;
        
        // Verify input
        if (solAmount <= 0) return "0";

        console.log('reserveToken', reserveToken)
        
        // Convert to proper units
        const reserveTokenBig = BigInt(reserveToken);
        const totalSupply = BigInt("1000000000000000000");
        
        // Check if operation is valid
        if (totalSupply <= reserveTokenBig) return "0";
        
        // Calculate current tokens sold (tokens in circulation)
        const currentTokensSold = Number(totalSupply - reserveTokenBig) / 1_000_000_000.0;
        
        // Calculate current price for initial estimate
        const currentPrice = (EXPONENT * Math.pow(currentTokensSold, EXPONENT - 1.0)) / 
                           (PROPORTION_BASE * Math.pow(10.0, PROPORTION_EXP)) + MIN_PRICE;
        
        // Calculate fees
        const feeAmount = solAmount * (FEE_PERCENTAGE / 100.0);
        const adjustedAmount = solAmount - feeAmount;
        
        // Define the integral function
        const integral = (x: number): number => {
            return (Math.pow(x, EXPONENT)) / (PROPORTION_BASE * Math.pow(10, PROPORTION_EXP)) + MIN_PRICE * x;
        };
        
        // Numerical solution - 3 iterations for sufficient accuracy
        let tokensToBuy = adjustedAmount / currentPrice; // Initial estimate
        let newTokensSold = currentTokensSold + tokensToBuy / 1_000_000_000.0;
        
        // Perform 3 iterations for better precision
        for (let i = 0; i < 3; i++) {
            const area = (integral(newTokensSold) - integral(currentTokensSold)) * 1_000_000_000.0;
            
            // If area is close enough to adjustedAmount, break
            if (Math.abs(area - adjustedAmount) < 0.001) {
                break;
            }
            
            // Adjust our estimate
            const scaleFactor = adjustedAmount / area;
            tokensToBuy *= scaleFactor;
            newTokensSold = currentTokensSold + tokensToBuy / 1_000_000_000.0;
        }
        
        // Guard against negative or very small amounts
        if (tokensToBuy <= 0) return "0";
        
        return tokensToBuy.toFixed(4);
    } catch (error) {
        console.error('Error calculating token value:', error);
        return "0";
    }
}, [reserveToken]);

const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setAmount("");
    setActiveButton(null);
    setEstimatedSol("");
    setMinTokensOut("");
};

const getButtonOptions = () => {
    return activeTab === "SELL"   
        ? ["25%", "50%", "75%", "100%"]
        : ["0.5", "1", "2", "5"]
};

const handleQuickBuyClick = (value: string) => {
    setActiveButton(value);
    
    if (activeTab === "SELL" && value.includes('%')) {
      const percentage = parseInt(value) / 100;
      
      if (percentage === 1) {
        setAmount((Number(tokenBalance) / 1_000_000_000).toFixed(2).toString());
        setTokenAmount(tokenBalance.toString());
        const solValue = calculateSolValue(Number(tokenBalance));
        setEstimatedSol((Number(solValue)/1_000_000_000).toFixed(2));
        setMinSolOut((Number(solValue)*(100-slippageTolerance)/100).toString());
      } else {
        const tokenAmount = tokenBalance * BigInt(Math.floor(percentage * 100)) / BigInt(100);
        setAmount((Number(tokenAmount.toString()) / 1_000_000_000).toFixed(2));
        setTokenAmount(tokenAmount.toString());
        const solValue = calculateSolValue(Number(tokenAmount.toString()));
        setEstimatedSol((Number(solValue)/1_000_000_000).toFixed(2));
        setMinSolOut((Number(solValue)*(100-slippageTolerance)/100).toString());
      }
    } else {
        setAmount(value);
        
        if (activeTab === "BUY") {
            const tokenValue = calculateTokenValue(Number(value));
            setMinTokensOut((Number(tokenValue)*(100-slippageTolerance)/100).toFixed(4));
            setTokenAmount(tokenValue);
        } else {
            setTokenAmount(value.toString());
            setEstimatedSol("");
            setMinSolOut("");
        }
    }
};

const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    setActiveButton(null);
    
    if (activeTab === "SELL" && !isNaN(Number(newAmount))) {
      setTokenAmount((Number(newAmount)*1_000_000_000).toString());
      setEstimatedSol(calculateSolValue(Number(newAmount)*1_000_000_000));
      setMinSolOut((Number(estimatedSol)*(100-slippageTolerance)/100).toString());
    } else {
      setEstimatedSol("");
      setMinTokensOut("");
    }
  };
  

  const handleTransaction = useCallback(async () => {
    if (!walletProvider || !amount) return;
  
    setIsLoading(true);
    try {
      let transactionResponse;
      let liquidity = false;
      if (activeTab === "BUY" && !isLiquidityActive) {
        toast({
          title: "Adding Liquidity",
        });
  
        transactionResponse = await fetch(`${API_URL}/create-add-liquidity-transaction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mintAddress: tokenMint,
            solAmount: amount,
            account: walletProvider.publicKey?.toBase58(),
          }),
        });
        liquidity = true;
      } else {
        // Calculate minimum tokens out for BUY or minimum SOL out for SELL based on slippage
        let minTokensOutValue, minSolOutValue;
        
        if (activeTab === "BUY" && minTokensOut) {
          minTokensOutValue = Math.floor(parseFloat(minTokensOut) * 1_000_000_000);
          console.log('Min Tokens Out Value:', minTokensOutValue.toString());
        } else if (activeTab === "SELL" && minSolOut) {
          minSolOutValue = Math.floor(parseFloat(minSolOut));
          console.log('Min Sol Out Value:', minSolOutValue.toString());
        }

        const endpoint = activeTab === "BUY" 
          ? `${API_URL}/api/${tokenMint}/buy?amount=${amount}`
          : `${API_URL}/api/${tokenMint}/sell?amount=${tokenAmount}`;
  
        transactionResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account: walletProvider.publicKey?.toBase58(),
            minTokensOut: new BN(minTokensOutValue?.toString() || 0).toString(),
            minSolOut: new BN(minSolOutValue?.toString() || 0).toString()
          }),
        });
      }
  
      if (!transactionResponse.ok) {
        throw new Error('Failed to create transaction');
      }
  
      const { transaction: serializedTransaction, message } = await transactionResponse.json();
      
      const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));
      
      
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
        await updateReserveTokenAmount();
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
      setAmount("");
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
                  <div className="text-xs text-gray-400 mb-1">
                    Amount {activeTab === "SELL" && `(Available: ${(Number(tokenBalance) / 1_000_000_000).toFixed(2)})`}
                  </div>
                  {/*@ts-ignore*/}
                  <div className="flex">
                  <Input
                    onPointerEnterCapture={() => {}}
                    onPointerLeaveCapture={() => {}}
                    crossOrigin={undefined}
                    type="number"
                    value={amount}
                    onChange={(e) => handleAmountChange(e)}
                    className="!text-white bg-[#181816] rounded-lg w-[510px] pr-20"
                    containerProps={{
                      className: "!min-w-0 flex items-center gap-2"
                    }}
                    icon={
                      <div className="absolute right-2 text-gray-400">
                        {activeTab === "SELL" ? tokenSymbol : "SOL"}
                      </div>
                    }
                  />
                  <IconButton
                    placeholder=""
                    onPointerEnterCapture={() => {}}
                    onPointerLeaveCapture={() => {}}
                    variant="text"
                    className="bg-white/10 text-white rounded-full hover:bg-white/20 transition-all duration-200"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <Cog6ToothIcon className="h-5 w-5" />
                  </IconButton>
                  </div>
                  
                  {tokenAmount && tokenAmount !== "0" && activeTab === "BUY" && (
                    <div className="text-xs text-gray-400 mt-1">
                      ≈ {Number(tokenAmount).toFixed(4)} {tokenSymbol}
                    </div>
                  )}
                  {minTokensOut && activeTab === "BUY" && (
                    <div className="text-xs text-gray-400 mt-1">
                      Minimum received: {minTokensOut} {tokenSymbol} (slippage: {slippageTolerance}%)
                    </div>
                  )}
                  {estimatedSol && activeTab === "SELL" && (
                    <div className="text-xs text-gray-400 mt-1">
                      ≈ {estimatedSol} SOL
                    </div>
                  )}
                  {minSolOut && activeTab === "SELL" && (
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
                    Amount (Available: {(Number(tokenBalance) / 1_000_000_000).toFixed(2)})
                  </div>
                  {/*@ts-ignore*/}
                  <div className="flex">
                      {/*@ts-ignore*/}
                  <Input
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
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
                        {activeTab === "SELL" ? tokenSymbol : "SOL"}
                      </span>
                    }
                  />
                  <IconButton
                    placeholder=""
                    onPointerEnterCapture={() => {}}
                    onPointerLeaveCapture={() => {}}
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

