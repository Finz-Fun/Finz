export interface TokenSuggestion {
    name: string;
    ticker: string;
  }
  
  export interface TokenCreationResult {
    tokenMint: string;
    success: boolean;
    error?: string;
  }
  
  export interface TwitterConversation {
    userId: string;
    stage: 'suggesting' | 'confirming' | 'creating';
    suggestions?: TokenSuggestion[];
    selectedToken?: TokenSuggestion;
    tweetId: string;
  }

export interface Tweet {
    id: string;
    userId: string;
    text: string;
}

export interface TokenCreationState {
    stage: 'name' | 'confirm';
    name?: string;
    symbol?: string;
    userId: string;
    parentTweetId: string;
    suggestions: { name: string; ticker: string; description: string }[];
    isInitialReplyDone: boolean;
    isCompleted: boolean;
}