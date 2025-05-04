import { NextResponse, NextRequest } from "next/server";
import Wallet from "@/models/wallet";

export async function GET(req: NextRequest) {
  try {
    const walletAddress = req.nextUrl.searchParams.get("walletAddress");
    
    if (!walletAddress) {
      return NextResponse.json({ 
        authorized: false,
        message: "Wallet address not provided" 
      }, { status: 400 });
    }
    
    const authorizedWallet = await Wallet.findOne({ 
      walletAddress,
      authorized: true 
    });
    
    return NextResponse.json({ 
      authorized: !!authorizedWallet 
    });
  } catch (error) {
    console.error("Error checking authorization:", error);
    return NextResponse.json({ 
      authorized: false,
      message: "Server error" 
    }, { status: 500 });
  }
}