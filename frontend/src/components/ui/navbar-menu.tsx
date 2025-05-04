"use client";
import React, { useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { createAppKit, useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'
import { solana, solanaTestnet, solanaDevnet } from '@reown/appkit/networks'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast";
// 0. Set up Solana Adapter
const solanaWeb3JsAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()]
})

// 1. Get projectId from https://cloud.reown.com
const projectId = '311166b62757b59a280e1ca356635240'

// 2. Create a metadata object - optional
const metadata = {
  name: 'finz-test',
  description: 'AppKit Example',
  url: 'https://app.finz.fun', // origin must match your domain & subdomain
  icons: ['https://assets.reown.com/reown-profile-pic.png']
}

// 3. Create modal
createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana],
  metadata: metadata,
  projectId,
  features: {
    connectMethodsOrder: ['email', 'social', 'wallet'],
    analytics: true // Optional - defaults to your Cloud configuration
  }
})

const { open } = useAppKit()


const transition = {
  type: "spring",
  mass: 0.5,
  damping: 11.5,
  stiffness: 100,
  restDelta: 0.001,
  restSpeed: 0.001,
};

export const MenuItem = ({
  setActive,
  active,
  item,
  children,
}: {
  setActive: (item: string) => void;
  active: string | null;
  item: string;
  children?: React.ReactNode;
}) => {
  return (
    <div onMouseEnter={() => setActive(item)} className="relative">
      <motion.p
        transition={{ duration: 0.3 }}
        className="cursor-pointer hover:opacity-[0.9] text-white"
      >
        {children} {/* This will render the links passed from the Navbar */}
      </motion.p>
      {active !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={transition}
        >
          {active === item && (
            <div className="absolute top-[calc(100%_+_1.2rem)] left-1/2 transform -translate-x-1/2 pt-4">
              <motion.div
                transition={transition}
                layoutId="active"
                className="bg-white dark:bg-black backdrop-blur-sm rounded-2xl overflow-hidden border border-black/[0.2] dark:border-white/[0.2] shadow-xl"
              >
                <motion.div layout className="w-max h-full p-4">
                  {children} {/* Display the child content here */}
                </motion.div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export const Menu = ({
  setActive,
  children,
}: {
  setActive: (item: string | null) => void;
  children: React.ReactNode;
}) => {
  return (
    <nav
      onMouseLeave={() => setActive(null)} // resets the state
      className="relative rounded-full border text-white bg-black border-white/[0.4] shadow-input flex justify-center space-x-4 px-8 py-6 "
    >
      {children}
    </nav>
  );
};

export const ProductItem = ({
  title,
  description,
  href,
  src,
}: {
  title: string;
  description: string;
  href: string;
  src: string;
}) => {
  return (
    <Link href={href} className="flex space-x-2">
      <Image
        src={src}
        width={140}
        height={70}
        alt={title}
        className="flex-shrink-0 rounded-md shadow-2xl"
      />
      <div>
        <h4 className="text-xl font-bold mb-1 text-black dark:text-white">
          {title}
        </h4>
        <p className="text-neutral-700 text-sm max-w-[10rem] dark:text-neutral-300">
          {description}
        </p>
      </div>
    </Link>
  );
};

export const HoveredLink = ({ children, ...rest }: any) => {
  return (
    <Link
      {...rest}
      className="text-neutral-700 dark:text-neutral-200 hover:text-black "
    >
      {children}
    </Link>
  );
};

export const Navbar = ({ className }: { className?: string }) => {
  const [active, setActive] = React.useState<string | null>(null);
  const { address, isConnected, caipAddress, status, embeddedWalletInfo } = useAppKitAccount()
  const { toast } = useToast()
  useEffect( () => {
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

  return (
    <div
      className={`fixed top-10 inset-x-0 max-w-2xl mx-auto z-50 ${className}`}
    >
      <Menu setActive={setActive}>
        <MenuItem setActive={setActive} active={null} item="Home">
          <Link href="/">Home</Link>
        </MenuItem>
        <MenuItem setActive={setActive} active={null} item="Home">
          <AlertDialog>
            <AlertDialogTrigger>FAQ</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>How it works?</AlertDialogTitle>
                <AlertDialogDescription>
                  <div className="text-sm text-muted-foreground space-y-4">
                    {/* Introduction Section */}
                    <div>
                      Finz is a socialfi platform that lets creators tokenize their content via AI agents and make it instantly trade-able anyone. 
                    </div>

                    {/* Content Creation Section */}
                    <div>
                      <strong>If you create content on socials:</strong>
                      <ul className="list-disc list-inside mt-2">
                        <li>Step 1: Login with your wallet</li>
                        <li>Step 2: Go to <Link href="/setup"><strong>Setup Agent</strong></Link> and connect your X and turn on the AI agent. Our AI agent will auto tokenize any new posts where your have tagged it</li>
                        <li>Step 3: The posts/content that gets tokenized can instantly be trade-able by the users on this platform and creators will earn perpetual revenue from the fees</li>
                      </ul>
                    </div>

                    {/* Content Consumption Section */}
                    <div>
                      <strong>If you consume content on socials:</strong>
                      <ul className="list-disc list-inside mt-2">
                        <li>Step 1: Login with your wallet</li>
                        <li>Step 2: Discover tokenized contents from the home page. </li>
                        <li>Step 3: Ape in the tokenized contents & trade freely.</li>
                      </ul>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </MenuItem>
        <MenuItem setActive={setActive} active={null} item="Setup Agent">
          <Link href="/setup">Setup</Link>
        </MenuItem>
        <MenuItem setActive={setActive} active={null} item="Onramp">
       
             <button onClick={() => isConnected?(open({view: 'OnRampProviders'})):toast({
                title: "Login Required",
                description: "Please login before you can onramp ",
              })}>OnRamp</button>
       
     
              
   
        </MenuItem>
        <MenuItem setActive={setActive} active={null} item="Login" >
          {/* Conditionally render based on the `isConnected` state */}
          {isConnected ? (
            //  <button onClick={() => open()}>Wallet</button>
             <button> <Link href="/profile">Profile</Link></button>
          ) : (
            <button onClick={() => open()}>Login</button>
          )}
        </MenuItem>
      </Menu>
    </div>
  );
};
