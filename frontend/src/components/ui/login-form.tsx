"use client"
import { cn } from "@/src/lib/utils";
import { Button } from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";
import { Switch } from "./switch";
import { signIn, signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useAppKitAccount } from '@reown/appkit/react'

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const { address } = useAppKitAccount();
  console.log("address", address);

  useEffect(() => {
    //@ts-ignore
    setAgentEnabled(session?.user?.agentEnabled || false);
  }, [session]);

  useEffect(() => {
    const updateWallet = async () => {
      if (session && address) {
        try {
          await fetch('/api/creator', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ walletAddress: address }),
          });
        } catch (error) {
          console.error('Failed to update wallet:', error);
        }
      }
    };

    updateWallet();
  }, [session, address]);

  const handleTwitterSignIn = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await signIn("twitter", {
        callbackUrl: "/setup",
      });
    } catch (error) {
      console.error("Error signing in:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await signOut({ 
        callbackUrl: "/"
      });
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToggle = async (checked: boolean) => {
    setAgentEnabled(checked);
  }

  const handleSave = async (checked: boolean) => {
    //@ts-ignore
    if (!session?.user?.twitterId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URI}/api/creators/agent-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          //@ts-ignore
          twitterId: session.user.twitterId,
          agentEnabled: checked
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update agent status');
      }

      const data = await response.json();
      
      toast({
        title: checked ? "AI Agent Enabled" : "AI Agent Disabled",
        description: data.message,
      });
      setAgentEnabled(checked);
    } catch (error) {
      console.error('Error updating agent status:', error);
      toast({
        title: "Error",
        description: "Failed to update agent status",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Setup your AI Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            { status === "authenticated" ? (
              <div className="flex flex-col gap-4">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleSignOut}
                  disabled={isLoading}
              >
                {isLoading ? "Logging out..." : "Logout"}
              </Button>
            </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleTwitterSignIn}
                  disabled={isLoading}
              >
                {isLoading ? "Connecting..." : "Login with X (twitter)"}
              </Button>
            </div>
            )}

            {status === "authenticated" && (
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <div className="flex items-center">
                    Turn on your AI Agent
                    <div className="ml-12">
                      <Switch 
                      //@ts-ignore
                        checked={agentEnabled}
                        onCheckedChange={handleSwitchToggle}
                        disabled={isLoading || status !== "authenticated"}
                      />
                    </div>
                  </div>
                </div>
                <Button 
                  className="w-full"
                  disabled={isLoading}
                  onClick={() => handleSave(agentEnabled)}
                >
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        By clicking continue, you agree to our{" "}
        <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a>{" "}
        and{" "}
        <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>.
      </div>
    </div>
  );
}
