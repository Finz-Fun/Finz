import { NextResponse } from "next/server";
import Wallet from "@/models/wallet";
import { connectDB } from "@/lib/mongoose";

export async function POST(req: Request) {
  try {
    await connectDB();
    
    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    await Wallet.findOneAndUpdate(
      { walletAddress },
      { 
        walletAddress,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating wallet:', error);
    return NextResponse.json(
      { error: "Failed to update wallet" },
      { status: 500 }
    );
  }
}
