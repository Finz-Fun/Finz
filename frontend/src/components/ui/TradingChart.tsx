import { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";
import { ChartingLibraryWidgetOptions, ResolutionString, widget } from "../../../public/static/charting_library";
import { PublicKey } from '@solana/web3.js';
import { connection } from '../../config';
import { subscribeToPoolUpdates, unsubscribeFromPool } from '../../utils/pool';
import { Candle } from '../../types/trading';

const API_URL = process.env.NEXT_PUBLIC_API_URI || 'http://localhost:3000';

interface Transaction {
  type: 'BUY' | 'SELL';
  timestamp: number;
  solAmount: number;
  walletAddress: string;
  tokenAmount: number;
  signature: string;
}

interface PoolData {
  price: number;
  type: 'BUY' | 'SELL';
  solAmount: number;
  walletAddress: string;
  tokenAmount: number;
  signature: string;
  poolSolBalance: number;
}

const TradingChart = ({ 
  tokenName, 
  tokenMint, 
  displayCurrency = 'USD', 
  setPoolSolBalance,
  setMcap,
  onTransactionUpdate
}: { 
  tokenName?: string,
  tokenMint?: string, 
  displayCurrency: 'USD' | 'SOL',
  setMcap: Dispatch<SetStateAction<string>>,
  setPoolSolBalance: Dispatch<SetStateAction<number>>,
  onTransactionUpdate?: (transaction: Transaction) => void
}) => {

  if(!tokenName || !tokenMint || !displayCurrency) {
    return null;
  }

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tvWidgetRef = useRef<any>(null);
  const realtimeCallbackRef = useRef<any>(null);
  const subscriptionIdRef = useRef<number | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);

  const SOL_PRICE_CACHE_KEY = 'solana_price_cache';
  const CACHE_DURATION = 10 * 60 * 1000;


  const fetchSolPrice = async () => {
    try {
      const cachedData = localStorage.getItem(SOL_PRICE_CACHE_KEY);
      if (cachedData) {
        const { price, timestamp } = JSON.parse(cachedData);
        const isExpired = Date.now() - timestamp > CACHE_DURATION;
        
        if (!isExpired) {
          setSolPrice(price);
          return price;
        }
      }

      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      const newPrice = data.solana.usd;
      
      localStorage.setItem(SOL_PRICE_CACHE_KEY, JSON.stringify({
        price: newPrice,
        timestamp: Date.now()
      }));

      setSolPrice(newPrice);
      return newPrice;
    } catch (error) {
      console.error('Error fetching SOL price:', error);
      const cachedData = localStorage.getItem(SOL_PRICE_CACHE_KEY);
      return cachedData ? JSON.parse(cachedData).price : 1;
    }
  };

  useEffect(() => {
    const updateSolPrice = async () => {
      await fetchSolPrice();
    };

    updateSolPrice();
    const interval = setInterval(updateSolPrice, 300000);
    
    return () => clearInterval(interval);
  }, []);

  const formatCandleData = (candle: any) => {
    const multiplier = displayCurrency === 'USD' ? solPrice : 1;
    return {
      time: candle.time || candle.t * 1000,
      open: Number(candle.open || candle.o) * multiplier,
      high: Number(candle.high || candle.h) * multiplier,
      low: Number(candle.low || candle.l) * multiplier,
      close: Number(candle.close || candle.c) * multiplier,
      volume: candle.volume || 0
    };
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const widgetOptions: ChartingLibraryWidgetOptions = {
    //   custom_themes:{
    //     // The new palette for the light theme
    //     light: {
    //         // Color that overrides blue
    //         "color1": ["#f5ebff", "#ead6fe", "#e0c2fe", "#d5adfe", "#cb99fd", "#c184fd", "#b670fd", "#ac5bfc", "#a147fc", "#9732fc", "#8209fb", "#7708e6", "#6c08d1", "#6207bc", "#5706a7", "#4c0592", "#41057e", "#360469", "#2b0354"],
    //         // Color that overrides grey
    //         "color2": ["#f2edf7", "#e6dcef", "#d9cae7", "#ccb9df", "#bfa7d7", "#b396d0", "#a684c8", "#9972c0", "#8c61b8", "#804fb0", "#662ca0", "#5e2893", "#552585", "#4d2178", "#441d6b", "#3c1a5d", "#331650", "#2b1243", "#220f35"],
    //         // Color that overrides red
    //         "color3": ["#fff0f0", "#ffe1e1", "#ffd3d3", "#ffc4c4", "#ffb5b5", "#ffa6a6", "#ff9797", "#ff8888", "#ff7a7a", "#ff6b6b", "#ff4d4d", "#ea4747", "#d54040", "#bf3a3a", "#aa3333", "#952d2d", "#802727", "#6a2020", "#551a1a", ],
    //         // Color that overrides green
    //         "color4": ["#f2fdf8", "#e5faf0", "#d7f8e9", "#caf5e1", "#bdf3da", "#b0f1d2", "#a2eecb", "#95ecc3", "#88e9bc", "#7be7b4", "#60e2a5", "#58cf97", "#50bc8a", "#48aa7c", "#40976e", "#388460", "#307153", "#285e45", "#204b37"],
    //         // Color that overrides orange
    //         "color5": ["#fef5ea", "#fdecd5", "#fbe2bf", "#fad9aa", "#f9cf95", "#f8c680", "#f6bc6a", "#f5b255", "#f4a940", "#f39f2b", "#f08c00", "#dc8000", "#c87500", "#b46900", "#a05d00", "#8c5200", "#784600", "#643a00", "#502f00", ],
    //         // Color that overrides purple
    //         "color6": ["#feeafe", "#fcd5fc", "#fbbffb", "#f9aaf9", "#f895f8", "#f780f7", "#f56af5", "#f455f4", "#f240f2", "#f12bf1", "#ee00ee", "#da00da", "#c600c6", "#b300b3", "#9f009f", "#8b008b", "#770077", "#630063", "#4f004f"],
    //         // Color that overrides yellow
    //         "color7": ["#fefeea", "#fcfcd5", "#fbfbbf", "#f9f9aa", "#f8f895", "#f7f780", "#f5f56a", "#f4f455", "#f2f240", "#f1f12b", "#eeee00", "#dada00", "#c6c600", "#b3b300", "#9f9f00", "#8b8b00", "#777700", "#636300", "#4f4f00"],
    //         "white": "#f2e6ff",
    //         "black": "#421b50"
    //     },
    //     dark: {
    //         "color1": ["#fbefea", "#f7dfd5", "#f3cfc0", "#efbfaa", "#ebaf95", "#e89f80", "#e48f6b", "#e07f56", "#dc6f41", "#d85f2b", "#d03f01", "#bf3a01", "#ad3501", "#9c2f01", "#8b2a01", "#792501", "#682001", "#571a00", "#451500", ],
    //         "color2": ["#f8eeee", "#f1dede", "#eacdcd", "#e2bcbc", "#dbacac", "#d49b9b", "#cd8a8a", "#c67a7a", "#bf6969", "#b75858", "#a93737", "#9b3232", "#8d2e2e", "#7f2929", "#712525", "#632020", "#551c1c", "#461717", "#381212",],
    //         "color3": ["#fff0f0", "#ffe1e1", "#ffd3d3", "#ffc4c4", "#ffb5b5", "#ffa6a6", "#ff9797", "#ff8888", "#ff7a7a", "#ff6b6b", "#ff4d4d", "#ea4747", "#d54040", "#bf3a3a", "#aa3333", "#952d2d", "#802727", "#6a2020", "#551a1a", ],
    //         "color4": ["#f2fffb", "#e6fff7", "#d9fff2", "#ccffee", "#bfffea", "#b3ffe6", "#a6ffe1", "#99ffdd", "#8cffd9", "#80ffd5", "#66ffcc", "#5eeabb", "#55d5aa", "#4dbf99", "#44aa88", "#3c9577", "#338066", "#2b6a55", "#225544", ],
    //         "color5": ["#fffff0", "#ffffe0", "#feffd1", "#feffc2", "#feffb2", "#feffa3", "#fdff94", "#fdff84", "#fdff75", "#fdff66", "#fcff47", "#e7ea41", "#d2d53b", "#bdbf35", "#a8aa2f", "#939529", "#7e8024", "#696a1e", "#545518", ],
    //         "color6": ["#fff1ff", "#ffe2ff", "#ffd4ff", "#ffc5ff", "#ffb7ff", "#ffa9ff", "#ff9aff", "#ff8cff", "#ff7dff", "#ff6fff", "#ff52ff", "#ea4bea", "#d544d5", "#bf3ebf", "#aa37aa", "#953095", "#802980", "#6a226a", "#551b55", ],
    //         "color7": ["#eff8ff", "#dff1ff", "#cfeaff", "#bee3ff", "#aedcff", "#9ed5ff", "#8eceff", "#7ec7ff", "#6ec0ff", "#5db9ff", "#3dabff", "#389dea", "#338fd5", "#2e80bf", "#2972aa", "#246495", "#1f5680", "#19476a", "#143955", ],
    //         "white": "#ffffff",
    //         "black": "#0F0F0F"
    //     }
    // },
      symbol: tokenName,
      datafeed: {
        onReady: (callback) => {
          callback({
            supported_resolutions: ['1S', '5S', '15S', '30S', '1', '5', '15', '30','1D','5D'] as ResolutionString[],
          });
        },
        searchSymbols: () => {},
        resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
          onSymbolResolvedCallback({
            name: symbolName,
            description: '',
            type: 'crypto',
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: '',
            minmov: 1,
            pricescale: 1000,
            has_intraday: true,
            has_seconds: true,
            has_ticks: true,
            has_empty_bars: false,
            visible_plots_set: 'ohlcv',
            data_status: 'streaming',
            supported_resolutions: ['30S'] as ResolutionString[],
            format: 'price',
            listed_exchange: 'binance',
          });
        },
        getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
          try {
            if (resolution !== '30S') {
              onHistoryCallback([], { noData: true });
              return;
            }

            console.log('Fetching historical data...');

            if (!periodParams.firstDataRequest) {
              onHistoryCallback([], { noData: true });
              return;
            }

            const response = await fetch(`${API_URL}/candles/${tokenMint}`);
            const candlesData = await response.json();
            
            if (!Array.isArray(candlesData)) {
              console.error('Invalid candles data:', candlesData);
              onHistoryCallback([], { noData: true });
              return;
            }

            const bars = candlesData.map(candle => ({
              time: candle.t * 1000,
              open: Number(candle.o) * (displayCurrency === 'USD' ? solPrice : 1),
              high: Number(candle.h) * (displayCurrency === 'USD' ? solPrice : 1),
              low: Number(candle.l) * (displayCurrency === 'USD' ? solPrice : 1),
              close: Number(candle.c) * (displayCurrency === 'USD' ? solPrice : 1),
              volume: 0
            }));

            if (bars.length > 0) {
              lastCandleRef.current = candlesData[candlesData.length - 1];
              const lastClose = Number(candlesData[candlesData.length - 1].c) * (displayCurrency === 'USD' ? solPrice : 1);
              setMcap(lastClose.toFixed(2));
              onHistoryCallback(bars, {
                noData: false,
                nextTime: undefined
              });
            } else {
              onHistoryCallback([], { noData: true });
              setMcap((25*solPrice).toFixed(2));
            }
          } catch (error: any) {
            console.error('Error fetching historical data:', error);
            onErrorCallback(error.message);
          }
        },
        subscribeBars: async (symbolInfo, resolution, onRealtimeCallback, subscribeUID) => {
          console.log('Setting up real-time subscription...');
          realtimeCallbackRef.current = onRealtimeCallback;

          try {
            const mintPubkey = new PublicKey(tokenMint);
            const subscriptionId = await subscribeToPoolUpdates(
              mintPubkey.toString(),
              (poolData: PoolData) => {
                if (displayCurrency === "USD") {
                  setMcap((poolData.price * solPrice).toFixed(2));
                } else {
                  setMcap(poolData.price.toFixed(4));
                }
                setPoolSolBalance(poolData.poolSolBalance);
                const currentTimestamp = Math.floor(Date.now() / 1000);
                const price = Number(poolData.price) * (displayCurrency === 'USD' ? solPrice : 1);

                // Share transaction data if callback exists
                if (onTransactionUpdate) {
                  onTransactionUpdate({
                    type: poolData.type,
                    timestamp: currentTimestamp,
                    solAmount: poolData.solAmount,
                    walletAddress: poolData.walletAddress,
                    tokenAmount: poolData.tokenAmount,
                    signature: poolData.signature
                  });
                }

                if (!lastCandleRef.current || currentTimestamp > lastCandleRef.current.t) {
                  const newCandle: Candle = {
                    t: currentTimestamp,
                    o: price,
                    h: price,
                    l: price,
                    c: price
                  };
                  lastCandleRef.current = newCandle;
                  
                  onRealtimeCallback({
                    time: currentTimestamp * 1000,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: 0
                  });
                } else if (lastCandleRef.current) {
                  const lastCandle = lastCandleRef.current;
                  lastCandle.h = Math.max(lastCandle.h, price);
                  lastCandle.l = Math.min(lastCandle.l, price);
                  lastCandle.c = price;
                  
                  onRealtimeCallback({
                    time: lastCandle.t * 1000,
                    open: lastCandle.o * (displayCurrency === 'USD' ? solPrice : 1),
                    high: lastCandle.h * (displayCurrency === 'USD' ? solPrice : 1),
                    low: lastCandle.l * (displayCurrency === 'USD' ? solPrice : 1),
                    close: lastCandle.c * (displayCurrency === 'USD' ? solPrice : 1),
                    volume: 0
                  });
                }
              }
            );

            subscriptionIdRef.current = subscriptionId;
          } catch (error) {
            console.error('Error in subscribeBars:', error);
          }
        },
        unsubscribeBars: (subscribeUID) => {
          if (subscriptionIdRef.current !== null) {
            unsubscribeFromPool(connection, subscriptionIdRef.current);
            subscriptionIdRef.current = null;
          }
          realtimeCallbackRef.current = null;
        }
      },
      interval: '30S' as ResolutionString,
      container: chartContainerRef.current,
      library_path: '/static/charting_library/',
      locale: 'en',
      disabled_features: [
        'use_localstorage_for_settings',
        'volume_force_overlay',
        'create_volume_indicator_by_default',
        'header_symbol_search',
        'header_compare',
        'symbol_search_hot_key'
      ],
      enabled_features: [
        'hide_resolution_in_legend',
        'seconds_resolution'
      ],
      time_frames: [
        // { text: "30S", resolution: "30S" as ResolutionString, description: "30 Seconds" },
        // { text: "1m", resolution: "1" as ResolutionString, description: "1 Minute" },
        // { text: "5m", resolution: "5" as ResolutionString, description: "5 Minutes" },
        // { text: "15m", resolution: "15" as ResolutionString, description: "15 Minutes"},
        // { text: "30m", resolution: "30" as ResolutionString, description: "30 Minutes"},
        // { text: "1h", resolution: "60" as ResolutionString, description: "1 Hour" },
        // { text: "4h", resolution: "240" as ResolutionString, description: "4 Hours"},
        { text: "1D", resolution: "1D" as ResolutionString, description: "1 Day"},
        { text: "5D", resolution: "5D" as ResolutionString, description: "5 Day"},
      ],
      client_id: 'tradingview.com',
      user_id: 'public_user',
      fullscreen: false,
      autosize: true,
      theme: 'dark',
      overrides: {
        'mainSeriesProperties.style': 1,
        'mainSeriesProperties.visible': true,
        'mainSeriesProperties.showPriceLine': true,
        'mainSeriesProperties.priceLineWidth': 1,
        'mainSeriesProperties.priceLineColor': '#3179f5',
        'mainSeriesProperties.baseLineColor': '#5d606b',
        'mainSeriesProperties.showPrevClosePriceLine': false,
        'mainSeriesProperties.priceFormat.type': 'price',
        'mainSeriesProperties.priceFormat.precision': displayCurrency === 'USD' ? 2 : 9,
        'mainSeriesProperties.priceFormat.minMove': displayCurrency === 'USD' ? 0.01 : 0.000000001,
        
      },
      loading_screen: { backgroundColor: "#131722" },
    };

    const tvWidget = new widget(widgetOptions);

    return () => {
      if (subscriptionIdRef.current !== null) {
        unsubscribeFromPool(connection, subscriptionIdRef.current);
      }
      tvWidget.remove();
    };
  }, [tokenMint, displayCurrency, solPrice, setMcap, onTransactionUpdate]);

  useEffect(() => {
    const updateChartPrices = async () => {
      console.log('updateChartPrices called'); // Debug log 1
      try {
        const response = await fetch(`${API_URL}/candles/${tokenMint}`);
        const candlesData = await response.json();
        
        if (Array.isArray(candlesData) && candlesData.length > 0) {
          
          if (realtimeCallbackRef.current && lastCandleRef.current) {
            const lastCandle = formatCandleData(lastCandleRef.current);
            realtimeCallbackRef.current(lastCandle);
          }
        }
      } catch (error) {
        console.error('Error updating chart prices:', error);
      }
    };

    console.log('Effect triggered with:', { displayCurrency, solPrice }); // Debug log 5
    updateChartPrices();
  }, [displayCurrency, solPrice]);

  return (
    <div className="h-[600px]">
      <div 
        ref={chartContainerRef}
        className="h-[600px]"
      />
      </div>
  );
};

export default TradingChart;