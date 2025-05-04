import { useState, useEffect } from "react";
import { useAppKitProvider } from "@reown/appkit/react";
import { Provider } from "@reown/appkit-adapter-solana/react";

export function useAuthorization() {
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const checkAuthorization = async () => {
      // Wait for wallet to be available
      if (!walletProvider?.publicKey) {
        timeoutId = setTimeout(checkAuthorization, 500); // Check again in 500ms
        return;
      }

      try {
        const response = await fetch(
          `/api/authorized?walletAddress=${walletProvider.publicKey.toString()}`
        );
        
        const data = await response.json();
        setIsAuthorized(data.authorized);
      } catch (error) {
        console.error("Error checking authorization:", error);
        setIsAuthorized(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthorization();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [walletProvider?.publicKey]);

  return { isAuthorized, isLoading, walletAddress: walletProvider?.publicKey?.toString() };
}