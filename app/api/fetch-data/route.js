import { NextResponse } from 'next/server';

// ============================================
// MULTI-SOURCE MARKET DATA FETCHING
// ============================================

const ASSETS = {
  // Equities
  'S&P 500': { yahoo: '^GSPC', category: 'EQUITIES' },
  'Nasdaq Composite': { yahoo: '^IXIC', category: 'EQUITIES' },
  'Dow Jones': { yahoo: '^DJI', category: 'EQUITIES' },
  'Euro Stoxx 50': { yahoo: '^STOXX50E', category: 'EQUITIES' },
  'Nikkei 225': { yahoo: '^N225', category: 'EQUITIES' },
  'FTSE 100': { yahoo: '^FTSE', category: 'EQUITIES' },
  
  // Commodities
  'Gold': { yahoo: 'GC=F', category: 'COMMODITIES' },
  'Silver': { yahoo: 'SI=F', category: 'COMMODITIES' },
  'WTI Oil': { yahoo: 'CL=F', category: 'COMMODITIES' },
  'Brent Oil': { yahoo: 'BZ=F', category: 'COMMODITIES' },
  'Copper': { yahoo: 'HG=F', category: 'COMMODITIES' },
  'Natural Gas': { yahoo: 'NG=F', category: 'COMMODITIES' },
  
  // Currencies
  'Dollar Index (DXY)': { yahoo: 'DX-Y.NYB', category: 'CURRENCIES' },
  'EUR/USD': { yahoo: 'EURUSD=X', frankfurter: 'EUR', category: 'CURRENCIES' },
  'GBP/USD': { yahoo: 'GBPUSD=X', frankfurter: 'GBP', category: 'CURRENCIES' },
  'USD/JPY': { yahoo: 'JPY=X', frankfurter: 'JPY', category: 'CURRENCIES' },
  
  // Crypto
  'Bitcoin': { yahoo: 'BTC-USD', coingecko: 'bitcoin', category: 'DIGITAL ASSETS' },
  'Ethereum': { yahoo: 'ETH-USD', coingecko: 'ethereum', category: 'DIGITAL ASSETS' },
  
  // Bonds - US (only ones that work reliably via Yahoo)
  'US 10-Year Yield': { yahoo: '^TNX', category: 'FIXED INCOME', isYield: true },
  'US 30-Year Yield': { yahoo: '^TYX', category: 'FIXED INCOME', isYield: true },
  
  // Note: US 2Y, German 10Y, UK 10Y, Japan 10Y are added via manual input in the UI
};

// Source 1: Yahoo Finance Chart API
async function fetchYahooChart(symbol, targetDate) {
  try {
    const startDate = new Date(targetDate + 'T00:00:00Z');
    startDate.setDate(startDate.getDate() - 14);
    const endDate = new Date(targetDate + 'T23:59:59Z');
    
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const chart = data.chart?.result?.[0];
    if (!chart?.timestamp?.length) return null;
    
    const quotes = chart.indicators?.quote?.[0];
    if (!quotes?.close) return null;
    
    const dailyData = [];
    for (let i = 0; i < chart.timestamp.length; i++) {
      if (quotes.close[i] !== null) {
        const dateStr = new Date(chart.timestamp[i] * 1000).toISOString().split('T')[0];
        if (dateStr <= targetDate) {
          dailyData.push({ date: dateStr, close: quotes.close[i] });
        }
      }
    }
    dailyData.sort((a, b) => a.date.localeCompare(b.date));
    
    if (dailyData.length === 0) return null;
    
    const targetData = dailyData[dailyData.length - 1];
    const prevData = dailyData.length > 1 ? dailyData[dailyData.length - 2] : null;
    
    let percentChange = null;
    if (prevData && prevData.close !== 0) {
      percentChange = ((targetData.close - prevData.close) / prevData.close) * 100;
    }
    
    return {
      source: 'Yahoo Finance',
      close: targetData.close,
      previousClose: prevData?.close,
      percentChange,
      date: targetData.date,
      previousDate: prevData?.date,
    };
  } catch (err) {
    return null;
  }
}

// Source 2: CoinGecko API
async function fetchCoinGecko(coinId, targetDate) {
  try {
    const [year, month, day] = targetDate.split('-');
    const formattedDate = `${day}-${month}-${year}`;
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${formattedDate}&localization=false`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const close = data.market_data?.current_price?.usd;
    if (!close) return null;
    
    // Get previous day
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const [py, pm, pd] = prevDate.toISOString().split('T')[0].split('-');
    
    const prevResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${pd}-${pm}-${py}&localization=false`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    let percentChange = null;
    let prevClose = null;
    
    if (prevResponse.ok) {
      const prevData = await prevResponse.json();
      prevClose = prevData.market_data?.current_price?.usd;
      if (prevClose && prevClose !== 0) {
        percentChange = ((close - prevClose) / prevClose) * 100;
      }
    }
    
    return { source: 'CoinGecko', close, previousClose: prevClose, percentChange, date: targetDate };
  } catch (err) {
    return null;
  }
}

// Source 3: Frankfurter API (ECB)
async function fetchFrankfurter(currency, targetDate) {
  try {
    const response = await fetch(`https://api.frankfurter.app/${targetDate}?from=USD&to=${currency}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const rate = data.rates?.[currency];
    if (!rate) return null;
    
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];
    
    const prevResponse = await fetch(`https://api.frankfurter.app/${prevDateStr}?from=USD&to=${currency}`);
    let percentChange = null;
    let prevRate = null;
    
    if (prevResponse.ok) {
      const prevData = await prevResponse.json();
      prevRate = prevData.rates?.[currency];
      if (prevRate && prevRate !== 0) {
        percentChange = ((rate - prevRate) / prevRate) * 100;
      }
    }
    
    let close = currency === 'JPY' ? rate : 1 / rate;
    let prevClose = prevRate ? (currency === 'JPY' ? prevRate : 1 / prevRate) : null;
    
    return {
      source: 'Frankfurter (ECB)',
      close,
      previousClose: prevClose,
      percentChange: currency === 'JPY' ? percentChange : (percentChange ? -percentChange : null),
      date: targetDate,
    };
  } catch (err) {
    return null;
  }
}

// Source 4: FRED API
async function fetchFRED(seriesId, targetDate) {
  try {
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 14);
    const startStr = startDate.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&observation_start=${startStr}&observation_end=${targetDate}&file_type=json&api_key=DEMO`
    );
    if (!response.ok) return null;
    
    const data = await response.json();
    const observations = data.observations?.filter(o => o.value !== '.');
    if (!observations?.length) return null;
    
    let targetObs = null;
    let prevObs = null;
    
    for (let i = observations.length - 1; i >= 0; i--) {
      if (observations[i].date <= targetDate) {
        if (!targetObs) targetObs = observations[i];
        else if (!prevObs) { prevObs = observations[i]; break; }
      }
    }
    
    if (!targetObs) return null;
    
    const close = parseFloat(targetObs.value);
    const prevClose = prevObs ? parseFloat(prevObs.value) : null;
    let percentChange = prevClose ? ((close - prevClose) / prevClose) * 100 : null;
    
    return { source: 'FRED', close, previousClose: prevClose, percentChange, date: targetObs.date };
  } catch (err) {
    return null;
  }
}

// Consensus logic
function determineConsensus(values, assetName) {
  const valid = values.filter(v => v !== null && v.close !== null);
  
  if (valid.length === 0) return { consensus: null, sources: [], confidence: 'none' };
  if (valid.length === 1) return { consensus: valid[0], sources: [valid[0].source], confidence: 'single', allValues: valid };
  
  const closes = valid.map(v => v.close).sort((a, b) => a - b);
  const median = closes.length % 2 === 0
    ? (closes[closes.length / 2 - 1] + closes[closes.length / 2]) / 2
    : closes[Math.floor(closes.length / 2)];
  
  const tolerance = assetName.includes('Bitcoin') || assetName.includes('Ethereum') ? 0.02 : 0.01;
  const agreeing = valid.filter(v => Math.abs(v.close - median) / median <= tolerance);
  
  if (agreeing.length >= 2) {
    const best = agreeing.reduce((a, b) => (a.percentChange !== null && a.date !== 'latest') ? a : b);
    return { consensus: best, sources: agreeing.map(v => v.source), confidence: 'high', allValues: valid };
  }
  
  const priority = ['FRED', 'Frankfurter (ECB)', 'CoinGecko', 'Yahoo Finance'];
  for (const src of priority) {
    const match = valid.find(v => v.source === src);
    if (match) return { consensus: match, sources: [match.source], confidence: 'medium', allValues: valid };
  }
  
  return { consensus: valid[0], sources: [valid[0].source], confidence: 'low', allValues: valid };
}

// Main fetch function
async function fetchMultiSourceMarketData(targetDate) {
  const results = {};
  const errors = [];
  
  for (const [assetName, config] of Object.entries(ASSETS)) {
    const sources = [];
    const fetchPromises = [];
    
    if (config.yahoo) {
      fetchPromises.push(fetchYahooChart(config.yahoo, targetDate).then(r => r && sources.push(r)));
    }
    if (config.coingecko) {
      fetchPromises.push(fetchCoinGecko(config.coingecko, targetDate).then(r => r && sources.push(r)));
    }
    if (config.frankfurter) {
      fetchPromises.push(fetchFrankfurter(config.frankfurter, targetDate).then(r => r && sources.push(r)));
    }
    if (config.fred) {
      fetchPromises.push(fetchFRED(config.fred, targetDate).then(r => r && sources.push(r)));
    }
    
    await Promise.all(fetchPromises);
    
    const consensus = determineConsensus(sources, assetName);
    
    if (consensus.consensus) {
      const data = {
        ...consensus.consensus,
        category: config.category,
        confidence: consensus.confidence,
        agreeing: consensus.sources,
        isYield: config.isYield || assetName.includes('Yield'),
      };
      
      // For yields, calculate basis point change instead of percentage change
      if (data.isYield && data.previousClose !== null) {
        data.bpsChange = (data.close - data.previousClose) * 100;
      }
      
      results[assetName] = data;
    } else {
      errors.push(`${assetName}: No data from any source`);
    }
  }
  
  return { data: results, errors };
}

// Format data for prompt
function formatDataForPrompt(marketData, targetDate) {
  let output = `VERIFIED MARKET DATA FOR ${targetDate}\n`;
  output += `(Multi-source consensus from Yahoo Finance, CoinGecko, FRED, ECB)\n\n`;
  
  const categories = ['EQUITIES', 'FIXED INCOME', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS'];
  
  for (const category of categories) {
    output += `${category}:\n`;
    
    for (const [assetName, data] of Object.entries(marketData)) {
      if (data.category !== category) continue;
      
      let priceStr;
      let changeStr;
      let direction;
      
      if (data.isYield) {
        // For yields: show level and basis point change
        priceStr = data.close.toFixed(3) + '%';
        if (data.bpsChange !== null && data.bpsChange !== undefined) {
          const bps = data.bpsChange.toFixed(1);
          direction = data.bpsChange >= 0 ? '↑' : '↓';
          changeStr = `${data.bpsChange > 0 ? '+' : ''}${bps} bps`;
        } else {
          direction = '';
          changeStr = 'N/A';
        }
      } else {
        // For everything else: show level and percentage change
        direction = data.percentChange >= 0 ? '↑' : '↓';
        changeStr = data.percentChange !== null 
          ? `${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}%` 
          : 'N/A';
        
        if (assetName.includes('/')) {
          priceStr = data.close.toFixed(4);
        } else if (data.close > 10000) {
          priceStr = data.close.toLocaleString('en-US', { maximumFractionDigits: 0 });
        } else {
          priceStr = data.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
      
      output += `  ${assetName}: ${priceStr} (${changeStr} ${direction})\n`;
    }
    output += '\n';
  }
  
  return output;
}

export async function POST(request) {
  try {
    const { targetDate } = await request.json();
    
    const { data, errors } = await fetchMultiSourceMarketData(targetDate);
    const formatted = formatDataForPrompt(data, targetDate);
    
    return NextResponse.json({ 
      marketData: data, 
      formatted,
      errors: errors.length > 0 ? errors : null 
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
