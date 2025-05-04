import {  getSession } from "../auth/[...nextauth]/auth";
import Creator from "@/models/Creator";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";

export async function POST(req: Request) {
  try {
    // First ensure MongoDB connection is established
    await connectDB();
    
    const session = await getSession();
    console.log("session", session);
    //@ts-ignore
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { walletAddress } = await req.json();
    console.log("walletAddress", walletAddress);

    await Creator.findOneAndUpdate(
      {
        //@ts-ignore
        twitterId: session.user.twitterId,
        $or: [
          { walletAddress: { $exists: false } },
          { walletAddress: null },
          { walletAddress: "" }
        ]
      },
      { walletAddress: walletAddress },
      { new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating creator wallet:", error);
    return NextResponse.json(
      { error: "Failed to update wallet" },
      { status: 500 }
    );
  }
}