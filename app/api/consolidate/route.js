import { NextResponse } from 'next/server';

// Yahoo Finance symbols for key assets
const MARKET_SYMBOLS = {
  // Equities
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq Composite',
  '^DJI': 'Dow Jones',
  '^STOXX50E': 'Euro Stoxx 50',
  '^N225': 'Nikkei 225',
  
  // Commodities
  'GC=F': 'Gold',
  'SI=F': 'Silver',
  'CL=F': 'WTI Oil',
  'BZ=F': 'Brent Oil',
  'HG=F': 'Copper',
  
  // Currencies
  'DX-Y.NYB': 'Dollar Index (DXY)',
  'EURUSD=X': 'EUR/USD',
  'GBPUSD=X': 'GBP/USD',
  'USDJPY=X': 'USD/JPY',
  
  // Crypto
  'BTC-USD': 'Bitcoin',
  'ETH-USD': 'Ethereum',
  
  // Bonds (yields)
  '^TNX': 'US 10-Year Yield',
  '^FVX': 'US 5-Year Yield',
};

async function fetchMarketData(targetDate) {
  const results = {};
  const errors = [];
  
  // Convert date string to timestamp range
  const date = new Date(targetDate + 'T00:00:00');
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 7); // Get a week of data to ensure we have the target date
  
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(date.getTime() / 1000) + 86400; // Add a day to include target date
  
  // Fetch data for each symbol
  for (const [symbol, name] of Object.entries(MARKET_SYMBOLS)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) {
        errors.push(`${name}: HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const chart = data.chart?.result?.[0];
      
      if (!chart || !chart.timestamp || chart.timestamp.length === 0) {
        errors.push(`${name}: No data available`);
        continue;
      }
      
      // Get the most recent close
      const quotes = chart.indicators?.quote?.[0];
      const timestamps = chart.timestamp;
      
      if (!quotes || !quotes.close) {
        errors.push(`${name}: No quote data`);
        continue;
      }
      
      // Find the last valid close
      let lastClose = null;
      let prevClose = null;
      let lastTimestamp = null;
      
      for (let i = timestamps.length - 1; i >= 0; i--) {
        if (quotes.close[i] !== null) {
          if (lastClose === null) {
            lastClose = quotes.close[i];
            lastTimestamp = timestamps[i];
          } else if (prevClose === null) {
            prevClose = quotes.close[i];
            break;
          }
        }
      }
      
      if (lastClose !== null) {
        const closeDate = new Date(lastTimestamp * 1000).toISOString().split('T')[0];
        let percentChange = null;
        let direction = null;
        
        if (prevClose !== null && prevClose !== 0) {
          percentChange = ((lastClose - prevClose) / prevClose) * 100;
          direction = percentChange >= 0 ? 'up' : 'down';
        }
        
        results[name] = {
          symbol,
          close: lastClose,
          previousClose: prevClose,
          percentChange: percentChange !== null ? percentChange.toFixed(2) : null,
          direction,
          date: closeDate,
        };
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  
  return { data: results, errors };
}

function formatMarketDataForComparison(marketData) {
  let output = '=== VERIFIED MARKET DATA (from Yahoo Finance) ===\n\n';
  
  const categories = {
    'EQUITIES': ['S&P 500', 'Nasdaq Composite', 'Dow Jones', 'Euro Stoxx 50', 'Nikkei 225'],
    'COMMODITIES': ['Gold', 'Silver', 'WTI Oil', 'Brent Oil', 'Copper'],
    'CURRENCIES': ['Dollar Index (DXY)', 'EUR/USD', 'GBP/USD', 'USD/JPY'],
    'DIGITAL ASSETS': ['Bitcoin', 'Ethereum'],
    'BONDS': ['US 10-Year Yield', 'US 5-Year Yield'],
  };
  
  for (const [category, assets] of Object.entries(categories)) {
    output += `${category}:\n`;
    for (const asset of assets) {
      const data = marketData[asset];
      if (data) {
        const changeStr = data.percentChange !== null 
          ? `${data.percentChange}% (${data.direction})` 
          : 'N/A';
        const priceStr = data.close.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: asset.includes('Yield') ? 3 : 2,
        });
        output += `- ${asset}: ${priceStr} | Change: ${changeStr} | Date: ${data.date}\n`;
      } else {
        output += `- ${asset}: Data unavailable\n`;
      }
    }
    output += '\n';
  }
  
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
      // Step 0: Fetch verified market data from Yahoo Finance
      const { targetDate } = body;
      
      const { data, errors } = await fetchMarketData(targetDate);
      const formatted = formatMarketDataForComparison(data);
      
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
