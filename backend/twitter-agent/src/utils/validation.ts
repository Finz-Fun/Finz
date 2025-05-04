import { TokenSuggestion } from '../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const Validation = {
  // Validate token name
  validateTokenName(name: string): boolean {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Token name is required');
    }

    if (name.length < 3 || name.length > 32) {
      throw new ValidationError('Token name must be between 3 and 32 characters');
    }

    // Allow letters, numbers, and spaces
    const validNameRegex = /^[A-Za-z0-9\s]+$/;
    if (!validNameRegex.test(name)) {
      throw new ValidationError('Token name can only contain letters, numbers, and spaces');
    }

    return true;
  },

  // Validate token ticker
  validateTokenTicker(ticker: string): boolean {
    if (!ticker || typeof ticker !== 'string') {
      throw new ValidationError('Token ticker is required');
    }

    // Convert to uppercase for consistency
    ticker = ticker.toUpperCase();

    if (ticker.length < 3 || ticker.length > 15) {
      throw new ValidationError('Token ticker must be 3-15 characters');
    }

    // Only allow capital letters
    const validTickerRegex = /^[A-Z]{3,15}$/;
    if (!validTickerRegex.test(ticker)) {
      throw new ValidationError('Token ticker can only contain capital letters');
    }

    // Check for reserved tickers
    const reservedTickers = ['SOL', 'BTC', 'ETH', 'USD', 'USDT', 'USDC'];
    if (reservedTickers.includes(ticker)) {
      throw new ValidationError('This ticker is reserved and cannot be used');
    }

    return true;
  },

  // Parse and validate user's choice from suggestions
  parseUserChoice(response: string, suggestions: TokenSuggestion[]): TokenSuggestion {
    // Check if user selected by number (1-4)
    const numberChoice = parseInt(response);
    if (!isNaN(numberChoice) && numberChoice >= 1 && numberChoice <= suggestions.length) {
      return suggestions[numberChoice - 1];
    }

    // Updated regex to allow 3-8 character tickers
    const customFormat = /^([A-Za-z0-9\s]+)\s*\(([A-Z]{3,15})\)$/;
    const match = response.match(customFormat);
    // console.log("came here")
    // console.log(response)
    // console.log("match",match)
    if (match) {
      // console.log("match happened")
      const [_, name, ticker] = match;
      
      // Validate both parts
      if (this.validateTokenName(name) && this.validateTokenTicker(ticker)) {
        return {
          name: name.trim(),
          ticker: ticker.trim(),
        };
      }
    }

    throw new ValidationError(
      'Invalid response. Please either:\n' +
      '1. Choose a number from the suggestions (1-4)\n' +
      '2. Provide a custom format: Name (TICKER)'
    );
  },

  // Validate user confirmation
  validateConfirmation(response: string): boolean {
    const normalized = response.trim().toUpperCase();
    if (['YES', 'Y'].includes(normalized)) return true;
    if (['NO', 'N'].includes(normalized)) return false;
    
    throw new ValidationError(
      'Please respond with "YES" to confirm or "NO" to cancel'
    );
  },

  // Validate tweet content for token creation
  validateTweetContent(text: string): boolean {
    if (!text || text.length < 10) {
      throw new ValidationError('Tweet content is too short for token creation');
    }

    if (text.length > 280) {
      throw new ValidationError('Tweet content exceeds maximum length');
    }

    // Check for spam or inappropriate content
    const spamPatterns = [
      /\b(spam|scam|fake)\b/i,
      /\b(free|airdrop|giveaway)\b/i
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(text)) {
        throw new ValidationError('Tweet content contains prohibited terms');
      }
    }

    return true;
  },

  // Helper to sanitize input
  sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/[^\w\s()-]/g, '') // Remove special characters except ()
      .replace(/\s+/g, ' ');      // Normalize spaces
  }
};

// Usage example in your bot:
/*
try {
  const userInput = Validation.sanitizeInput(message.text);
  const choice = Validation.parseUserChoice(userInput, suggestions);
  if (Validation.validateTokenName(choice.name) && 
      Validation.validateTokenTicker(choice.ticker)) {
    // Proceed with token creation
  }
} catch (error) {
  if (error instanceof ValidationError) {
    await twitter.sendDM(userId, error.message);
  }
}
*/
