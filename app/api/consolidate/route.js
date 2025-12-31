import { NextResponse } from 'next/server';

// ============================================
// CONSOLIDATOR WITH VERIFIED DATA INJECTION
// ============================================

// Asset definitions - only assets that work reliably
const ASSETS = {
  'S&P 500': { yahoo: '^GSPC', category: 'EQUITIES' },
  'Nasdaq Composite': { yahoo: '^IXIC', category: 'EQUITIES' },
  'Dow Jones': { yahoo: '^DJI', category: 'EQUITIES' },
  'Euro Stoxx 50': { yahoo: '^STOXX50E', category: 'EQUITIES' },
  'Nikkei 225': { yahoo: '^N225', category: 'EQUITIES' },
  'FTSE 100': { yahoo: '^FTSE', category: 'EQUITIES' },
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
  // US Yields (only reliable ones)
  'US 10-Year Yield': { yahoo: '^TNX', category: 'FIXED INCOME', isYield: true },
  'US 30-Year Yield': { yahoo: '^TYX', category: 'FIXED INCOME', isYield: true },
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

async function fetchVerifiedData(targetDate) {
  const results = {};
  
  for (const [assetName, config] of Object.entries(ASSETS)) {
    let data = null;
    
    if (config.yahoo) {
      data = await fetchYahooChart(config.yahoo, targetDate);
    }
    
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
Each LLM was asked to approach the analysis differently:
- **ChatGPT** tends to surface news events, headlines, and single-stock moves well
- **Gemini** tends to be strong on quantitative relationships and cross-asset transmission
- **Claude** tends to offer regime-level thinking and non-consensus interpretation

Use this as a guide, not a strict rule. Blend insights from whichever source has the best analysis.

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
• [Other relevant yield commentary].

---

**Commodities:**

*[One italic sentence summarizing the commodity theme]*

• **Gold** [USE VERIFIED GOLD FIGURE with context].
• **Oil** [USE VERIFIED WTI/BRENT FIGURES with context].

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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
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
      const { chatgptInput, geminiInput, claudeInput } = body;

      // Fetch verified market data
      const verifiedData = await fetchVerifiedData(targetDate);
      const formattedVerifiedData = formatVerifiedDataForPrompt(verifiedData);

      const userPrompt = `Synthesize these three research outputs into the Co-Mind Morning Pulse for ${formattedDate}.

IMPORTANT: The LLM outputs below may contain incorrect numbers. Use them ONLY for narrative and analysis.

For ALL numerical data (prices, levels, percentage changes, basis points), use ONLY the VERIFIED DATA provided at the end.

=== CHATGPT OUTPUT (use for: news events, single-stock moves, sector analysis) ===
${chatgptInput || 'Not provided'}

=== GEMINI OUTPUT (use for: cross-asset flow analysis, transmission mechanisms) ===
${geminiInput || 'Not provided'}

=== CLAUDE OUTPUT (use for: regime interpretation, non-obvious insights) ===
${claudeInput || 'Not provided'}

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
