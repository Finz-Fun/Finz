"use client";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PricingCard } from "@/components/ui/PricingCard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@radix-ui/react-tooltip";

const API_URL = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:3000';

interface Token {
  title: string;
  symbol: string;
  imageUrl: string;
  priceSol: number;
  avatarUrl: string;
  tokenMint: string;
  tweetLink: string;
  username: string;
  mcap: number;
}

import { useSearch } from "@/context/SearchContext";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useAppKit } from "@reown/appkit/react";
import { Button } from "@material-tailwind/react";

const SOL_PRICE_CACHE_KEY = 'solana_price_cache';
const CACHE_DURATION = 10 * 60 * 1000;

export default function Portal() {
  const router = useRouter()
  const { open } = useAppKit();
  // const [isLoading, setIsLoading] = useState(true)
    const { isAuthorized, isLoading:isAuthLoading } = useAuthorization();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'regular' | 'following'>('regular');
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '12h' | '24h' | 'all'>('24h');
  const [showFilters, setShowFilters] = useState(false);
  const [solPrice, setSolPrice] = useState<number>(1);
  const { searchQuery } = useSearch();

    useEffect(() => {
      if (!isAuthLoading && !isAuthorized) {
        router.push('/');
      }
    }, [isAuthorized, isAuthLoading, router]);

    useEffect(() => {
      const fetchTokens = async () => {
        try {
          const res = await fetch(`${API_URL}/api/tokens`);
          const data:Token[] = await res.json();
          const tokens = data.reverse()
          setTokens(tokens);
        } catch (error) {
          console.error('Error fetching tokens:', error);
        } finally {
          setIsLoading(false);
          const solPrice =await fetchSolPrice()
          setSolPrice(solPrice)
        }
      };
      fetchTokens();
    }, []);

    const filteredTokens = React.useMemo(() => {
      if (!tokens) return [];
      
      let filtered = [...tokens];
      
      if (searchQuery) {
        filtered = filtered.filter(token => 
          token.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          token.username.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      
      if (sortBy) {
        filtered.sort((a, b) => {
          let comparison = 0;
          switch (sortBy) {
            case 'Market cap':
              comparison = a.mcap - b.mcap;
              break;
            case 'Creation time':
              comparison = tokens.indexOf(a) - tokens.indexOf(b);
              break;
            default:
              comparison = 0;
          }
          return sortDirection === 'asc' ? comparison : -comparison;
        });
      }
      
      return filtered;
    }, [tokens, searchQuery, sortBy, sortDirection]);
  
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
  

  if (isAuthLoading) {
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


  if (!isAuthorized) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen w-full relative">
        <section className="w-full pt-12 sm:pt-12 lg:pt-24">
          <div className="relative px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto text-center lg:max-w-lg">
              <p className="text-lg font-normal text-gray-300 sm:text-xl">
                Trade your social attention - buy & sell tweets on bonding curve & support your favourite creators
              </p>
              <div className="mt-4 text-md font-light text-gray-300 sm:text-lg">
                Charts powered by{" "}
                <a 
                  className="text-blue-500" 
                  href="https://in.tradingview.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Tradingview
                </a>
              </div>
            </div>

            <div className=" flex flex-col gap-6 mt-16">
              <div className="flex justify-center items-center gap-4 w-full max-w-2xl mx-auto">
                <div className="bg-gray-800/50 backdrop-blur-sm p-1 rounded-lg flex gap-1 flex-1">
                  <button
                    onClick={() => setActiveFilter('regular')}
                    className={`px-6 py-2 rounded-md transition-all duration-200 flex-1 ${activeFilter === 'regular' ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
                  >
                    Regular Feed
                  </button>
                  <button
                    onClick={() => setActiveFilter('following')}
                    className={`px-6 py-2 rounded-md transition-all duration-200 flex-1 ${activeFilter === 'following' ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
                  >
                    Following
                  </button>
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-2 rounded-lg bg-gray-800/50 backdrop-blur-sm text-white/70 hover:text-white transition-all duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              {showFilters && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex justify-center items-center gap-4">
                    <div className="relative">
                      <select
                        value={sortBy || ''}
                        onChange={(e) => setSortBy(e.target.value || null)}
                        className="w-48 px-4 py-2 rounded-md bg-gray-900 text-gray-300 border border-gray-800 hover:bg-gray-800 transition-all duration-200 appearance-none cursor-pointer pr-8 focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        <option value="" className="bg-gray-900 text-gray-300">Sort By:</option>
                        {['Volume', 'Creation time', 'Market cap', 'Price change'].map((option) => (
                          <option key={option} value={option} className="bg-gray-900 text-gray-300 hover:bg-gray-800">{option}</option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-300">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    <div className="relative">
                      <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as '1h' | '6h' | '12h' | '24h' | 'all')}
                        className={`w-48 px-4 py-2 rounded-md bg-gray-900 text-gray-300 border border-gray-800 hover:bg-gray-800 transition-all duration-200 appearance-none cursor-pointer pr-8 focus:outline-none focus:ring-2 focus:ring-white/20 ${(sortBy === 'Market cap' || sortBy === 'Creation time') ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={sortBy === 'Market cap' || sortBy === 'Creation time'}
                      >
                        <option value="" disabled className="bg-gray-900 text-gray-300">By Time:</option>
                        {['1h', '6h', '12h', '24h', 'all'].map((time) => (
                          <option key={time} value={time} className="bg-gray-900 text-gray-300 hover:bg-gray-800">{time === 'all' ? 'All time' : time}</option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-300">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                            className="p-2 rounded-lg bg-gray-800/50 backdrop-blur-sm text-white/70 hover:text-white transition-all duration-200"
                          >
                            {sortDirection === 'asc' ? (
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h5M3 16h9M3 20h13" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h5M3 16h9M3 20h13" transform="rotate(180 12 12)" />
                              </svg>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="px-2 py-1 text-sm bg-gray-900 text-gray-300 rounded-md shadow-lg border border-gray-800 backdrop-blur-sm">{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
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
                  {filteredTokens.map((item: Token, index: number) => (
                    <div key={`${item.tokenMint}-${index}`}>
                      <PricingCard 
                        title={item.title} 
                        symbol={item.symbol} 
                        imageUrl={item.imageUrl} 
                        avatarUrl={item.avatarUrl} 
                        priceSol={item.priceSol} 
                        tokenMint={item.tokenMint} 
                        tweetLink={item.tweetLink} 
                        username={item.username} 
                        solPrice={solPrice}
                        mcap={item.mcap}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}