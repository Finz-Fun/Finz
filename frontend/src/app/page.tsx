"use client";

import Image from "next/image";
import { Button } from "@material-tailwind/react";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { useAuthorization } from "@/hooks/useAuthorization";

export default function Home() {
  const { open } = useAppKit();
  const { isConnected, address } = useAppKitAccount();
  const [inviteCode, setInviteCode] = useState(['', '', '', '', '', '']);
  const router = useRouter();
  const { isAuthorized, isLoading: authLoading } = useAuthorization();

  // Check if already authorized
  useEffect(() => {
    if (isAuthorized) {
      router.push("/portal");
    }
  }, [isAuthorized, router]);

  const handleCodeChange = (index: number, value: string) => {
    // Only allow alphanumeric characters and convert to uppercase
    const sanitizedValue = value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();

    if (sanitizedValue.length <= 1) {
      const newCode = [...inviteCode];
      newCode[index] = sanitizedValue;
      setInviteCode(newCode);

      // Auto-focus next input
      if (sanitizedValue && index < 5) {
        const nextInput = document.getElementById(`code-${index + 1}`);
        nextInput?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !inviteCode[index]) {
      e.preventDefault();
      if (index > 0) {
        const newCode = [...inviteCode];
        newCode[index - 1] = '';
        setInviteCode(newCode);
        const prevInput = document.getElementById(`code-${index - 1}`);
        prevInput?.focus();
      }
    }
  };

  const handleSubmit = async () => {
    const code = inviteCode.join('');
    console.log('Submitted code:', code);
    
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/verifycode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          inviteCode: code, 
          walletAddress: address.toString() 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Your wallet has been authorized!",
        });
        
        // Redirect to profile page after successful verification
        setTimeout(() => {
          router.push("/portal");
        }, 1500);
      } else {
        toast({
          title: "Invalid invite code",
          description: "Re-enter or DM us to get code.",
          action: (
            <button
              onClick={() => window.open('https://twitter.com/messages/compose?recipient_id=1571406013105901568&text=Gib%20invite%20code%2E%20My%20addy%3A%20' + address, '_blank')}
              className="text-blue-500 hover:text-blue-700"
            >
              Get Code Now
            </button>
          )
        });
      }
    } catch (error) {
      console.error('Error verifying invite code:', error);
      toast({
        title: "Error",
        description: "Failed to verify invite code. Please try again."
      });
    }
  };

  // Show loading state during authorization check
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

  return (
    <div className="min-h-screen flex flex-col items-center">
      <div className="w-full flex justify-end p-4">
        {isConnected && (
          //@ts-ignore
          <Button
            onClick={() => open()}
            variant="text"
            className="bg-white/10 text-white hover:bg-white/20 transition-all duration-200 flex items-center justify-center gap-3 w-48 py-3 text-base font-normal"
          >
            <UserCircleIcon className="h-5 w-5" />
            <span>{address?.toString().slice(0, 4)}...{address?.toString().slice(-4)}</span>
          </Button>
        )}
      </div>
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

        {!isConnected ? (
          <>
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
          </>
        ) : (
          <>
            <p className="text-sm text-gray-300 mt-4">
              Enter your invite code below
            </p>
            <div className="flex gap-2 mt-6">
              {inviteCode.map((digit, index) => (
                <input
                  key={index}
                  id={`code-${index}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-12 text-center text-2xl font-bold bg-white/10 text-white border-2 border-white/20 rounded-lg focus:outline-none focus:border-white/40 transition-all"
                />
              ))}
            </div>
            {/*@ts-ignore*/}
            <Button
              onClick={handleSubmit}
              variant="text"
              className=" bg-white/10 text-white hover:bg-white/20 transition-all duration-200 py-3 w-96 text-base"
            >
              Submit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}



