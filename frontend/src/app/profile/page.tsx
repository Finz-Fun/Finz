"use client";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import {
  useDisconnect,
  useAppKit,
  useAppKitProvider,
  useAppKitAccount,
} from "@reown/appkit/react";
import { Provider } from "@reown/appkit-adapter-solana/react";
import { FaCopy } from "react-icons/fa";
import { toast, useToast } from "@/hooks/use-toast";
import { LuDiamondPlus } from "react-icons/lu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Connection } from "@solana/web3.js";
import { Loader2 } from "lucide-react";
import { PricingCard } from "@/components/ui/PricingCard";
import { useAuthorization } from "@/hooks/useAuthorization";
import { Button } from "@material-tailwind/react";


const API_URL = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:3000';
//@ts-ignore
const fetcher = (...args: any) => fetch(...args).then(res => res.json())

interface Token {
  title: string;
  symbol: string;
  imageUrl: string;
  priceSol: number;
  avatarUrl: string;
  tokenMint: string;
  tweetLink: string;
  username: string;
}
const SOL_PRICE_CACHE_KEY = 'solana_price_cache';
const CACHE_DURATION = 10 * 60 * 1000;

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

const handleCopyToClipboard = (value: string) => {
  navigator.clipboard
    .writeText(value)
    .then(() =>
      toast({
        title: "Wallet address copied",
        description: "The address of your wallet has been copied to clipboard",
      })
    )
    .catch(() => alert("Failed to copy!"));
};

export default function Profile() {
  const router = useRouter()
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [followers, setFollowers] = useState<number>(0);
  const session = useSession()
  const [balance, setBalance] = useState<number>(0);
  const [solPrice, setSolPrice] = useState<number>(1)
  const { isConnected } = useAppKitAccount()
  const { toast } = useToast()
  const { isAuthorized, isLoading: authLoading } = useAuthorization();
  const connection = new Connection(process.env.SOLANA_ENVIRONMENT === 'mainnet' ? (process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com") : "https://api.devnet.solana.com");

  // Combined authorization and session check
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthorized) {
        router.push('/');
        return;
      }
      
      if (session.status === "unauthenticated") {
        router.push("/setup");
        return;
      }
    }
  }, [isAuthorized, authLoading, session.status, router]);

  useEffect(() => {
    const getBalance = async () => {
      if (walletProvider?.publicKey) {
        try {
          const balance = await connection.getBalance(walletProvider.publicKey);
          setBalance(balance / 1000000000);
        } catch (error) {
          console.error("Error fetching balance:", error);
          setBalance(0);
        }
      }
    };
    getBalance();
  }, [walletProvider?.publicKey, connection]);

  useEffect(() => {
    const fetchTokens = async () => {
      if(session?.data?.user){

        try {
          // @ts-ignore
          const res = await fetch(`${API_URL}/api/tokens/creator/${session?.data?.user?.twitterId}`);
          const data:Token[] = await res.json();
          const tokens = data.reverse()
          setTokens(tokens);
        } catch (error) {
          console.error('Error fetching tokens:', error);
        } finally{
          setIsLoading(false);
          const solPrice =await fetchSolPrice()
          setSolPrice(solPrice)
        }
      }
    };
    fetchTokens();
  }, []);


  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center">
      <div className="text-center space-y-6 p-6 flex flex-col items-center pt-32">
        <div className="relative w-48 h-48 mx-auto mb-2 flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="Logo"
            fill
            className="object-contain rounded-xl"
            priority
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>

        <h1 className="text-4xl font-bold text-white tracking-[0.075em] w-96">
          WELCOME TO THE
          PRIVATE BETA
        </h1>


            <p className="text-sm text-gray-300 mt-4">
              Please login to get started with finz.
            </p>
            <div className="mt-8 flex justify-center w-full">
              {/*@ts-ignore*/}
              <Button
                onClick={() => open()}
                variant="text"
                className="bg-white/10 text-white hover:bg-white/20 transition-all duration-200 flex items-center justify-center gap-3 w-96 py-3 text-lg"
              >
                <img
                  src="/solanaLogo.png"
                  alt="Solana Logo"
                  className="w-4 h-4"
                />
                Login with wallet
              </Button>
            </div>
      </div>
    </div>
    );
  }

  // Show loading state while checking auth or session
  if (!authLoading && session.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
          <p className="mt-4 text-white text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Only render the main content if both authorized and authenticated
  if (!isAuthorized || session.status !== "authenticated") {
    return null;
  }

  




  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Profile Header Section */}
        <div className="w-full max-w-2xl mx-auto bg-[#1d1d1b] rounded-lg shadow-lg p-8 mb-8">
          <div className="flex flex-col items-center">
            <Image
              // @ts-ignore
              src={session?.data?.user?.profileImage || '/image.png'}
              alt="Profile"
              width={120}
              height={120}
              className="rounded-full border-4 border-gray-500 mb-4"
            />
            <div className="flex items-center space-x-4 mb-6">
              <Image
                src="/pngwing.com.png"
                alt="Profile Icon"
                width={32}
                height={32}
                className="rounded-full"
              />
              <h1 className="text-2xl font-bold text-white">{session?.data?.user?.name}</h1>
            </div>

            {/* Stats Section */}
            <div className="flex justify-center space-x-12 mb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{tokens ? tokens.length : 0}</p>
                <p className="text-sm text-gray-400">Posts</p>
              </div>
              {/* <div className="text-center">
                <p className="text-2xl font-bold text-white">{session?.data?.user ? session?.data?.user?.followersCount : 0}</p>
                <p className="text-sm text-gray-400">Followers</p>
              </div> */}
            </div>

            {/* Wallet Info */}
            <div className="flex flex-col items-center space-y-4">
              {walletProvider?.publicKey && (
                <div className="flex items-center space-x-2 text-white">
                  <span>Wallet:</span>
                  <span>{walletProvider.publicKey.toString().slice(0, 4)}...{walletProvider.publicKey.toString().slice(-4)}</span>
                  <FaCopy
                    className="cursor-pointer hover:text-gray-300"
                    onClick={() => handleCopyToClipboard(walletProvider?.publicKey?.toString() || "")}
                  />
                </div>
              )}
              <div className="flex items-center space-x-2 text-white">
                <span>Balance: {balance.toFixed(2)} SOL</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <LuDiamondPlus
                        className="cursor-pointer hover:text-gray-300"
                        onClick={() => open({ view: "OnRampProviders" })}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Buy SOL</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {/* Logout Button */}
            <button
              className="mt-6 px-6 py-2 text-sm font-medium text-red-500 hover:text-red-400 hover:underline"
              onClick={() => {
                disconnect()
                router.push("/")
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      {/* Launched Tokens Section */}
      <div className="w-full max-w-2xl mx-auto rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Launched Tokens</h2>
            <div className="flex flex-wrap justify-center gap-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center w-full py-12">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                  <p className="mt-4 text-white text-sm">Loading tokens...</p>
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-white text-center py-12">
                  No tokens available
                </div>
              ) : (
                <div className="flex flex-col items-center mt-12 gap-6">
                {tokens.map((item: Token, index: number) => (
                  <div
                    key={`${item.tokenMint}-${index}`}
                    // className="overflow-hidden transform text-white bg-[#1d1d1b] border shadow-[8px_8px_20px_rgba(0,0,0,0.4),8px_8px_20px_rgba(255,255,255,0.08)] 
                    // transition-all duration-300 ease-in-out rounded-md w-[280px] h-[360px] hover:shadow-lg hover:-translate-y-1 group flex flex-col"
                  >
                    <PricingCard title={item.title} symbol={item.symbol} imageUrl={item.imageUrl} avatarUrl={item.avatarUrl} priceSol={item.priceSol} tokenMint={item.tokenMint} tweetLink={item.tweetLink} username={item.username} solPrice={solPrice}/>
                  </div>
                ))}
               </div>)}
            </div>
          </div>
    </div>
  
  );
}
