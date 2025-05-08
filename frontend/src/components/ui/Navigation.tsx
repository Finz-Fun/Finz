"use client";

import { IconButton, Button, Dialog, DialogHeader, DialogBody, DialogFooter } from "@material-tailwind/react";
import { HomeIcon, UserCircleIcon, MagnifyingGlassIcon, XMarkIcon, Cog6ToothIcon, QuestionMarkCircleIcon, WalletIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createAppKit, useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { solana } from "@reown/appkit/networks";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearch } from "@/context/SearchContext";

const solanaWeb3JsAdapter = new SolanaAdapter({
  //@ts-ignore
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()]
});

// Get projectId from https://cloud.reown.com
const projectId = "311166b62757b59a280e1ca356635240";

// Metadata object - optional
const metadata = {
  name: "finz-test",
  description: "AppKit Example",
  url: "https://app.finz.fun", // Must match your domain & subdomain
  icons: ["https://assets.reown.com/reown-profile-pic.png"]
};

// Create modal
createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana],
  metadata: metadata,
  projectId,
  features: {
    connectMethodsOrder: ["email", "social", "wallet"],
    analytics: true // Optional - defaults to Cloud configuration
  }
});

const { open } = useAppKit();

export default function Navigation() {
  const router = useRouter();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const session = useSession();
  const { searchQuery, setSearchQuery } = useSearch();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement search functionality here
    console.log('Searching for:', searchQuery);
  };

  const toggleSearch = () => {
    if (showSearch) {
      setSearchQuery("");
    }
    setShowSearch(!showSearch);
  };

  useEffect(() => {
    const updateWallet = async () => {
      if (isConnected) {
        await fetch('/api/updatewallet', {
          method: 'POST',
          body: JSON.stringify({ walletAddress: address })
        });
      }
    };
    updateWallet();
  }, [isConnected, address]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside, true);
    return () => document.removeEventListener("click", handleClickOutside, true);
  }, []);

  return (
    <>
    {/* Desktop Navigation */}
    <div className="fixed inset-x-0 top-0 z-50 bg-black/5 backdrop-blur-md border-b border-white/10 hidden md:block">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Left section - Home */}
          <div className="flex-shrink-0 flex gap-2">
            <div
              onClick={() => router.push("/portal")}
              className="text-white/50 hover:text-white/80 transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer text-sm"
            >
              <HomeIcon className="h-4 w-4" />
              <span className="">Home</span>
            </div>
            <div
              onClick={() => router.push("/setup")}
              className="text-white/50 hover:text-white/80 transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer text-sm"
            >
              <Cog6ToothIcon className="h-4 w-4" />
              <span className="">Agent Settings</span>
            </div>
            <div
              onClick={() => setShowHowItWorks(true)}
              className="text-white/50 hover:text-white/80 transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer text-sm"
            >
              <QuestionMarkCircleIcon className="h-4 w-4" />
              <span className="">How it works</span>
            </div>
          </div>

          {/* Center section - Empty */}
          <div className="flex-1" />

          {/* Right section - Search, Login/Profile */}
          <div className="flex items-center space-x-4">
            {/* Search Icon/Bar */}
            <div className="relative flex items-center">
              {/*@ts-ignore*/}
              <IconButton
                variant="text"
                className="bg-white/10 text-white rounded-full hover:bg-white/20 transition-all duration-200 z-50"
                onClick={toggleSearch}
              >
                {showSearch ? (
                  <XMarkIcon className="h-5 w-5 text-white cursor-pointer" />
                ) : (
                  <MagnifyingGlassIcon className="h-5 w-5 text-white" />
                )}
              </IconButton>

              {showSearch && (
                <div className="absolute right-0 w-64 transform translate-x-2 mr-2">
                  <form onSubmit={handleSearch} className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full bg-white/10 text-white placeholder-white/50 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all duration-200"
                      autoFocus
                    />
                  </form>
                </div>
              )}
            </div>

            {/* Login/Profile */}
            {!isConnected && (
              /*@ts-ignore*/
              <Button
                onClick={() => open()}
                variant="text"
                className="bg-white/10 text-white hover:bg-white/20 transition-all duration-200 flex items-center gap-2"
              >
                Login with
                <img
                  src="/solanaLogo.png"
                  alt="Solana Logo"
                  className="w-3 h-3"
                />
                
              </Button>
            )}

            {isConnected && (
              <div className="relative" ref={dropdownRef}>
                {/*@ts-ignore*/}
                <IconButton
                  variant="text"
                  className="bg-white/10 text-white rounded-full hover:bg-white/20 transition-all duration-200"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <UserCircleIcon className="h-5 w-5 text-white" />
                </IconButton>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-gray-900 ring-1 ring-black ring-opacity-5">
                    <div className="py-1">
                      <div className="px-4 py-2 text-sm text-gray-300 border-b border-gray-700">
                        {/* @ts-ignore */}
                        {session?.data?.user?.username ?
                          //@ts-ignore
                          `@${session?.data?.user?.username}` :
                          <Link href="/setup" className="text-gray-300 hover:text-white">Connect X</Link>
                        }
                      </div>
                      <div className="px-4 py-2 text-sm text-gray-300 border-b border-gray-700">
                        {address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Loading..."}
                      </div>
                      <div
                        onClick={() => {
                          setIsDropdownOpen(false);
                          router.push("/profile");
                        }}
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 cursor-pointer"
                      >
                        Profile
                      </div>
                      <div
                        onClick={() => {
                          setIsDropdownOpen(false);
                          disconnect();
                          router.push("/");
                        }}
                        className="block px-4 py-2 text-sm text-red-500 hover:bg-gray-800 cursor-pointer"
                      >
                        Logout
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Mobile Bottom Navigation */}
    <div className="fixed inset-x-0 bottom-0 z-50 bg-black/5 backdrop-blur-md border-t border-white/10 md:hidden">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* @ts-ignore */}
          <IconButton
            variant="text"
            className="text-white/50 hover:text-white/80 transition-all duration-200"
            onClick={() => router.push("/portal")}
          >
            <HomeIcon className="h-5 w-5" />
          </IconButton>
            {/* @ts-ignore */}
          <IconButton
            variant="text"
            className="text-white/50 hover:text-white/80 transition-all duration-200"
            onClick={() => router.push("/setup")}
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </IconButton>

          {/* @ts-ignore */}
          <IconButton
            variant="text"
            className="text-white/50 hover:text-white/80 transition-all duration-200"
            onClick={toggleSearch}
          >
            {showSearch ? (
              <XMarkIcon className="h-5 w-5" />
            ) : (
              <MagnifyingGlassIcon className="h-5 w-5" />
            )}
          </IconButton>

          {/* @ts-ignore */}
          <IconButton
            variant="text"
            className="text-white/50 hover:text-white/80 transition-all duration-200"
            onClick={() => setShowHowItWorks(true)}
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </IconButton>

          {!isConnected ? (
            //@ts-ignore
            <IconButton
              variant="text"
              className="text-white/50 hover:text-white/80 transition-all duration-200"
              onClick={() => open()}
            >
              <WalletIcon className="h-5 w-5" />
            </IconButton>
          ) : (
            //@ts-ignore
            <IconButton
              variant="text"
              className="text-white/50 hover:text-white/80 transition-all duration-200"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <UserCircleIcon className="h-5 w-5" />
            </IconButton>
          )}
        </div>
      </div>

      {/* Mobile Search Drawer */}
      {showSearch && (
        <div className="fixed inset-x-0 bottom-16 bg-black/5 backdrop-blur-md border-t border-white/10 p-4">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-white/10 text-white placeholder-white/50 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all duration-200"
              autoFocus
            />
          </form>
        </div>
      )}
    </div>

    {/* How it works Modal */}
    {/*@ts-ignore*/}
    <Dialog
      open={showHowItWorks}
      handler={() => setShowHowItWorks(false)}
      className="bg-gray-900 text-white max-w-sm mx-auto overflow-y-auto"
      size="sm"
    >
      {/*@ts-ignore*/}
      <DialogHeader className="border-b border-gray-800 text-center justify-center">
        <h2 className="text-2xl font-bold text-white text-center">How it works?</h2>
      </DialogHeader>
      {/*@ts-ignore*/}
      <DialogBody className="text-gray-300 space-y-6 px-4 py-4">
        <div className="text-center">
        Finz is a platform for trading social attention—buy and sell tweets on a bonding curve while supporting your favorite creators. 
        </div>

        <div className="flex flex-col text-left">
          <h3 className="text-xl font-semibold mb-3 text-center">Get Started:</h3>
          <ul className="space-y-3 pl-4">
            <div>Step 1: Login with your wallet</div>
            <div>Step 2: Buy any tweet on bonding curve.</div>
            <div>Step 3: Sell at any time to lock in your profits or losses.</div>
          </ul>
        </div>

        <div className="flex flex-col text-left">
          <h3 className="text-xl font-semibold mb-3 text-center">Tokenize your tweets:</h3>
          <ul className="space-y-3 pl-4 text-left">
            <div>Step 1: Login with your wallet</div>
            <div>Step 2: Go to <span onClick={() => { setShowHowItWorks(false); router.push('/setup'); }} className="text-blue-400 cursor-pointer hover:underline">Setup Agent</span> and connect your X and turn on the AI agent.</div>
            <div>Step 3: Mention @finzfunAI on your tweets to tokenize & make it tradeable.</div>
          </ul>
        </div>

        {/* <div className="flex flex-col items-center text-center">
          <h3 className="text-xl font-semibold mb-3">If you consume content on socials:</h3>
          <ul className="space-y-3 pl-4 text-left">
            <div>Step 1: Login with your wallet</div>
            <div>Step 2: Discover tokenized contents from the home page</div>
            <div>Step 3: Ape in the tokenized contents & trade freely</div>
          </ul>
        </div> */}
      </DialogBody>
      {/*@ts-ignore*/}
      <DialogFooter className="border-t border-gray-800 flex justify-center px-4 py-2">
        {/*@ts-ignore*/}
        <Button
          size="md"
          color="white"
          className="hover:scale-[1.02] focus:scale-[1.02] active:scale-100 my-2"
          ripple={false}
          fullWidth={true}
          onClick={() => setShowHowItWorks(false)}
        >
          Gotit
        </Button>
       
        {/* <Button
          variant="text"
          onClick={() => setShowHowItWorks(false)}
          className="bg-white/10 text-white hover:bg-white/20 transition-all duration-200 w-full my-2"
        >
          Got it
        </Button> */}
      </DialogFooter>
    </Dialog>
    </>
  );
}
