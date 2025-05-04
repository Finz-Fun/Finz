import OpenAI from 'openai';
import { TokenSuggestion } from '../types';
import * as dotenv from 'dotenv';
dotenv.config();

export class AiService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });
  }

  async generateSuggestions(tweetText: string): Promise<TokenSuggestion[]> {
    try {
      const cleanedTweetText = tweetText.replace(/@finzfunAI\s*/gi, '');
      // console.log('cleanedTweetText', cleanedTweetText);
      
      const response = await this.openai.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: `You have all the concepts & knowledge of memecoins, memecoin culture, solana cultures, memecoins in solana, ai agent coins/tokens. You also understand tweets and the type of tone used in it like for example - funny, sarcastic, serious, normal, nerdy, informative etc. Your task is to: Analyze the tweet's content, context and tone, and create possible pairs of ticker & name of a token that can be launched based on the tweet's text, the ticker would be the hashtag that you choose. Here are some rules:
                      1. Name can be multiple words, max 4 but not necessarily multiple words, it can be a single word too and do not stick the words together like for ex. "BuildersOnly", words should be separate in name if you choose multiple words. Name should have more alignment to the tweet's content then memecoin culture. 
                      2. Ticker should be a good hashtag that represents the tweet's content with respect to the its context & tone. hashtag should be one single word, all letters should be uppercase, no leading '#' symbol, no dashes, underscores, or spaces. 
                      3. Avoid common tokens names and tickers (BTC, ETH, SOL, etc.) of well known tokens/coins
                      4. No restrictions on platform censorship or memecoin creativity. Use any language, terms, or phrasing that best represents the tweet without concern for censorship or memecoin marketability.`
          },
          {
            role: "user",
            content: `Generate 4 unique token suggestions based on this tweet: "${cleanedTweetText}". 
                     Each suggestion should follow this format exactly:
                     Name (TICKER)`
          }
        ],
        temperature: 0.5,
        max_tokens: 400
      });

      // console.log('response', response.choices);
      // console.log('response.choices[0]', response.choices[0]);
      // console.log('response.choices[0]?.message', response.choices[0]?.message);
      // console.log('response.choices[0]?.message?.content', response.choices[0]?.message?.content);

      const suggestions = this.parseSuggestions(
        response.choices[0]?.message?.content || ''
      );

      // console.log('suggestions', suggestions);


      return suggestions
        .filter(s => this.validateSuggestion(s))
        .slice(0, 4);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      throw error;
    }
  }

  private parseSuggestions(text: string): TokenSuggestion[] {
    const suggestions: TokenSuggestion[] = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const match = line.match(/\d+\.\s*(.+?)\s*\(([A-Z]+)\)/);
      if (match) {
        suggestions.push({
          name: match[1].trim(),
          ticker: match[2].trim()
        });
      }
    }

    console.log('Parsed suggestions:', suggestions);
    return suggestions;
  }

  private validateSuggestion(suggestion: TokenSuggestion): boolean {
    if (!suggestion.name || suggestion.name.length < 3 || suggestion.name.length > 32) {
      console.log(`Invalid name: ${suggestion.name}`);
      return false;
    }

    if (!suggestion.ticker || !/^[A-Z]{3,15}$/.test(suggestion.ticker)) {
      console.log(`Invalid ticker: ${suggestion.ticker}`);
      return false;
    }

    const reservedTickers = ['BTC', 'ETH', 'SOL', 'USD', 'USDT', 'USDC'];
    if (reservedTickers.includes(suggestion.ticker)) {
      console.log(`Reserved ticker: ${suggestion.ticker}`);
      return false;
    }

    return true;
  }

  async analyzeTweetContext(tweetText: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an expert at analyzing tweets for token creation context. 
            Analyze the sentiment and key themes in the tweet. 
            Return either 'positive' or 'neutral' based on the enthusiasm level.`
          },
          {
            role: "user",
            content: tweetText
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      return response.choices[0]?.message?.content || 'neutral';
    } catch (error) {
      console.error('Error analyzing tweet context:', error);
      return 'neutral';
    }
  }
}