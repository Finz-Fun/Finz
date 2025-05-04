export interface Candle {
    t: number;  // timestamp
    o: number;  // open
    h: number;  // high
    l: number;  // low
    c: number;  // close
  }
  
  export interface PriceUpdate {
    m: string;  // mint
    p: number;  // price
    s: number;  // reserveSol
    t: number;  // reserveToken
    ts: number; // timestamp
  }
  
  export interface PoolData {
    price: number;
    reserveSol: number;
    reserveToken: number;
  }