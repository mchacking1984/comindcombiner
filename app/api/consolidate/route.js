import { NextResponse } from 'next/server';

// ============================================
// CONSOLIDATOR WITH VERIFIED DATA INJECTION
// ============================================

// Asset definitions - only assets that work reliably
const ASSETS = {
  'S&P 500': { yahoo: '^GSPC', category: 'EQUITIES' },
  'Nasdaq Composite': { yahoo: '^IXIC', category: 'EQUITIES' },
  'Dow Jones': { yahoo: '^DJI', category: 'EQUITIES' },
  'Russell 2000': { yahoo: '^RUT', category: 'EQUITIES' },
  'VIX': { yahoo: '^VIX', category: 'EQUITIES' },
  'Euro Stoxx 50': { yahoo: '^STOXX50E', category: 'EQUITIES' },
  'DAX': { yahoo: '^GDAXI', category: 'EQUITIES' },
  'FTSE 100': { yahoo: '^FTSE', category: 'EQUITIES' },
  'Nikkei 225': { yahoo: '^N225', category: 'EQUITIES' },
  'Hang Seng': { yahoo: '^HSI', category: 'EQUITIES' },
  'Gold': { yahoo: 'GC=F', category: 'COMMODITIES' },
  'Silver': { yahoo: 'SI=F', category: 'COMMODITIES' },
  'WTI Oil': { yahoo: 'CL=F', category: 'COMMODITIES' },
  'Brent Oil': { yahoo: 'BZ=F', category: 'COMMODITIES' },
  'Copper': { yahoo: 'HG=F', category: 'COMMODITIES' },
  'Dollar Index (DXY)': { yahoo: 'DX-Y.NYB', category: 'CURRENCIES' },
  'EUR/USD': { yahoo: 'EURUSD=X', category: 'CURRENCIES' },
  'GBP/USD': { yahoo: 'GBPUSD=X', category: 'CURRENCIES' },
  'USD/JPY': { yahoo: 'JPY=X', category: 'CURRENCIES' },
  'Bitcoin': { yahoo: 'BTC-USD', category: 'DIGITAL ASSETS' },
  'Ethereum': { yahoo: 'ETH-USD', category: 'DIGITAL ASSETS' },
  // US Yields via Yahoo Finance
  'US 10-Year Yield': { yahoo: '^TNX', category: 'FIXED INCOME', isYield: true },
  'US 30-Year Yield': { yahoo: '^TYX', category: 'FIXED INCOME', isYield: true },
  // International yields fetched separately via yields API
};

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
      close: targetData.close,
      previousClose: prevData?.close,
      percentChange,
      date: targetData.date,
    };
  } catch (err) {
    return null;
  }
}

// Fetch international bond yields using Gemini with Google Search grounding
async function fetchInternationalYields(targetDate, apiKey) {
  if (!apiKey) {
    console.log('No API key for yield fetching, skipping international yields');
    return {};
  }

  const prompt = `Search for the current government bond yields for Germany, United Kingdom, and Japan. I need the 10-year yields for each country.

For each country, find:
1. The current yield (as a percentage, e.g., 2.45)
2. The change from the previous session in basis points (e.g., +5 or -3)

Search financial sources like investing.com, tradingeconomics.com, bloomberg.com, or reuters.com.

Return ONLY a valid JSON object in this exact format, with no other text:
{
  "yields": [
    {"country": "Germany", "name": "German 10-Year Bund", "yield": 2.45, "change": 5, "date": "2025-01-02"},
    {"country": "United Kingdom", "name": "UK 10-Year Gilt", "yield": 4.62, "change": -3, "date": "2025-01-02"},
    {"country": "Japan", "name": "JGB 10-Year", "yield": 1.12, "change": 2, "date": "2025-01-02"}
  ]
}

Use today's actual data from your search. The "change" should be in basis points (positive or negative integer). The "date" should be the as-of date for the data.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini yield fetch error: ${response.status}`);
      return {};
    }

    const data = await response.json();

    // Extract text from response
    let responseText = '';
    if (data.candidates?.[0]?.content?.parts) {
      responseText = data.candidates[0].content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('');
    }

    if (!responseText) {
      console.error('No response text from Gemini yield fetch');
      return {};
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON
      const rawMatch = responseText.match(/\{[\s\S]*"yields"[\s\S]*\}/);
      if (rawMatch) {
        jsonStr = rawMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr);
    if (!parsed.yields || !Array.isArray(parsed.yields)) {
      console.error('Invalid yield response structure');
      return {};
    }

    // Convert to our format
    const results = {};
    for (const yieldData of parsed.yields) {
      if (yieldData.yield !== null && yieldData.yield !== undefined) {
        // Check date is within 3 days of target
        if (yieldData.date) {
          const targetDateObj = new Date(targetDate);
          const asOfDateObj = new Date(yieldData.date);
          const daysDiff = Math.abs((targetDateObj - asOfDateObj) / (1000 * 60 * 60 * 24));
          if (daysDiff > 3) {
            console.log(`Skipping ${yieldData.name}: data is from ${yieldData.date}, target is ${targetDate}`);
            continue;
          }
        }

        const assetName = `${yieldData.name} Yield`;
        results[assetName] = {
          close: yieldData.yield,
          bpsChange: yieldData.change || 0,
          previousClose: yieldData.yield - (yieldData.change || 0) / 100,
          date: yieldData.date || targetDate,
          category: 'FIXED INCOME',
          isYield: true,
        };
      }
    }

    return results;
  } catch (err) {
    console.error('Yield fetch error:', err.message);
    return {};
  }
}

async function fetchVerifiedData(targetDate, apiKey) {
  const results = {};

  // Fetch assets from Yahoo Finance
  for (const [assetName, config] of Object.entries(ASSETS)) {
    if (config.yahoo) {
      const data = await fetchYahooChart(config.yahoo, targetDate);
      if (data) {
        results[assetName] = {
          ...data,
          category: config.category,
          isYield: config.isYield || false,
        };

        // Calculate bps change for yields
        if (config.isYield && data.previousClose !== null) {
          results[assetName].bpsChange = (data.close - data.previousClose) * 100;
        }
      }
    }
  }

  // Fetch international yields using Gemini with Google Search
  const internationalYields = await fetchInternationalYields(targetDate, apiKey);
  Object.assign(results, internationalYields);

  return results;
}

function formatVerifiedDataForPrompt(marketData) {
  let output = `VERIFIED MARKET DATA — USE THESE EXACT FIGURES:\n\n`;
  
  const categories = ['EQUITIES', 'FIXED INCOME', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS'];
  
  for (const category of categories) {
    output += `${category}:\n`;
    
    for (const [assetName, data] of Object.entries(marketData)) {
      if (data.category !== category) continue;
      
      let priceStr;
      let changeStr;
      
      if (data.isYield) {
        priceStr = data.close.toFixed(3) + '%';
        changeStr = data.bpsChange !== null 
          ? `${data.bpsChange > 0 ? '+' : ''}${data.bpsChange.toFixed(1)} bps`
          : 'N/A';
      } else {
        if (assetName.includes('/')) {
          priceStr = data.close.toFixed(4);
        } else if (data.close > 10000) {
          priceStr = '$' + data.close.toLocaleString('en-US', { maximumFractionDigits: 0 });
        } else {
          priceStr = '$' + data.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        changeStr = data.percentChange !== null 
          ? `${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}%`
          : 'N/A';
      }
      
      const direction = data.isYield 
        ? (data.bpsChange >= 0 ? 'up' : 'down')
        : (data.percentChange >= 0 ? 'up' : 'down');
      
      output += `  ${assetName}: ${priceStr} (${changeStr}, ${direction})\n`;
    }
    output += '\n';
  }
  
  return output;
}

const CONSOLIDATION_PROMPT = `You are synthesizing three deep research reports on overnight market developments into a single "Co-Mind Morning Pulse" brief.

CRITICAL — VERIFIED DATA:
You have been provided with VERIFIED MARKET DATA at the end of this prompt. These figures are confirmed accurate from Yahoo Finance.

**YOU MUST USE THE VERIFIED FIGURES, NOT THE FIGURES FROM THE LLM OUTPUTS.**

The LLM outputs may contain hallucinated or incorrect numbers. Ignore their specific price levels and percentage changes. Use ONLY the verified data for all numerical claims.

From the LLM outputs, extract only:
- Narrative and analysis (why things moved)
- Single-stock moves and sector rotations (ChatGPT is often good at this)
- Cross-asset transmission explanations (Gemini tends to be strong here)
- Regime interpretation and non-obvious insights (Claude often provides this)
- Crypto analysis: ETF flows, macro correlation, BTC/ETH divergence (don't treat crypto as an afterthought)

CONTEXT ON SOURCES:
You may receive outputs from any combination of these LLMs (at least 2):
- **ChatGPT** tends to surface news events, headlines, and single-stock moves well
- **Gemini** tends to be strong on quantitative relationships and cross-asset transmission
- **Claude** tends to offer regime-level thinking and non-consensus interpretation
- **DeepResearch** provides sourced facts, citations, and deep web research findings

Use this as a guide, not a strict rule. Blend insights from whichever sources are provided based on quality of analysis.

TONE AND STYLE:
- Be analytical and precise, not dramatic
- Let the data speak — avoid hyperbole like "plunged," "soared," "stunning"
- Use measured language: "fell," "rose," "declined," "gained"
- Use "modestly," "slightly," or "marginally" when moves are small
- Acknowledge uncertainty where it exists
- The goal is INSIGHT, not excitement

OUTPUT FORMAT:

---

## Market Mood

**[Two-Word Phrase].** [3-4 sentences capturing the prevailing tone. Be specific about what drove sentiment.]

---

## Key Cross-Asset Moves

**Equities:**

*[One italic sentence summarizing the equity theme]*

• The **U.S.** [USE VERIFIED S&P 500 and Nasdaq figures]. [Context and notable single-stock moves].
• **European** equities [USE VERIFIED Euro Stoxx figure with context].
• In **Asia**, [USE VERIFIED Nikkei figure with context].

---

**Fixed Income:**

*[One italic sentence summarizing the rates theme]*

• The **U.S.** 10-year yield [USE VERIFIED YIELD AND BPS CHANGE]. [Curve context].
• **Global yields**: [USE VERIFIED INTERNATIONAL YIELD DATA for JGB, Bund, Gilt if available]. [Note divergence or convergence with US rates].

---

**Commodities:**

*[One italic sentence summarizing the commodity theme]*

• **Gold** [USE VERIFIED GOLD FIGURE with context].
• **Oil** [USE VERIFIED WTI/BRENT FIGURES with context].
• **Copper** [USE VERIFIED COPPER FIGURE with context - note its role as economic bellwether].

---

**Currencies:**

*[One italic sentence summarizing the FX theme]*

• The **Dollar Index** [USE VERIFIED DXY FIGURE with context].
• Key pairs: [USE VERIFIED FX FIGURES].

---

**Digital Assets:**

*[One italic sentence on crypto's relationship to broader risk sentiment]*

• **Bitcoin** [USE VERIFIED BITCOIN FIGURE]. [Context on driver — macro correlation, ETF flows, or crypto-specific catalyst].
• **Ethereum** [USE VERIFIED ETHEREUM FIGURE]. [Note if diverging from BTC and why, or if moving in lockstep].

---

## The Real Driver

**[One clear sentence identifying the primary force shaping markets].**

[2-3 paragraphs explaining the transmission mechanism. Be specific. Acknowledge uncertainty where it exists.]

---

## What We've Learned

• **[Concise insight].** [Supporting evidence with specific data].
• **[Concise insight].** [Supporting evidence].
• **[Concise insight].** [Supporting evidence].
• **[Concise insight].** [Supporting evidence].
• **[Concise insight].** [Supporting evidence].

---

## Final Thought

**[A grounded observation].** [1-2 sentences that leave the reader with something to consider.]

---

OUTPUT ONLY the formatted content starting with "## Market Mood".`;


async function callGemini(systemPrompt, userPrompt, apiKey, useThinking = false, thinkingBudget = 20000) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 12000,
    },
  };

  if (useThinking) {
    body.generationConfig.thinkingConfig = { thinkingBudget };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  let content = '';
  if (data.candidates?.[0]?.content?.parts) {
    content = data.candidates[0].content.parts
      .filter(part => part.text)
      .map(part => part.text)
      .join('\n\n');
  }

  return content;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { step, formattedDate, targetDate, thinkingBudget = 20000 } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY environment variable not configured' },
        { status: 500 }
      );
    }

    if (step === 'consolidate') {
      const { chatgptInput, geminiInput, claudeInput, deepresearchInput } = body;

      // Fetch verified market data (pass apiKey for international yield fetching via Gemini)
      const verifiedData = await fetchVerifiedData(targetDate, apiKey);
      const formattedVerifiedData = formatVerifiedDataForPrompt(verifiedData);

      // Build dynamic sections based on which inputs are provided
      const sections = [];
      if (chatgptInput) {
        sections.push(`=== CHATGPT OUTPUT (use for: news events, single-stock moves, sector analysis) ===
${chatgptInput}`);
      }
      if (geminiInput) {
        sections.push(`=== GEMINI OUTPUT (use for: cross-asset flow analysis, transmission mechanisms) ===
${geminiInput}`);
      }
      if (claudeInput) {
        sections.push(`=== CLAUDE OUTPUT (use for: regime interpretation, non-obvious insights) ===
${claudeInput}`);
      }
      if (deepresearchInput) {
        sections.push(`=== DEEPRESEARCH OUTPUT (use for: sourced facts, citations, deep web research) ===
${deepresearchInput}`);
      }

      const userPrompt = `Synthesize the following research outputs into the Co-Mind Morning Pulse for ${formattedDate}.

IMPORTANT: The LLM outputs below may contain incorrect numbers. Use them ONLY for narrative and analysis.

For ALL numerical data (prices, levels, percentage changes, basis points), use ONLY the VERIFIED DATA provided at the end.

${sections.join('\n\n')}

=== VERIFIED MARKET DATA — USE THESE EXACT FIGURES ===
${formattedVerifiedData}

Remember: Ignore any numbers in the LLM outputs above. Use ONLY the verified figures for Bitcoin, S&P 500, yields, etc.

Output ONLY the formatted Morning Pulse starting with "## Market Mood".`;

      const content = await callGemini(
        CONSOLIDATION_PROMPT,
        userPrompt,
        apiKey,
        true, // Use thinking for quality synthesis
        thinkingBudget
      );

      if (!content) {
        return NextResponse.json({ error: 'No content generated' }, { status: 500 });
      }

      return NextResponse.json({ content, verifiedData });

    } else {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
