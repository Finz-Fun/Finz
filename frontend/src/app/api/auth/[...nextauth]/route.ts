import { authOptions } from "@/app/api/auth/[...nextauth]/auth"
import NextAuth from "next-auth"
import { connectDB } from "@/lib/mongoose";

console.log('🚀 Initializing NextAuth route');

try {
  console.log('📡 Attempting database connection...');
  await connectDB();
  console.log('✅ Database connection successful');
} catch (error) {
  console.error('❌ Database connection failed:', error);
  throw error;
}

console.log('🔄 Setting up NextAuth handler');
const handler = NextAuth(authOptions as any);
console.log('✅ NextAuth handler ready');

export { handler as GET, handler as POST }