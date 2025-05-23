"use client";

import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { createAppKit } from "@reown/appkit/react";
import { solana } from "@reown/appkit/networks";
import { useEffect } from "react";


export function AppKitProvider({ children }: { children: React.ReactNode }) {
    const solanaWeb3JsAdapter = new SolanaAdapter({

        //@ts-ignore
        wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()]
    });

        const metadata = {
            name: 'finz-test',
            description: 'AppKit Example',
            url: 'https://app.finz.fun',
            icons: ['https://assets.reown.com/reown-profile-pic.png']
        };

        createAppKit({
            adapters: [solanaWeb3JsAdapter],
            networks: [solana],
            metadata: metadata,
            projectId: '629e3ef2133d7bc1c3b554f934a5a2c7',
            features: {
                connectMethodsOrder: ['email', 'social', 'wallet'],
                analytics: true
            }
        });
    return <>{children}</>;
}
