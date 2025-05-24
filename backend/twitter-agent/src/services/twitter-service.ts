import { Scraper, SearchMode } from 'agent-twitter-client';
import { AiService } from './ai-service';
import { TokenService } from './token-service';
import { Validation, ValidationError } from '../utils/validation';
import dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cookie } from 'tough-cookie';

import Mentions from '../models/mentionsSchema';
import { Token } from '../models/tokenSchema';

dotenv.config();


const SOLANA_ENVIRONMENT = process.env.SOLANA_ENVIRONMENT || 'mainnet-beta';

interface Tweet {
  parentTweetId?: string;
  id: string;
  userId: string;
  text: string;
  timestamp?: string;
  replies?: number;
  retweets?: number;
  likes?: number;
  tweetUsername?: string;
  tweetName?: string;
  tweetContent?: string;
  creator?: string;
  tweetImage?: string;
  avatarUrl?: string;
  conversationId?: string;
}

interface TokenCreationState {
  stage: 'name' | 'confirm';
  name?: string;
  symbol?: string;
  userId: string;  // User who sent the original mention
  parentTweetId: string; // ID of the tweet to be tokenized
  suggestions: { name: string; ticker: string }[];
  isInitialReplyDone: boolean;
  isCompleted: boolean;
  createdAt: number;
  originalMentionId: string; // ID of the mention tweet that initiated this state
  originalMentionConversationId?: string;
  processedReplies: Set<string>; // IDs of user replies to bot's suggestions already handled for this state
}

interface TwitterSearchResult {
  id: string;
  userId: string;
  text: string;
  timestamp?: number;
  inReplyToStatusId?: string;
  conversationId?: string;
  username?: string;
  name?: string;
  replies?: number;
  retweets?: number;
  likes?: number;
}

export class TwitterService {
  private scraper: Scraper;
  private botUserId?: string;
  private isListening: boolean = false;
  private botScreenName: string = '';
  private tweetStates: Map<string, TokenCreationState> = new Map();
  private processedMentions: Set<string> = new Set();
  private lastProcessedTimestamp: number;
  private aiService: AiService;
  private tokenService: TokenService;
  private readonly MIN_BACKOFF = 120000;  
  private readonly MAX_BACKOFF = 170000;  
  private readonly ERROR_MIN_BACKOFF = 30000;  
  private readonly ERROR_MAX_BACKOFF = 90000;
  private readonly SEARCH_TIMEOUT = 4000; // 4 second timeout
  private readonly TIMESTAMP_FILE = path.join(__dirname, '../../last-processed.txt');
  private readonly COOKIE_FILE = path.join(__dirname, '../../cookies.json'); // Cookie file path
  private currentCredentialIndex: number = 0;
  private credentials: Array<{ username: string, password: string }>;
  private autoCreateTimeouts: Map<string, NodeJS.Timeout> = new Map();  // Add this to store timeouts

  constructor() {
    this.scraper = new Scraper();
    this.aiService = new AiService();
    this.tokenService = new TokenService();
    this.lastProcessedTimestamp = Date.now();
    
    this.credentials = [];
    let index = 0;
    while (process.env[`TWITTER_USERNAME_${index}`] && process.env[`TWITTER_PASSWORD_${index}`]) {
      this.credentials.push({
        username: process.env[`TWITTER_USERNAME_${index}`] as string,
        password: process.env[`TWITTER_PASSWORD_${index}`] as string
      });
      index++;
    }
    if (this.credentials.length === 0) {
      throw new Error('No Twitter credentials configured');
    }
  }

  private async reinitialize() {
    console.log('Attempting to reinitialize with different credentials...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    this.currentCredentialIndex = (this.currentCredentialIndex + 1) % this.credentials.length;
    const credentials = this.credentials[this.currentCredentialIndex];
    console.log('Reinitializing with credentials:', credentials.username);
    
    try {
        this.scraper = new Scraper();
        
        let loginAttempts = 0;
        const maxAttempts = 3;
        
        while (loginAttempts < maxAttempts) {
            try {
                await this.scraper.login(credentials.username, credentials.password);
                const isLoggedIn = await this.scraper.isLoggedIn();
                
                if (!isLoggedIn) {
                    throw new Error('Login unsuccessful');
                }
                
                console.log('Reinitialized and logged in with new credentials:', credentials.username);
                await this.saveCookies(); // Save cookies for the new successful login
                
                const me = await this.scraper.me();
                if (!me?.userId) {
                    throw new Error('Failed to get user details after reinitialization login');
                }
                
                this.botUserId = me.userId;
                this.botScreenName = me.username as string;
                console.log('Bot reinitialized as:', me.username);
                return true;
                
            } catch (error) {
                loginAttempts++;
                console.error(`Reinitialization login attempt ${loginAttempts} for ${credentials.username} failed:`, error);
                
                if (loginAttempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 10000 * loginAttempts));
                }
            }
        }
        
        console.error(`Failed to login with ${credentials.username} after ${maxAttempts} attempts during reinitialization.`);
        // If all attempts for current credentials fail, it will fall through and return false from reinitialize
        // The main loop will then decide if it needs to try the *next* set of credentials from the list or escalate.
        throw new Error(`Failed to reinitialize with ${credentials.username} after ${maxAttempts} attempts`);
        
    } catch (error) {
        console.error('Reinitialization process failed:', error);
        // Attempt to clear cookies if reinitialization fails badly, to ensure next cycle tries fresh login
        try {
            await fs.unlink(this.COOKIE_FILE);
            console.log('Cleared cookies due to reinitialization error.');
        } catch (unlinkError: any) {
            if (unlinkError.code !== 'ENOENT') {
                console.error('Error clearing cookies during reinitialization failure:', unlinkError);
            }
        }
        return false; // Reinitialization failed for this credential set
    }
}

  private async searchTweetsWithTimeout(query: string, limit: number): Promise<TwitterSearchResult[]> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Search tweets timeout'));
      }, this.SEARCH_TIMEOUT);

      try {
        const tweets: TwitterSearchResult[] = [];
        const iterator = this.scraper.searchTweets(query, limit, SearchMode.Latest);
        
        for await (const tweet of iterator) {
          tweets.push(tweet as TwitterSearchResult);
        }
        
        clearTimeout(timeout);
        resolve(tweets);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async initialize() {
    try {
      let loggedIn = false;
      // Try to load and use saved cookies first
      if (await this.loadAndSetCookies()) {
        loggedIn = await this.scraper.isLoggedIn(); // Double check, or rely on check in loadAndSetCookies
        if(loggedIn){
            console.log('Successfully initialized with saved cookies.');
        }
      }

      if (!loggedIn) {
        console.log('No valid session from cookies, attempting username/password login.');
        // Fallback to username/password login if cookies are not available or invalid
        const currentCredentials = this.credentials[this.currentCredentialIndex];
        await this.scraper.login(
          currentCredentials.username,
          currentCredentials.password
        );
        loggedIn = await this.scraper.isLoggedIn();
        if (loggedIn) {
          console.log('Login successful with username/password.');
          await this.saveCookies(); // Save cookies after successful login
        } else {
          console.error('Login failed with primary credentials.');
          // Optionally, trigger reinitialize here or throw to indicate critical failure
          // For now, we'll let it potentially fail and be caught by the main catch block
          throw new Error('Primary login failed during initialization');
        }
      }

      // Timestamp loading logic (remains the same)
      try {
        const savedTimestamp = await fs.readFile(this.TIMESTAMP_FILE, 'utf-8');
        console.log('Read from file:', savedTimestamp);
        
        if (savedTimestamp && savedTimestamp.trim()) {
          const timestamp = parseInt(savedTimestamp.trim());
          if (!isNaN(timestamp) && timestamp > 0) {
            this.lastProcessedTimestamp = timestamp;
            console.log('Loaded valid timestamp:', timestamp);
          } else {
            throw new Error('Invalid timestamp in file');
          }
        } else {
          throw new Error('Empty timestamp file');
        }
      } catch (error) {
        this.lastProcessedTimestamp = Date.now();
        console.log('Setting current timestamp:', this.lastProcessedTimestamp);
        await this.updateLastProcessedTimestamp(this.lastProcessedTimestamp);
      }

      // Scraper state setup (me, botUserId, etc.)
      const me = await this.scraper.me();
      if (!me?.userId) {
          // If 'me' failed even after successful login/cookie set, something is wrong
          console.error('Failed to get user details (me) even after login/cookie setup.');
          // This might indicate that the cookies didn't establish a full session, or login was partial.
          // Attempting a full re-login might be an option here, or re-initialize.
          // For now, let's throw to indicate a problem with session validation post-login.
          await this.scraper.logout(); // Clear potentially bad cookies/session
          await fs.unlink(this.COOKIE_FILE).catch(() => {}); // Delete bad cookie file
          throw new Error('Session validation failed: Could not retrieve user details after login/cookie setup.');
      }
      this.botUserId = me.userId;
      this.botScreenName = me.username as string;
      console.log('Bot initialized as:', me.username);
      return true;
    } catch (error) {
      console.error('Twitter initialization failed:', error);
      // If initialization fails, try to clear cookies to force fresh login next time
      try {
        await fs.unlink(this.COOKIE_FILE);
        console.log('Cleared cookies due to initialization error.');
      } catch (unlinkError: any) {
        if (unlinkError.code !== 'ENOENT') {
            console.error('Error clearing cookies during initialization failure:', unlinkError);
        }
      }
      return false;
    }
  }

  private async updateLastProcessedTimestamp(timestamp: number) {
    try {
      if (!isNaN(timestamp) && timestamp > 0) {
        await fs.writeFile(this.TIMESTAMP_FILE, timestamp.toString());
        this.lastProcessedTimestamp = timestamp;
        console.log('Updated timestamp:', timestamp);
      } else {
        console.error('Attempted to write invalid timestamp:', timestamp);
      }
    } catch (error) {
      console.error('Error saving timestamp:', error);
    }
  }

  async listenToMentions() {
    if (this.isListening) return;
    this.isListening = true;

    const checkMentions = async () => {
      try {
        if (!this.isListening) return;

        console.log('Searching for new mentions...', this.botScreenName);
        
        const query = `(@testfinz29275) -filter:retweets`;
        const mentions = await Mentions.find({});
        
        try {
          const notifications = await this.searchTweetsWithTimeout(query, 50);
          const newMentions = notifications.filter(tweet => !mentions.some(m => m.tweetId === tweet.id));
          await Mentions.insertMany(newMentions.map(tweet => ({ tweetId: tweet.id })));
          // const enabledCreators = await Creator.find({ agentEnabled: true });

          // const enabledCreatorIds = new Set(enabledCreators.map(c => c.twitterId));

          for await (const tweet of notifications) {
            // === Prevent bot from processing its own tweets as new mentions ===
            if (tweet.userId === this.botUserId || 
                this.credentials.some(cred => tweet.username?.toLowerCase() === cred.username.toLowerCase())) {
                console.log(`Skipping own tweet ${tweet.id} from user ${tweet.username} as a potential new mention.`);
                continue; 
            }
            // === End of bot self-tweet check ===

            // === Check if this tweet is a reply by a user to one of our active suggestion flows ===
            let isReplyToOurSuggestion = false;
            if (tweet.inReplyToStatusId) {
              for (const [originalMentionId, state] of this.tweetStates.entries()) {
                if (state.stage === 'name' && !state.isCompleted && state.userId === tweet.userId) {
                  // Check if tweet.inReplyToStatusId is one of the bot's suggestion tweets for this state
                  // This is a simplified check; a more robust way would be to store the ID of the bot's suggestion tweet in the state.
                  // For now, we assume if the user (state.userId) replied to *something* while a state is active for them,
                  // and that reply's parent is the originalMentionId (or a tweet from bot in that thread)
                  // it *could* be for this flow.
                  // The more specific check happens in the continueTokenCreation loop later.

                  // Let's try to fetch the parent of this tweet (tweet.inReplyToStatusId)
                  // If that parent tweet was made by the bot AND is a reply to the originalMentionId, then this `tweet` is a reply to our suggestion.
                  try {
                    const parentOfCurrentUserReply = await this.scraper.getTweet(tweet.inReplyToStatusId);
                    if (parentOfCurrentUserReply && parentOfCurrentUserReply.userId === this.botUserId && parentOfCurrentUserReply.inReplyToStatusId === originalMentionId) {
                       console.log(`Tweet ${tweet.id} by ${tweet.username} is a reply to bot's suggestion for original mention ${originalMentionId}. Will be handled by continueTokenCreation.`);
                       isReplyToOurSuggestion = true;
                       // Mark as processed here to prevent it from being picked up by handleMention as a new, independent mention
                       // Also update timestamp if it's newer
                       const tweetTimestampForThisReply = (tweet.timestamp as number) * 1000;
                       if (!this.processedMentions.has(tweet.id as string)) {
                         this.processedMentions.add(tweet.id as string);
                         await this.updateLastProcessedTimestamp(Math.max(this.lastProcessedTimestamp, tweetTimestampForThisReply));
                       }
                       break; // Found the state this reply belongs to
                    }
                  } catch (err) {
                    console.warn(`Could not fetch parent tweet ${tweet.inReplyToStatusId} to check if it's a bot suggestion reply:`, err);
                  }
                }
              }
            }

            if (isReplyToOurSuggestion) {
              // This tweet is a reply to one of our suggestions and has been marked.
              // The main reply processing loop (further down) will pick it up if it matches a state.
              // Skip calling handleMention for it.
              console.log(`Skipping handleMention for ${tweet.id} as it's identified as a direct reply to an active suggestion flow.`);
              continue;
            }
            // === End of check for reply to our suggestion ===

            const tweetTimestamp = (tweet.timestamp as number) * 1000;

            console.log('Tweet timestamp:', tweetTimestamp);
            console.log('Last processed timestamp:', this.lastProcessedTimestamp);
            if (tweetTimestamp < this.lastProcessedTimestamp) {
              console.log('Skipping older tweet:', tweet.id);
              continue;
            }

            if (!this.processedMentions.has(tweet.id as string)) {
              console.log('Starting new conversation with tweet:', tweet.id, 'from user:', tweet.username);
              await this.handleMention({
                id: tweet.id as string,
                userId: tweet.userId as string,
                text: tweet.text as string,
                parentTweetId: tweet.inReplyToStatusId,
                timestamp: (tweet.timestamp as number * 1000).toString(),
                tweetUsername: tweet.username,
                tweetName: tweet.name,
                conversationId: tweet.conversationId
              });
              this.processedMentions.add(tweet.id as string);
              await this.updateLastProcessedTimestamp(
                Math.max(this.lastProcessedTimestamp, tweetTimestamp)
              );
            }
          }

          for (const [originalMentionId, state] of this.tweetStates.entries()) {
            if (!state.isCompleted && state.stage === 'name') {
              console.log('Checking replies for conversation initiated by mention:', originalMentionId);
              // Use the original mention's conversation ID if available, otherwise fall back to the original mention ID itself.
              const conversationSearchKey = state.originalMentionConversationId || originalMentionId;
              console.log(`Using conversation search key: ${conversationSearchKey} (originalMentionId: ${originalMentionId}, originalMentionConversationId: ${state.originalMentionConversationId})`);
              const repliesInConversation = await this.searchTweetsWithTimeout(`conversation_id:${conversationSearchKey}`, 50);
              
              for await (const reply of repliesInConversation) {
                if (this.credentials.some(cred => reply.username?.toLowerCase() === cred.username.toLowerCase())) continue;

                if (reply.userId === state.userId &&
                    !state.processedReplies.has(reply.id as string) &&
                    reply.inReplyToStatusId) {
                    
                    const botsSuggestionTweetCandidate = await this.scraper.getTweet(reply.inReplyToStatusId);
                    
                    if (botsSuggestionTweetCandidate &&
                        botsSuggestionTweetCandidate.userId === this.botUserId && 
                        botsSuggestionTweetCandidate.inReplyToStatusId === originalMentionId) {
                        
                        console.log(`Processing user reply ${reply.id} to bot's suggestion for original mention ${originalMentionId}`);
                        
                        const userReplyTweet: Tweet = {
                            id: reply.id as string,
                            userId: reply.userId as string,
                            text: reply.text as string,
                            parentTweetId: reply.inReplyToStatusId,
                            timestamp: reply.timestamp ? (reply.timestamp * 1000).toString() : undefined,
                            tweetUsername: reply.username,
                            tweetName: reply.name,
                            conversationId: reply.conversationId,
                            replies: reply.replies,
                            retweets: reply.retweets,
                            likes: reply.likes,
                        };

                        await this.continueTokenCreation(userReplyTweet, state, originalMentionId);
                        state.processedReplies.add(reply.id as string);

                        if (state.isCompleted) {
                            break;
                        }
                    }
                }
              }
            }
          }

          const backoffTime = Math.min(
            this.MIN_BACKOFF * (1 + Math.random()), 
            this.MAX_BACKOFF
          );
          console.log(`Next check in ${backoffTime/1000} seconds`);
          setTimeout(checkMentions, backoffTime);

        } catch (error) {
          console.error('Error in search tweets:', error);
          const success = await this.reinitialize();
          if (!success) {
            console.log('All credentials attempted, waiting before retry...');
            throw error; 
          }

          console.log('Reinitialization successful, continuing mention checks...');
          setTimeout(checkMentions, this.MIN_BACKOFF);
          return;
        }

      } catch (error) {
        console.log('Error checking mentions:', error);
        const errorBackoffTime = Math.min(
          this.ERROR_MIN_BACKOFF * (1 + Math.random()), 
          this.ERROR_MAX_BACKOFF
        );
        console.log(`Error occurred, next check in ${errorBackoffTime/1000} seconds`);
        setTimeout(checkMentions, errorBackoffTime);
      }
    };

    console.log('🎧 Started listening for mentions...');
    await checkMentions();
  }

  private async handleMention(tweet: Tweet) {
    try {
      const existingTimeout = this.autoCreateTimeouts.get(tweet.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.autoCreateTimeouts.delete(tweet.id);
      }

      const directTokenizationPattern = /@testfinz29275\s+(.+?)\s+\(([^)]+)\)/i;
      const mentionText = tweet.text;
      const match = mentionText.match(directTokenizationPattern);

      if (match) {
        const tokenName = match[1].trim();
        const tokenSymbol = match[2].trim();
        console.log(`Direct tokenization attempt: Name='${tokenName}', Symbol='${tokenSymbol}' from mention tweet ${tweet.id}`);

        let targetTweetToTokenizeId: string;
        if (tweet.parentTweetId) {
          targetTweetToTokenizeId = tweet.parentTweetId;
          console.log(`Mention is a reply. Tokenizing parent tweet: ${targetTweetToTokenizeId}`);
        } else {
          targetTweetToTokenizeId = tweet.id;
          console.log(`Mention is a direct tweet. Tokenizing this tweet: ${targetTweetToTokenizeId}`);
        }

        // === Check if already tokenized (Direct Path) ===
        const existingTokenDirect = await Token.findOne({ tweetId: targetTweetToTokenizeId });
        if (existingTokenDirect) {
          console.log(`Tweet ${targetTweetToTokenizeId} already tokenized as ${existingTokenDirect.name} (${existingTokenDirect.symbol}). Mint: ${existingTokenDirect.mintAddress}`);
          // await this.replyToTweet(tweet.id, 
          //   `This tweet (ID: ${targetTweetToTokenizeId}) has already been tokenized as ${existingTokenDirect.name} (${existingTokenDirect.symbol}).\n\n` +
          //   `CA: ${existingTokenDirect.mintAddress}\n\n` +
          //   `Trade ${existingTokenDirect.symbol} here:\n` +
          //   `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${existingTokenDirect.mintAddress}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
          //   `https://finz.fun/coin?tokenMint=${existingTokenDirect.mintAddress}&action=BUY`);
          return;
        }
        // === End Check ===

        const tweetToTokenizeDetails = await this.scraper.getTweet(targetTweetToTokenizeId);
        if (!tweetToTokenizeDetails) {
          await this.replyToTweet(tweet.id, `Sorry, I couldn't find the tweet you want to tokenize (ID: ${targetTweetToTokenizeId}).`);
          console.error(`Could not fetch tweet to tokenize: ${targetTweetToTokenizeId}`);
          return;
        }

        const profile = await this.scraper.getProfile(tweetToTokenizeDetails.username as string);
        const avatarUrl = profile?.avatar;

        console.log('Creating token directly for:', tokenName, tokenSymbol);
        const result = await this.tokenService.createToken({
          name: tweetToTokenizeDetails.name as string,
          tweetId: tweetToTokenizeDetails.id as string,
          tokenName: tokenName,
          symbol: tokenSymbol,
          username: tweetToTokenizeDetails.username as string,
          content: tweetToTokenizeDetails.text as string,
          timestamp: tweetToTokenizeDetails.timestamp?.toString() as string,
          replies: Number(tweetToTokenizeDetails.replies) || 0,       // Ensure number
          retweets: Number(tweetToTokenizeDetails.retweets) || 0,     // Ensure number
          likes: Number(tweetToTokenizeDetails.likes) || 0,           // Ensure number
          creator: tweetToTokenizeDetails.userId as string,
          tweetImage: tweetToTokenizeDetails.photos?.[0]?.url as string,
          avatarUrl: avatarUrl as string
        });

        if (result.success) {
          const successMessageBase =
            `${tokenName} (${tokenSymbol}) has been created for the tweet!\n\n` +
            `CA: ${result.tokenMint}\n\n` +
            `Trade ${tokenSymbol} here:\n` +
            `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${result.tokenMint}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
            `https://finz.fun/coin?tokenMint=${result.tokenMint}&action=BUY`;
          
          await this.replyToTweet(tweet.id, successMessageBase);

          if (targetTweetToTokenizeId !== tweet.id) {
            await this.replyToTweet(targetTweetToTokenizeId,
              `Your tweet has been tokenized as ${tokenName} (${tokenSymbol}) by @${tweet.tweetUsername}!\n\n` +
              `CA: ${result.tokenMint}\n\n` +
              `Trade ${tokenSymbol} here:\n` +
              `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${result.tokenMint}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
              `https://finz.fun/coin?tokenMint=${result.tokenMint}&action=BUY`
            );
          }
        } else {
          await this.replyToTweet(tweet.id, `Sorry, there was an error creating your token ${tokenName} (${tokenSymbol}). Please try again.`);
        }
        return;

      } else {
        console.log(`Starting normal suggestion flow for mention tweet ${tweet.id}`);
        
        let tweetForAISuggestionsId: string;
        let tweetForAISuggestionsText: string;
        let authorOfTweetForAISuggestions: string | undefined;

        if (tweet.parentTweetId) {
          tweetForAISuggestionsId = tweet.parentTweetId;
          const parentTweetDetails = await this.scraper.getTweet(tweetForAISuggestionsId);
          if (!parentTweetDetails) {
            await this.replyToTweet(tweet.id, "Sorry, I couldn't fetch the tweet you replied to for suggestions.");
            console.error(`Could not fetch parent tweet for AI suggestions: ${tweetForAISuggestionsId}`);
            return;
          }
          tweetForAISuggestionsText = parentTweetDetails.text as string;
          authorOfTweetForAISuggestions = parentTweetDetails.username as string;
        } else {
          tweetForAISuggestionsId = tweet.id;
          tweetForAISuggestionsText = tweet.text;
          authorOfTweetForAISuggestions = tweet.tweetUsername;
        }
        
        // === Check if already tokenized (Suggestion Path) ===
        const existingTokenSuggestions = await Token.findOne({ tweetId: tweetForAISuggestionsId });
        if (existingTokenSuggestions) {
          console.log(`Tweet ${tweetForAISuggestionsId} (target for suggestions) already tokenized as ${existingTokenSuggestions.name} (${existingTokenSuggestions.symbol}). Mint: ${existingTokenSuggestions.mintAddress}`);
          // await this.replyToTweet(tweet.id, // Reply to the mention tweet that tried to start the flow
          //   `The tweet you're referring to (ID: ${tweetForAISuggestionsId}) has already been tokenized as ${existingTokenSuggestions.name} (${existingTokenSuggestions.symbol}).\n\n` +
          //   `CA: ${existingTokenSuggestions.mintAddress}\n\n` +
          //   `Trade ${existingTokenSuggestions.symbol} here:\n` +
          //   `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${existingTokenSuggestions.mintAddress}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
          //   `https://finz.fun/coin?tokenMint=${existingTokenSuggestions.mintAddress}&action=BUY`);
          return; // Do not proceed with suggestion flow if target is already tokenized
        }
        // === End Check ===

        const suggestions = await this.aiService.generateSuggestions(tweetForAISuggestionsText);
        console.log('Suggestions for tweet by', authorOfTweetForAISuggestions, ':', suggestions);
        
        const contextIntro = `Based on the tweet by @${authorOfTweetForAISuggestions || 'the user'}, here are some token suggestions:`;

        await this.replyToTweet(tweet.id,
          `${contextIntro}\n\n` +
          suggestions.map((s, i) => `\n${i + 1}. ${s.name} (${s.ticker})\n`).join('\n') +
          `Reply with a number, OR create a custom one in the format:\n\n` +
          `Name (TICKER)`
        );
        
        this.tweetStates.set(tweet.id, {
          stage: 'name',
          userId: tweet.userId,
          parentTweetId: tweetForAISuggestionsId,
          suggestions,
          isInitialReplyDone: true,
          isCompleted: false,
          createdAt: Date.now(),
          originalMentionId: tweet.id,
          originalMentionConversationId: tweet.conversationId,
          processedReplies: new Set<string>()
        });

        const timeout = setTimeout(async () => {
          const state = this.tweetStates.get(tweet.id);
          if (state && !state.isCompleted && state.stage === 'name') {
            try {
              // === Check if already tokenized (Auto-Creation Path) ===
              const existingTokenAuto = await Token.findOne({ tweetId: state.parentTweetId });
              if (existingTokenAuto) {
                console.log(`Tweet ${state.parentTweetId} (target for auto-creation) already tokenized as ${existingTokenAuto.name} (${existingTokenAuto.symbol}). Mint: ${existingTokenAuto.mintAddress}`);
                // Don't reply here as it's an auto-process, just prevent re-tokenization.
                // Clear timeout and state if necessary.
                this.autoCreateTimeouts.delete(tweet.id); // tweet.id is originalMentionId
                // state.isCompleted = true; // Mark as completed to prevent further processing, though it will be deleted.
                this.tweetStates.delete(tweet.id); // Delete the state
                return;
              }
              // === End Check ===

              console.log('Auto-creating token for mention tweet:', tweet.id, 'based on target tweet:', state.parentTweetId);
              const autoChoice = state.suggestions[0];

              const originalTweetToTokenize = await this.scraper.getTweet(state.parentTweetId);
              if (!originalTweetToTokenize) {
                throw new Error(`Could not fetch original tweet to tokenize for auto-creation: ${state.parentTweetId}`);
              }

              const profileAuto = await this.scraper.getProfile(originalTweetToTokenize.username as string); 
              const avatarUrlAuto = profileAuto?.avatar;

              console.log('Tweet to be tokenized details (auto):', originalTweetToTokenize);
              
              try {
                const result = await this.tokenService.createToken({
                  name: originalTweetToTokenize.name as string,
                  tweetId: originalTweetToTokenize.id as string,
                  tokenName: autoChoice.name.replace(/^\d+\.\s*/, ''),
                  symbol: autoChoice.ticker,
                  username: originalTweetToTokenize.username as string,
                  content: originalTweetToTokenize.text as string,
                  timestamp: originalTweetToTokenize.timestamp?.toString() as string,
                  replies: Number(originalTweetToTokenize.replies) || 0,      // Ensure number
                  retweets: Number(originalTweetToTokenize.retweets) || 0,    // Ensure number
                  likes: Number(originalTweetToTokenize.likes) || 0,          // Ensure number
                  creator: originalTweetToTokenize.userId as string,
                  tweetImage: originalTweetToTokenize.photos?.[0]?.url as string,
                  avatarUrl: avatarUrlAuto as string // Use renamed var
                });

                console.log('Token creation result:', result);

                if (result.success) {
                  const autoCreateMessageBase =
                    `${autoChoice.name} (${autoChoice.ticker}) has been ⏰ Auto-created!\n\n` +
                    `CA: ${result.tokenMint}\n\n` +
                    `Trade ${autoChoice.ticker} here:\n` +
                    `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${result.tokenMint}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
                    `https://finz.fun/coin?tokenMint=${result.tokenMint}&action=BUY`;
                  
                  await this.replyToTweet(tweet.id, autoCreateMessageBase);
                  
                  if (state.parentTweetId !== tweet.id) {
                    await this.replyToTweet(state.parentTweetId,
                      `Your tweet has been tokenized as ${autoChoice.name} (${autoChoice.ticker}) (auto-created based on a mention by @${tweet.tweetUsername})!\n\n` +
                      `CA: ${result.tokenMint}\n\n` +
                      `Trade ${autoChoice.ticker} here:\n` +
                      `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${result.tokenMint}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
                      `https://finz.fun/coin?tokenMint=${result.tokenMint}&action=BUY`
                    );
                  }
                  
                  state.isCompleted = true;
                  this.tweetStates.delete(tweet.id);
                }
              } catch (error) {
                console.error('Auto-creation error:', error);
                await this.replyToTweet(tweet.id,
                  `Sorry, there was an error auto-creating your token. Please try selecting manually.`);
              } finally {
                this.autoCreateTimeouts.delete(tweet.id);
              }
            } catch (error) {
              console.error('Error in auto-creation timeout:', error);
              await this.replyToTweet(tweet.id,
                `Sorry, there was an error auto-creating your token. Please try selecting manually.`);
            }
          }
        }, 15 * 60 * 1000);
        this.autoCreateTimeouts.set(tweet.id, timeout);
      }
    } catch (error) {
      console.error('Error in handleMention:', error);
      await this.replyToTweet(tweet.id, 
          `Sorry, an unexpected error occurred while processing your request. Please try again later.`);
    }
  }

  private async continueTokenCreation(userReplyTweet: Tweet, state: TokenCreationState, originalMentionIdKey: string) {
    console.log('Processing user reply:', userReplyTweet.id, 'Stage:', state.stage, 'Text:', userReplyTweet.text);
    console.log('Current state for this conversation (initiated by mention', originalMentionIdKey, '):', state);
    
    const text = userReplyTweet.text.replace(/@\w+/g, '').trim();

    try {
        if (state.isCompleted) {
            console.log(`Attempt to continue token creation for ${originalMentionIdKey}, but state is already completed.`);
            await this.replyToTweet(userReplyTweet.id, "It looks like this token creation process was already completed (perhaps automatically). Please check.");
            return; 
        }

        // === Check if already tokenized (Continue Creation Path) ===
        // state.parentTweetId is the ID of the tweet to be tokenized
        const existingTokenContinue = await Token.findOne({ tweetId: state.parentTweetId });
        if (existingTokenContinue) {
            console.log(`Tweet ${state.parentTweetId} (target for continue token creation) already tokenized as ${existingTokenContinue.name} (${existingTokenContinue.symbol}). Mint: ${existingTokenContinue.mintAddress}`);
            await this.replyToTweet(userReplyTweet.id, // Reply to the user trying to continue
                `The tweet (ID: ${state.parentTweetId}) has already been tokenized as ${existingTokenContinue.name} (${existingTokenContinue.symbol}).\n\n` +
                `CA: ${existingTokenContinue.mintAddress}\n\n` +
                `Trade ${existingTokenContinue.symbol} here:\n` +
                `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${existingTokenContinue.mintAddress}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
                `https://finz.fun/coin?tokenMint=${existingTokenContinue.mintAddress}&action=BUY`);
            
            // Clean up state as this flow is now redundant
            state.isCompleted = true;
            this.tweetStates.delete(originalMentionIdKey);
            const timeout = this.autoCreateTimeouts.get(originalMentionIdKey);
            if (timeout) {
                clearTimeout(timeout);
                this.autoCreateTimeouts.delete(originalMentionIdKey);
            }
            return;
        }
        // === End Check ===

        switch (state.stage) {
            case 'name':
                const choice = Validation.parseUserChoice(text, state.suggestions);
                console.log('User choice for token creation:', choice.name, choice.ticker);
                
                const tweetToTokenizeDetailsContinue = await this.scraper.getTweet(state.parentTweetId); 
                if (!tweetToTokenizeDetailsContinue) {
                    console.error(`Could not fetch tweet to tokenize ${state.parentTweetId} during continueTokenCreation.`);
                    await this.replyToTweet(userReplyTweet.id, "Sorry, I couldn't find the original tweet to tokenize. Please try starting the process again.");
                    return;
                }

                const profileContinue = await this.scraper.getProfile(tweetToTokenizeDetailsContinue.username as string); 
                const avatarUrlContinue = profileContinue?.avatar;
                console.log('Tweet to be tokenized details (continue):', tweetToTokenizeDetailsContinue);

                try {
                    const result = await this.tokenService.createToken({
                        name: tweetToTokenizeDetailsContinue.name as string,
                        tweetId: tweetToTokenizeDetailsContinue.id as string,
                        tokenName: choice.name.replace(/^\d+\.\s*/, ''),
                        symbol: choice.ticker,
                        username: tweetToTokenizeDetailsContinue.username as string,
                        content: tweetToTokenizeDetailsContinue.text as string,
                        timestamp: tweetToTokenizeDetailsContinue.timestamp?.toString() as string,
                        replies: Number(tweetToTokenizeDetailsContinue.replies) || 0,       // Ensure number
                        retweets: Number(tweetToTokenizeDetailsContinue.retweets) || 0,     // Ensure number
                        likes: Number(tweetToTokenizeDetailsContinue.likes) || 0,           // Ensure number
                        creator: tweetToTokenizeDetailsContinue.userId as string,
                        tweetImage: tweetToTokenizeDetailsContinue.photos?.[0]?.url as string,
                        avatarUrl: avatarUrlContinue as string
                    });

                    console.log('Token creation result:', result);

                    if (result.success) {
                        const timeout = this.autoCreateTimeouts.get(originalMentionIdKey);
                        if (timeout) {
                          clearTimeout(timeout);
                          this.autoCreateTimeouts.delete(originalMentionIdKey);
                        }
                        
                        const successMessageBase =
                            `${choice.name} (${choice.ticker}) has been created!\n\n` +
                            `CA: ${result.tokenMint}\n\n` +
                            `Trade ${choice.ticker} here:\n` +
                            `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${result.tokenMint}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
                            `https://finz.fun/coin?tokenMint=${result.tokenMint}&action=BUY`;
                        
                        await this.replyToTweet(userReplyTweet.id, successMessageBase);
                        
                        if (state.parentTweetId !== userReplyTweet.parentTweetId && state.parentTweetId !== userReplyTweet.id) {
                             await this.replyToTweet(state.parentTweetId, 
                                `This tweet has been tokenized as ${choice.name} (${choice.ticker}) through a conversation with @${userReplyTweet.tweetUsername}!\n\n`+
                                `CA: ${result.tokenMint}\n\n` +
                                `Trade ${choice.ticker} here:\n` +
                                `https://dial.to/?action=solana-action:https://api.finz.fun/blinks/${result.tokenMint}&cluster=${SOLANA_ENVIRONMENT}\n\n` +
                                `https://finz.fun/coin?tokenMint=${result.tokenMint}&action=BUY`);
                        }
                        
                        state.isCompleted = true;
                        this.tweetStates.delete(originalMentionIdKey);
                    } else {
                        await this.replyToTweet(userReplyTweet.id, `Sorry, token creation for ${choice.name} (${choice.ticker}) failed. Error: ${result.error || 'Unknown error'}`);
                    }
                } catch (tokenCreationError: any) { 
                    console.error('Error during tokenService.createToken call:', tokenCreationError);
                    const errorMessage = tokenCreationError.message || `an unexpected error occurred creating ${choice.name} (${choice.ticker})`;
                    await this.replyToTweet(userReplyTweet.id, `Sorry, there was an error creating your token: ${errorMessage}. Please try again.`);
                }
                break;
            // case 'confirm': ... (if there were other stages)
        }
    } catch (error) {
        console.error('Error in continueTokenCreation (outer try-catch for switch statement):', error, 'State:', state);
        if (error instanceof ValidationError) {
            await this.replyToTweet(userReplyTweet.id, error.message);
        } else {
            console.error('Error in token creation:', error);
            await this.replyToTweet(userReplyTweet.id,
                `Sorry, there was an error creating your token. Please try again.`);
        }
    }
}

  async replyToTweet(tweetId: string, message: string) {
    try {
      await this.scraper.sendTweet(message, tweetId);
      console.log('Reply sent successfully to tweet:', tweetId);
    } catch (error) {
      console.error('Error replying to tweet:', error);
      throw error;
    }
  }

  stopListening() {
    this.isListening = false;
    // Clear all pending auto-create timeouts
    for (const [tweetId, timeout] of this.autoCreateTimeouts.entries()) {
      clearTimeout(timeout);
      this.autoCreateTimeouts.delete(tweetId);
    }
    console.log('Stopped listening for mentions');
  }

  private async saveCookies() {
    try {
      const cookiesToSave = await this.scraper.getCookies();
      console.log('Format from getCookies() before stringify:', JSON.stringify(cookiesToSave, null, 2)); // Log the structure
      await fs.writeFile(this.COOKIE_FILE, JSON.stringify(cookiesToSave, null, 2));
      console.log('Cookies saved successfully to:', this.COOKIE_FILE);
    } catch (error: any) {
      console.error('Error saving cookies:', error);
    }
  }

  private async loadAndSetCookies(): Promise<boolean> {
    try {
      const cookiesString = await fs.readFile(this.COOKIE_FILE, 'utf-8');
      const loadedPlainObjects = JSON.parse(cookiesString); 
      // console.log('Loaded plain objects:', loadedPlainObjects);

      if (loadedPlainObjects && Array.isArray(loadedPlainObjects) && loadedPlainObjects.length > 0) {
        console.log(`Attempting to reconstruct and set ${loadedPlainObjects.length} cookies.`);
        const cookiesToSet: Cookie[] = []; // Initialize an array to hold reconstructed cookies
        
        for (const plainCookieObj of loadedPlainObjects) {
          const cookieProperties: any = {
            key: plainCookieObj.key,
            value: plainCookieObj.value,
            domain: plainCookieObj.domain,
            path: plainCookieObj.path,
            secure: plainCookieObj.secure === undefined ? false : plainCookieObj.secure, // default to false if undefined
            httpOnly: plainCookieObj.httpOnly === undefined ? false : plainCookieObj.httpOnly, // default to false if undefined
          };

          if (plainCookieObj.expires && plainCookieObj.expires !== 'Infinity') { // tough-cookie uses 'Infinity' for session cookies if expires is not set
            cookieProperties.expires = new Date(plainCookieObj.expires);
          }
          // sameSite is a bit tricky with tough-cookie's Cookie constructor, often it's better to let it default or be set by the server string if possible
          // If 'sameSite' is crucial and causing issues, it might need to be part of the cookie string itself if `setCookie` takes a string.
          // For now, we'll rely on the main properties.
          // Creation and lastAccessed are usually managed by the cookie jar itself upon setting.

          // Filter out any explicitly undefined values that tough-cookie might not like
          // Object.keys(cookieProperties).forEach(k => cookieProperties[k] === undefined && delete cookieProperties[k]);
          // The defaults for secure and httpOnly handle undefined already.

          const cookie = new Cookie(cookieProperties);
          cookiesToSet.push(cookie); // Add the reconstructed cookie to the array
        }
        
        if (cookiesToSet.length > 0) {
          await this.scraper.setCookies(cookiesToSet); // Call setCookies with the array of cookies
          console.log('All cookies from file reconstructed and processed for setting.');
        }
        
        console.log('Cookies loaded and set successfully from:', this.COOKIE_FILE);
        const isLoggedInWithCookies = await this.scraper.isLoggedIn();
        if (isLoggedInWithCookies) {
          console.log('Session is active with loaded cookies.');
          return true;
        }
        console.log('Session is not active with loaded cookies. Proceeding to login.');
        return false;
      }
    } catch (error: any) { 
      if (error.code !== 'ENOENT') {
        console.error('Error loading or setting cookies:', error);
      } else {
        console.log('Cookie file not found. Proceeding to login.');
      }
    }
    return false;
  }
}