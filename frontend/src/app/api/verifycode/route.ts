import { NextResponse, NextRequest } from "next/server";
import Wallet from "@/models/wallet";
import { connectDB } from "@/lib/mongoose";

const INVITE_CODE = "FINZ25";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { inviteCode, walletAddress } = await req.json();
    console.log(inviteCode,walletAddress)
    
    const existingWallet = await Wallet.findOne({ 
      walletAddress,
      authorized: true 
    });
    
    if (existingWallet) {
      return NextResponse.json({ 
        success: true,
        message: "Wallet already authorized"
      });
    }
    
    // Verify invite code
    if (inviteCode !== INVITE_CODE) {
      return NextResponse.json({ 
        success: false,
        message: "Invalid invite code" 
      }, { status: 400 });
    }
    
    await Wallet.findOneAndUpdate(
      { walletAddress },
      {
        walletAddress,
        authorized: true,
        authorizedAt: new Date(),
        lastUpdated: new Date()
      },
      { upsert: true }
    );
    
    return NextResponse.json({ 
      success: true,
      message: "Wallet authorized successfully" 
    });
  } catch (error) {
    console.error("Error verifying invite code:", error);
    return NextResponse.json({ 
      success: false,
      message: "Server error" 
    }, { status: 500 });
  }
}