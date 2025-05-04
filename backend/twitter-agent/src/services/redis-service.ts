import Redis from 'ioredis';
import { TokenCreationState } from '../types';

export class RedisService {
    private redis: Redis;
    private readonly MENTION_SET = 'processed_mentions';
    private readonly STATE_PREFIX = 'tweet_state:';
    private readonly STATE_EXPIRY = 60 * 60 * 24; 

    constructor() {
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
        });
    }

    // Mention handling
    async addProcessedMention(tweetId: string): Promise<void> {
        await this.redis.sadd(this.MENTION_SET, tweetId);
    }

    async isMentionProcessed(tweetId: string): Promise<boolean> {
        return await this.redis.sismember(this.MENTION_SET, tweetId) === 1;
    }

    // State management
    async setState(tweetId: string, state: TokenCreationState): Promise<void> {
        await this.redis.setex(
            `${this.STATE_PREFIX}${tweetId}`,
            this.STATE_EXPIRY,
            JSON.stringify(state)
        );
    }

    async getState(tweetId: string): Promise<TokenCreationState | null> {
        const state = await this.redis.get(`${this.STATE_PREFIX}${tweetId}`);
        return state ? JSON.parse(state) : null;
    }

    async deleteState(tweetId: string): Promise<void> {
        await this.redis.del(`${this.STATE_PREFIX}${tweetId}`);
    }

    async cleanup(): Promise<void> {
        await this.redis.quit();
    }
}