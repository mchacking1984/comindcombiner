import { NextResponse } from 'next/server';

// ============================================
// MULTI-SOURCE MARKET DATA FETCHING
// ============================================

// Asset definitions with source preferences
const ASSETS = {
  // Equities - Yahoo is primary
  'S&P 500': { yahoo: '^GSPC', category: 'EQUITIES' },
  'Nasdaq Composite': { yahoo: '^IXIC', category: 'EQUITIES' },
  'Dow Jones': { yahoo: '^DJI', category: 'EQUITIES' },
  'Euro Stoxx 50': { yahoo: '^STOXX50E', category: 'EQUITIES' },
  'Nikkei 225': { yahoo: '^N225', category: 'EQUITIES' },
  
  // Commodities - Yahoo is primary
  'Gold': { yahoo: 'GC=F', category: 'COMMODITIES' },
  'Silver': { yahoo: 'SI=F', category: 'COMMODITIES' },
  'WTI Oil': { yahoo: 'CL=F', category: 'COMMODITIES' },
  'Brent Oil': { yahoo: 'BZ=F', category: 'COMMODITIES' },
  'Copper': { yahoo: 'HG=F', category: 'COMMODITIES' },
  
  // Currencies - Yahoo + Frankfurter
  'Dollar Index (DXY)': { yahoo: 'DX-Y.NYB', category: 'CURRENCIES' },
  'EUR/USD': { yahoo: 'EURUSD=X', frankfurter: 'EUR', category: 'CURRENCIES' },
  'GBP/USD': { yahoo: 'GBPUSD=X', frankfurter: 'GBP', category: 'CURRENCIES' },
  'USD/JPY': { yahoo: 'JPY=X', frankfurter: 'JPY', category: 'CURRENCIES' },
  
  // Crypto - Yahoo + CoinGecko
  'Bitcoin': { yahoo: 'BTC-USD', coingecko: 'bitcoin', category: 'DIGITAL ASSETS' },
  'Ethereum': { yahoo: 'ETH-USD', coingecko: 'ethereum', category: 'DIGITAL ASSETS' },
  
  // Bonds - Yahoo + FRED
  'US 10-Year Yield': { yahoo: '^TNX', fred: 'DGS10', category: 'BONDS' },
  'US 2-Year Yield': { yahoo: '^IRX', fred: 'DGS2', category: 'BONDS' },
};

// Source 1: Yahoo Finance Chart API
async function fetchYahooChart(symbol, targetDate) {
  try {
    const target = new Date(targetDate + 'T12:00:00Z');
    const startDate = new Date(target);
    startDate.setDate(startDate.getDate() - 14);
    
    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(target.getTime() / 1000) + 43200;
    
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
    
    // Build daily data
    const dailyData = [];
    for (let i = 0; i < chart.timestamp.length; i++) {
      if (quotes.close[i] !== null) {
        dailyData.push({
          date: new Date(chart.timestamp[i] * 1000).toISOString().split('T')[0],
          close: quotes.close[i],
        });
      }
    }
    dailyData.sort((a, b) => a.date.localeCompare(b.date));
    
    // Find target date
    let targetIndex = -1;
    for (let i = dailyData.length - 1; i >= 0; i--) {
      if (dailyData[i].date <= targetDate) {
        targetIndex = i;
        break;
      }
    }
    
    if (targetIndex === -1) return null;
    
    const targetData = dailyData[targetIndex];
    const prevData = targetIndex > 0 ? dailyData[targetIndex - 1] : null;
    
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
    console.error('Yahoo Chart error:', err.message);
    return null;
  }
}

// Source 2: Yahoo Finance Quote API (different endpoint)
async function fetchYahooQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const quote = data.quoteResponse?.result?.[0];
    if (!quote) return null;
    
    const close = quote.regularMarketPreviousClose || quote.regularMarketPrice;
    const prevClose = quote.regularMarketPreviousClose;
    
    // Note: This gives us the most recent close, which we'll use for verification
    return {
      source: 'Yahoo Quote',
      close: close,
      previousClose: prevClose,
      percentChange: quote.regularMarketChangePercent,
      date: 'latest', // This endpoint doesn't give historical dates easily
    };
  } catch (err) {
    console.error('Yahoo Quote error:', err.message);
    return null;
  }
}

// Source 3: CoinGecko API (for crypto)
async function fetchCoinGecko(coinId, targetDate) {
  try {
    // CoinGecko expects DD-MM-YYYY format
    const [year, month, day] = targetDate.split('-');
    const formattedDate = `${day}-${month}-${year}`;
    
    // Get target date data
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${formattedDate}&localization=false`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const close = data.market_data?.current_price?.usd;
    if (!close) return null;
    
    // Get previous day for % change
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const [py, pm, pd] = prevDate.toISOString().split('T')[0].split('-');
    const prevFormatted = `${pd}-${pm}-${py}`;
    
    const prevResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${prevFormatted}&localization=false`,
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
    
    return {
      source: 'CoinGecko',
      close,
      previousClose: prevClose,
      percentChange,
      date: targetDate,
    };
  } catch (err) {
    console.error('CoinGecko error:', err.message);
    return null;
  }
}

// Source 4: Frankfurter API (ECB data for FX)
async function fetchFrankfurter(currency, targetDate) {
  try {
    // Frankfurter gives EUR as base, we need USD pairs
    const url = `https://api.frankfurter.app/${targetDate}?from=USD&to=${currency}`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const rate = data.rates?.[currency];
    if (!rate) return null;
    
    // Get previous day
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
    
    // Convert to standard FX pair format
    let close = rate;
    if (currency === 'JPY') {
      close = rate; // USD/JPY
    } else {
      close = 1 / rate; // EUR/USD, GBP/USD (invert)
    }
    
    return {
      source: 'Frankfurter (ECB)',
      close,
      previousClose: prevRate ? (currency === 'JPY' ? prevRate : 1 / prevRate) : null,
      percentChange: currency === 'JPY' ? percentChange : (percentChange ? -percentChange : null),
      date: targetDate,
    };
  } catch (err) {
    console.error('Frankfurter error:', err.message);
    return null;
  }
}

// Source 5: FRED API (Federal Reserve for yields)
async function fetchFRED(seriesId, targetDate) {
  try {
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 14);
    const startStr = startDate.toISOString().split('T')[0];
    
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&observation_start=${startStr}&observation_end=${targetDate}&file_type=json&api_key=DEMO`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const observations = data.observations?.filter(o => o.value !== '.');
    if (!observations?.length) return null;
    
    // Find target date or closest before
    let targetObs = null;
    let prevObs = null;
    
    for (let i = observations.length - 1; i >= 0; i--) {
      if (observations[i].date <= targetDate) {
        if (!targetObs) {
          targetObs = observations[i];
        } else if (!prevObs) {
          prevObs = observations[i];
          break;
        }
      }
    }
    
    if (!targetObs) return null;
    
    const close = parseFloat(targetObs.value);
    const prevClose = prevObs ? parseFloat(prevObs.value) : null;
    let percentChange = null;
    
    if (prevClose && prevClose !== 0) {
      // For yields, we typically report basis point change, but % works too
      percentChange = ((close - prevClose) / prevClose) * 100;
    }
    
    return {
      source: 'FRED',
      close,
      previousClose: prevClose,
      percentChange,
      date: targetObs.date,
    };
  } catch (err) {
    console.error('FRED error:', err.message);
    return null;
  }
}

// Consensus logic: determine best value from multiple sources
function determineConsensus(values, assetName) {
  // Filter out nulls
  const valid = values.filter(v => v !== null && v.close !== null && v.close !== undefined);
  
  if (valid.length === 0) {
    return { consensus: null, sources: [], confidence: 'none' };
  }
  
  if (valid.length === 1) {
    return {
      consensus: valid[0],
      sources: [valid[0].source],
      confidence: 'single',
      allValues: valid,
    };
  }
  
  // Calculate the median close price
  const closes = valid.map(v => v.close).sort((a, b) => a - b);
  const median = closes.length % 2 === 0
    ? (closes[closes.length / 2 - 1] + closes[closes.length / 2]) / 2
    : closes[Math.floor(closes.length / 2)];
  
  // Find sources within 1% of median (or 2% for volatile assets like crypto)
  const tolerance = assetName.includes('Bitcoin') || assetName.includes('Ethereum') ? 0.02 : 0.01;
  const agreeing = valid.filter(v => Math.abs(v.close - median) / median <= tolerance);
  
  if (agreeing.length >= 2) {
    // Multiple sources agree - use the one with the most complete data
    const best = agreeing.reduce((a, b) => 
      (a.percentChange !== null && a.date !== 'latest') ? a : b
    );
    
    return {
      consensus: best,
      sources: agreeing.map(v => v.source),
      confidence: 'high',
      allValues: valid,
    };
  }
  
  // No strong consensus - use source priority
  // Priority: FRED/Frankfurter (official) > CoinGecko (crypto) > Yahoo Chart > Yahoo Quote
  const priority = ['FRED', 'Frankfurter (ECB)', 'CoinGecko', 'Yahoo Finance', 'Yahoo Quote'];
  
  for (const src of priority) {
    const match = valid.find(v => v.source === src);
    if (match) {
      return {
        consensus: match,
        sources: [match.source],
        confidence: 'medium',
        allValues: valid,
        note: 'Sources disagree, using priority source',
      };
    }
  }
  
  return {
    consensus: valid[0],
    sources: [valid[0].source],
    confidence: 'low',
    allValues: valid,
  };
}

// Main multi-source fetch function
async function fetchMultiSourceMarketData(targetDate) {
  const results = {};
  const errors = [];
  
  for (const [assetName, config] of Object.entries(ASSETS)) {
    const sources = [];
    
    // Fetch from all applicable sources in parallel
    const fetchPromises = [];
    
    if (config.yahoo) {
      fetchPromises.push(
        fetchYahooChart(config.yahoo, targetDate).then(r => r && sources.push(r))
      );
      fetchPromises.push(
        fetchYahooQuote(config.yahoo).then(r => r && sources.push(r))
      );
    }
    
    if (config.coingecko) {
      fetchPromises.push(
        fetchCoinGecko(config.coingecko, targetDate).then(r => r && sources.push(r))
      );
    }
    
    if (config.frankfurter) {
      fetchPromises.push(
        fetchFrankfurter(config.frankfurter, targetDate).then(r => r && sources.push(r))
      );
    }
    
    if (config.fred) {
      fetchPromises.push(
        fetchFRED(config.fred, targetDate).then(r => r && sources.push(r))
      );
    }
    
    await Promise.all(fetchPromises);
    
    // Determine consensus
    const consensus = determineConsensus(sources, assetName);
    
    if (consensus.consensus) {
      results[assetName] = {
        ...consensus.consensus,
        category: config.category,
        confidence: consensus.confidence,
        agreeing: consensus.sources,
        allSources: consensus.allValues?.map(v => ({
          source: v.source,
          close: v.close,
          percentChange: v.percentChange,
        })),
      };
    } else {
      errors.push(`${assetName}: No data from any source`);
    }
  }
  
  return { data: results, errors };
}

function formatMarketDataForComparison(marketData, targetDate) {
  let output = `=== VERIFIED MARKET DATA (Multi-Source Consensus) ===\n`;
  output += `Target Date: ${targetDate}\n\n`;
  
  const categories = ['EQUITIES', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS', 'BONDS'];
  
  for (const category of categories) {
    output += `${category}:\n`;
    
    for (const [assetName, data] of Object.entries(marketData)) {
      if (data.category !== category) continue;
      
      const changeStr = data.percentChange !== null 
        ? `${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}% (${data.percentChange >= 0 ? 'up' : 'down'})` 
        : 'N/A';
      
      const priceStr = data.close.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: assetName.includes('Yield') ? 3 : 2,
      });
      
      const confidenceEmoji = data.confidence === 'high' ? '✓✓' : data.confidence === 'medium' ? '✓' : '?';
      
      output += `- ${assetName}: ${priceStr} | Change: ${changeStr} | Sources: ${data.agreeing.join(', ')} ${confidenceEmoji}\n`;
      
      // Show all source values if there's disagreement
      if (data.allSources && data.allSources.length > 1 && data.confidence !== 'high') {
        output += `  └─ All values: ${data.allSources.map(s => `${s.source}: ${s.close?.toFixed(2)}`).join(' | ')}\n`;
      }
    }
    output += '\n';
  }
  
  output += `Legend: ✓✓ = Multiple sources agree | ✓ = Priority source used | ? = Low confidence\n`;
  
  return output;
}

const DATA_EXTRACTION_PROMPT = `You are a financial data extraction specialist. Extract ALL numerical market data from the provided research report into a structured format.

Extract the following data points (use "N/A" if not mentioned):

EQUITIES:
- S&P 500 close level:
- S&P 500 % change:
- Nasdaq close level:
- Nasdaq % change:
- Notable stock 1 (name, % change):
- Notable stock 2 (name, % change):
- Euro Stoxx 50 level/change:
- Nikkei 225 level/change:

FIXED INCOME:
- US 10-year yield:
- US 2-year yield:
- German 10-year yield:
- UK 10-year yield:

COMMODITIES:
- Gold price:
- Gold % change:
- WTI Oil price:
- Oil % change:
- Brent Oil price:
- Copper price/change:
- Silver price/change:

CURRENCIES:
- DXY level:
- DXY % change:
- EUR/USD:
- GBP/USD:
- USD/JPY:

DIGITAL ASSETS:
- Bitcoin price:
- Bitcoin % change:
- Bitcoin direction (up/down/flat):
- Ethereum price:
- Ethereum % change:

Output ONLY the structured data, no commentary.`;

const COMPARISON_PROMPT = `You are a financial data analyst. Compare the extracted data from three LLM sources against VERIFIED MARKET DATA and identify the correct value for each metric.

RULES:
1. VERIFIED MARKET DATA is the ground truth - always prefer it over LLM sources
2. If verified data is unavailable for a metric, use consensus from LLM sources (2+ agreeing)
3. Flag any LLM source that significantly deviates from verified data as UNRELIABLE for that metric
4. Pay special attention to DIRECTION (up vs down) - this is critical
5. For prices, values within 0.5% of verified data are acceptable; larger deviations are errors

Output format for each metric:
[Metric]: VERIFIED: [value] | ChatGPT: [value] | Gemini: [value] | Claude: [value] | USE: [final value to use] | OUTLIERS: [list any wrong sources]

After listing all metrics, provide a SUMMARY of which source(s) had the most errors.`;

const CONSOLIDATION_PROMPT = `You are synthesizing three deep research reports on overnight market developments into a single "Co-Mind Morning Pulse" brief.

You have been provided with:
1. VERIFIED MARKET DATA from Yahoo Finance - this is the ground truth
2. A data comparison showing which LLM sources were accurate vs wrong
3. The raw research from three sources (ChatGPT, Gemini, Claude)

CRITICAL DATA RULES:
- For numerical data (prices, levels, % changes), use VERIFIED VALUES from the comparison
- Use the DIRECTION from verified data (if Bitcoin verified as UP, never say it was DOWN)
- For narrative/analysis, synthesize insights from all three LLM sources
- If an LLM source was flagged as having wrong data for a metric, ignore that source's commentary about that metric

Your output must EXACTLY match this format and tone:

---

## Market Mood

**[Two-Word Phrase].** [3-4 sentences of deep macro analysis. Not surface-level reporting - identify the underlying market psychology, reflexivity, and what positioning signals this reveals. Be bold and conviction-driven. End with what investors are front-running or pricing in.]

---

## Key Cross-Asset Moves

**Equities:**

*[One italic sentence summarizing the equity theme]*

* The **U.S.** [S&P 500 and Nasdaq moves with specific numbers and context on what drove the move]. *[Notable single stock move with context explaining why].*
* **European** equities [Euro Stoxx 50 move or status with brief driver context].
* In **Asia**, [Japan Nikkei and China moves with context on key drivers].

---

**Fixed Income:**

*[One italic sentence summarizing the rates theme]*

* The **U.S.** 10-year Treasury yield [specific level and move with context on what's driving yields], while the 2-year yield [level]. [Curve shape interpretation and what it signals].
* In **Europe**, [German 10-year and UK 10-year levels with brief context].
* **Credit** markets [spread behavior, tone, and what it indicates about risk appetite].

---

**Commodities:**

*[One italic sentence summarizing the commodity theme]*

* **[Lead commodity]** [specific move and price level with context on the driver].
* **Gold** [price and % move with driver and what it signals].
* **Oil** [WTI and Brent levels with context on supply/demand or geopolitical factors].
* **Copper** [price and context on what's driving industrial metals].

---

**Currencies:**

*[One italic sentence summarizing the FX theme]*

* The **Dollar Index** [level and context on what's driving dollar strength/weakness].
* The **euro** and **British pound** [levels with brief context].
* The **Japanese yen** [level and context on BoJ policy or intervention risk].

---

**Digital Assets:**

*[One italic sentence summarizing crypto sentiment and what's driving it]*

* **Bitcoin** [price and move with context on sentiment or catalysts].
* **Ethereum** [price and move with any relevant context].

---

## The Real Driver

**[Bold one-sentence thesis identifying the ONE underlying force].**

[2-3 paragraphs explaining the transmission mechanism. How did this driver flow through different asset classes? What's the reflexivity at play? Be specific about cause and effect. End with the underlying regime characterization.]

---

## What We've Learned

* **[Bold thesis statement].** [Supporting evidence and implication - 1-2 sentences].
* **[Bold thesis statement].** [Supporting evidence and implication - 1-2 sentences].
* **[Bold thesis statement].** [Supporting evidence and implication - 1-2 sentences].
* **[Bold thesis statement].** [Supporting evidence and implication - 1-2 sentences].
* **[Bold thesis statement].** [Supporting evidence and implication - 1-2 sentences].
* **[Bold thesis statement].** [Supporting evidence and implication - 1-2 sentences].

---

## Final Thought

**[Bold provocative phrase].** [2-3 sentences with a memorable, quotable takeaway. Should be actionable and forward-looking. End with what to expect or watch for.]

---

CRITICAL INSTRUCTIONS:
1. USE CONSENSUS DATA VALUES from the comparison - never use outlier values
2. Synthesize NARRATIVE insights from all three sources
3. Maintain the EXACT formatting with horizontal rules (---) between sections
4. Use **bold** for emphasis and *italics* for summary lines exactly as shown
5. Keep the sophisticated institutional tone - no hedging, no "may" or "could"
6. Every number must be specific (not "around" or "approximately")
7. The "What We've Learned" bullets must be NON-OBVIOUS insights, not recaps
8. Output ONLY the formatted content starting with "## Market Mood" - no preamble`;

const VERIFICATION_PROMPT = `You are a financial data verification specialist. Verify the KEY market data in this report against actual closing prices.

CRITICAL: Search for CLOSING prices on the specific date provided, not intraday highs/lows or current prices.

For each of these, search "[asset] closing price [DATE]":
1. Bitcoin closing price
2. S&P 500 closing level  
3. Gold closing price
4. WTI Oil closing price

If any value in the report differs significantly from the verified closing price:
- Correct it to the verified value
- Ensure direction (up/down) matches reality

Output the COMPLETE corrected report with EXACT same formatting. No commentary - start directly with "## Market Mood".`;

async function callGemini(systemPrompt, userPrompt, apiKey, useThinking = false) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 12000,
    },
  };

  // Add thinking config for complex reasoning tasks
  if (useThinking) {
    body.generationConfig.thinkingConfig = {
      thinkingBudget: 8000,
    };
  }

  // Add Google Search for verification
  if (systemPrompt.includes('verification') || systemPrompt.includes('Search for')) {
    body.tools = [{ googleSearch: {} }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Gemini API error');
  }

  let content = '';
  if (data.candidates && data.candidates[0]?.content?.parts) {
    content = data.candidates[0].content.parts
      .filter((part) => part.text)
      .map((part) => part.text)
      .join('\n\n');
  }

  return content;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { step, formattedDate } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY environment variable not configured' },
        { status: 500 }
      );
    }

    if (step === 'fetch') {
      // Step 0: Fetch verified market data from multiple sources
      const { targetDate } = body;
      
      const { data, errors } = await fetchMultiSourceMarketData(targetDate);
      const formatted = formatMarketDataForComparison(data, targetDate);
      
      return NextResponse.json({ 
        marketData: data, 
        formatted,
        errors: errors.length > 0 ? errors : null 
      });

    } else if (step === 'extract') {
      // Step 1: Extract data from each source
      const { source, content } = body;
      
      const extractedData = await callGemini(
        DATA_EXTRACTION_PROMPT,
        `Extract all numerical market data from this ${source} research report:\n\n${content}`,
        apiKey,
        false
      );

      return NextResponse.json({ extractedData });

    } else if (step === 'compare') {
      // Step 2: Compare extracted data from all sources against verified data
      const { chatgptData, geminiData, claudeData, verifiedData } = body;

      const comparisonPrompt = `Compare the extracted data from three LLM sources against the VERIFIED MARKET DATA:

${verifiedData}

=== CHATGPT EXTRACTED DATA ===
${chatgptData}

=== GEMINI EXTRACTED DATA ===
${geminiData}

=== CLAUDE EXTRACTED DATA ===
${claudeData}

For each metric, compare LLM values against VERIFIED data. Flag sources that are wrong. Determine the correct value to use (prefer VERIFIED, then consensus).`;

      const comparison = await callGemini(
        COMPARISON_PROMPT,
        comparisonPrompt,
        apiKey,
        true // Use thinking for careful comparison
      );

      return NextResponse.json({ comparison });

    } else if (step === 'consolidate') {
      // Step 3: Consolidate with comparison data
      const { chatgptInput, geminiInput, claudeInput, comparison } = body;

      const consolidationPrompt = `Consolidate these three research reports into the Co-Mind Morning Pulse for ${formattedDate}.

=== DATA COMPARISON (USE THESE CONSENSUS VALUES) ===
${comparison}

=== CHATGPT DEEP RESEARCH ===
${chatgptInput || 'Not provided'}

=== GEMINI DEEP RESEARCH ===
${geminiInput || 'Not provided'}

=== CLAUDE DEEP RESEARCH ===
${claudeInput || 'Not provided'}

CRITICAL: Use the CONSENSUS values from the data comparison above. If a source was identified as an outlier for a metric, do NOT use that source's value.

Output ONLY the formatted Morning Pulse starting with "## Market Mood".`;

      const content = await callGemini(
        CONSOLIDATION_PROMPT,
        consolidationPrompt,
        apiKey,
        true // Use thinking for high-quality synthesis
      );

      if (!content) {
        return NextResponse.json(
          { error: 'No content generated' },
          { status: 500 }
        );
      }

      return NextResponse.json({ content });

    } else if (step === 'verify') {
      // Step 4: Verify key data points
      const { content } = body;

      const verifyPrompt = `Verify and correct the key market data in this Morning Pulse report for ${formattedDate}.

Search for CLOSING prices on ${formattedDate} (not intraday or current):
- "Bitcoin closing price ${formattedDate}"
- "S&P 500 close ${formattedDate}"
- "Gold closing price ${formattedDate}"
- "WTI oil closing price ${formattedDate}"

Correct any values that don't match the verified closing prices.

${content}`;

      const verifiedContent = await callGemini(
        VERIFICATION_PROMPT,
        verifyPrompt,
        apiKey,
        false
      );

      if (!verifiedContent || !verifiedContent.includes('## Market Mood')) {
        return NextResponse.json({ content });
      }

      return NextResponse.json({ content: verifiedContent });

    } else {
      return NextResponse.json(
        { error: 'Invalid step parameter' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
