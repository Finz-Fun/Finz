
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import { ThemeProvider } from "../components/ui/theme-provider"
import { Navbar } from "../components/ui/navbar-menu";
import { Toaster } from "@/components/ui/toaster"
import { getSession } from "@/app/api/auth/[...nextauth]/auth";
import Providers from "./providers";
import NavigationWrapper from "@/components/ui/NavigationWrapper";
import { AppKitProvider } from "@/components/ui/AppKitProvider";
import { SearchProvider } from "@/context/SearchContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finz",
  description: "Launchpad for tokenized contents for digital creators to earn perpetual revenue",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased relative`}
      >
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <Image
            src="/bg2.svg"
            alt="Background"
            fill
            className="object-cover translate-x-60 scale-90 -translate-y-32 opacity-100"
            priority
          />
          <Image
            src="/bg2.svg"
            alt="Background"
            fill
            className="object-cover -translate-x-60 scale-125 translate-y-48 opacity-100"
            priority
          />
        </div>
        <AppKitProvider>
          <Providers session={session as any}>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              <SearchProvider>
                <NavigationWrapper />
                <Toaster />
                {children}
              </SearchProvider>
            </ThemeProvider>
          </Providers>
        </AppKitProvider>
      </body>
    </html>
  );
}
