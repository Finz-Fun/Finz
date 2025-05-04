'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react";
// import { GalleryVerticalEnd } from "lucide-react"

import { LoginForm } from "../../components/ui/login-form"
import Image from "next/image";
import { Button } from "@material-tailwind/react";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import { toast } from "@/hooks/use-toast";
import { useAuthorization } from "@/hooks/useAuthorization";

export default function Setup() {
  const router = useRouter()
  const { open } = useAppKit();
  // const [isLoading, setIsLoading] = useState(true)
    const { isAuthorized, isLoading } = useAuthorization();

    useEffect(() => {
      if (!isLoading && !isAuthorized) {
        router.push('/');
      }
    }, [isAuthorized, isLoading, router]);

  if (isLoading) {
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
    isAuthorized && (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
       
        <LoginForm />
      </div>
    </div>)
  )
}
