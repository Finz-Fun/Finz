import { TokenCreationResult } from '../types';
import dotenv from 'dotenv';

dotenv.config();

export class TokenService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.TOKEN_BACKEND_URL!;
  }

  async createToken({
    name,
    tokenName,
    symbol,
    tweetId,
    username,
    content,
    timestamp,
    replies,
    retweets,
    likes,
    creator,
    tweetImage,
    avatarUrl
  }: {
    name: string,
    tokenName: string,
    symbol: string,
    tweetId: string,
    username: string,
    content: string,
    timestamp: string,
    replies: number,
    retweets: number,
    likes: number,
    creator: string,
    tweetImage: string,
    avatarUrl: string
  }): Promise<TokenCreationResult> {
    try {
      console.log(`Creating token ${tokenName} with ticker ${symbol} for user ${creator}`);
      const response = await fetch(
        `${this.baseUrl}/create-token?tokenName=${tokenName}&symbol=${symbol}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tweetId,
            name,
            username,
            content,
            timestamp,
            replies,
            retweets,
            likes,
            creator,
            tweetImage,
            avatarUrl
          })
        }
      );
      console.log('response', response);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        tokenMint: data.tokenMint,
        success: true
      };
    } catch (error) {
      console.error('Token creation failed:', error);
      return {
        tokenMint: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}