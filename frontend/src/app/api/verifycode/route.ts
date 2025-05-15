import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongoose'; 
import Wallet from '@/models/wallet'; 
import InviteCode from '@/models/InviteCode'; 

export async function POST(request: Request) {
  try {
    await connectDB(); 
    const { inviteCode, walletAddress } = await request.json();

    if (!inviteCode || !walletAddress) {
      return NextResponse.json({ message: 'Invite code and wallet address are required' }, { status: 400 });
    }

    const inviteCodeEntry = await InviteCode.findOne({ name: inviteCode });

    if (!inviteCodeEntry) {
      return NextResponse.json({ message: 'Invalid invite code' }, { status: 404 });
    }

    const walletAlreadyInList = inviteCodeEntry.addresses.includes(walletAddress);

    if (!walletAlreadyInList && inviteCodeEntry.addresses.length >= inviteCodeEntry.limit) {
      return NextResponse.json({ message: 'Invite code limit reached' }, { status: 403 });
    }

    if (!walletAlreadyInList) {
      inviteCodeEntry.addresses.push(walletAddress);
      await inviteCodeEntry.save();
    }

    const walletToAuthorize = await Wallet.findOne({ walletAddress: walletAddress });

    if (!walletToAuthorize) {
      return NextResponse.json({ message: 'Wallet not found for authorization. Please ensure the wallet is registered.' }, { status: 404 });
    }

    walletToAuthorize.authorized = true;
    walletToAuthorize.authorizedAt = new Date();
    await walletToAuthorize.save();

    return NextResponse.json({ 
      message: 'Invite code verified and wallet authorized successfully',
      code: inviteCodeEntry.name,
      walletAuthorized: walletAddress
    }, { status: 200 });

  } catch (error) {
    console.error('Error verifying invite code:', error);
    if (error instanceof Error) {
      return NextResponse.json({ message: `Server error: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: 'An unknown server error occurred' }, { status: 500 });
  }
}