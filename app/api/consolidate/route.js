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

// Yield fetching prompt - request US 2-Year and international bond yields
const YIELD_PROMPT = `Search for the current government bond yields. I need yields for these specific bonds:

1. US 2-Year Treasury
2. German 2-Year Bund, 10-Year Bund, 30-Year Bund
3. UK 2-Year Gilt, 10-Year Gilt, 30-Year Gilt
4. Japan JGB 2-Year, 10-Year, 30-Year

For each bond, find:
- The current yield (as a percentage, e.g., 2.45)
- The change from the previous session in basis points (e.g., +5 or -3)

Search financial sources like investing.com, tradingeconomics.com, bloomberg.com, cnbc.com, or reuters.com.

Return ONLY a valid JSON object in this exact format, with no other text:
{
  "yields": [
    {"name": "US 2-Year", "yield": 4.25, "change": 2, "date": "2025-01-02"},
    {"name": "German 2-Year Bund", "yield": 2.15, "change": 3, "date": "2025-01-02"},
    {"name": "German 10-Year Bund", "yield": 2.45, "change": 5, "date": "2025-01-02"},
    {"name": "German 30-Year Bund", "yield": 2.65, "change": 4, "date": "2025-01-02"},
    {"name": "UK 2-Year Gilt", "yield": 4.32, "change": -2, "date": "2025-01-02"},
    {"name": "UK 10-Year Gilt", "yield": 4.62, "change": -3, "date": "2025-01-02"},
    {"name": "UK 30-Year Gilt", "yield": 5.12, "change": -1, "date": "2025-01-02"},
    {"name": "JGB 2-Year", "yield": 0.58, "change": 1, "date": "2025-01-02"},
    {"name": "JGB 10-Year", "yield": 1.12, "change": 2, "date": "2025-01-02"},
    {"name": "JGB 30-Year", "yield": 2.28, "change": 3, "date": "2025-01-02"}
  ]
}

Use today's actual data from your search. The "change" should be in basis points (positive or negative integer). The "date" should be the as-of date for the data.`;

// Fetch yields from Gemini with Google Search
async function fetchYieldsFromGemini(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: YIELD_PROMPT }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!response.ok) {
      console.error(`Gemini yield fetch error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    let responseText = '';
    if (data.candidates?.[0]?.content?.parts) {
      responseText = data.candidates[0].content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('');
    }

    return parseYieldResponse(responseText, 'gemini');
  } catch (err) {
    console.error('Gemini yield fetch error:', err.message);
    return null;
  }
}

// Fetch yields from OpenAI with web search
async function fetchYieldsFromOpenAI(apiKey) {
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: YIELD_PROMPT,
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI yield fetch error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    let responseText = '';
    if (data.output) {
      // Extract text from output array
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text') {
              responseText += content.text;
            }
          }
        }
      }
    }

    return parseYieldResponse(responseText, 'openai');
  } catch (err) {
    console.error('OpenAI yield fetch error:', err.message);
    return null;
  }
}

// Parse yield response from either provider
function parseYieldResponse(responseText, provider) {
  if (!responseText) {
    console.error(`No response text from ${provider} yield fetch`);
    return null;
  }

  try {
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const rawMatch = responseText.match(/\{[\s\S]*"yields"[\s\S]*\}/);
      if (rawMatch) {
        jsonStr = rawMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr);
    if (!parsed.yields || !Array.isArray(parsed.yields)) {
      console.error(`Invalid yield response structure from ${provider}`);
      return null;
    }

    return parsed.yields;
  } catch (err) {
    console.error(`Failed to parse ${provider} yield response:`, err.message);
    return null;
  }
}

// Compute consensus from multiple yield sources
function computeYieldConsensus(geminiYields, openaiYields, targetDate) {
  const results = {};
  const allYields = new Map();

  // Helper to add yields to the map
  const addYields = (yields, provider) => {
    if (!yields) return;
    for (const y of yields) {
      if (!y.name || y.yield === null || y.yield === undefined) continue;
      const key = y.name;
      if (!allYields.has(key)) {
        allYields.set(key, []);
      }
      allYields.get(key).push({
        yield: y.yield,
        change: y.change || 0,
        date: y.date,
        provider,
      });
    }
  };

  addYields(geminiYields, 'gemini');
  addYields(openaiYields, 'openai');

  // Compute consensus for each yield
  for (const [name, values] of allYields) {
    if (values.length === 0) continue;

    // Check date validity (within 3 days of target)
    const validValues = values.filter(v => {
      if (!v.date) return true;
      const targetDateObj = new Date(targetDate);
      const asOfDateObj = new Date(v.date);
      const daysDiff = Math.abs((targetDateObj - asOfDateObj) / (1000 * 60 * 60 * 24));
      return daysDiff <= 3;
    });

    if (validValues.length === 0) {
      console.log(`Skipping ${name}: all data outside date range`);
      continue;
    }

    // Calculate median yield and change
    const yields = validValues.map(v => v.yield).sort((a, b) => a - b);
    const changes = validValues.map(v => v.change).sort((a, b) => a - b);

    const medianYield = yields.length % 2 === 0
      ? (yields[yields.length / 2 - 1] + yields[yields.length / 2]) / 2
      : yields[Math.floor(yields.length / 2)];

    const medianChange = changes.length % 2 === 0
      ? (changes[changes.length / 2 - 1] + changes[changes.length / 2]) / 2
      : changes[Math.floor(changes.length / 2)];

    // Determine confidence based on agreement
    let confidence = 'low';
    if (validValues.length >= 2) {
      const yieldSpread = Math.max(...yields) - Math.min(...yields);
      confidence = yieldSpread < 0.1 ? 'high' : yieldSpread < 0.25 ? 'medium' : 'low';
    } else if (validValues.length === 1) {
      confidence = 'medium';
    }

    const assetName = `${name} Yield`;
    results[assetName] = {
      close: Math.round(medianYield * 1000) / 1000,
      bpsChange: Math.round(medianChange),
      previousClose: medianYield - medianChange / 100,
      date: validValues[0].date || targetDate,
      category: 'FIXED INCOME',
      isYield: true,
      confidence,
      sources: validValues.length,
    };
  }

  return results;
}

// Fetch international bond yields using both Gemini and OpenAI with web search
async function fetchInternationalYields(targetDate, geminiApiKey) {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!geminiApiKey && !openaiApiKey) {
    console.log('No API keys for yield fetching, skipping international yields');
    return {};
  }

  // Fetch from both providers in parallel
  const [geminiYields, openaiYields] = await Promise.all([
    geminiApiKey ? fetchYieldsFromGemini(geminiApiKey) : Promise.resolve(null),
    openaiApiKey ? fetchYieldsFromOpenAI(openaiApiKey) : Promise.resolve(null),
  ]);

  console.log(`Yield sources: Gemini=${geminiYields?.length || 0}, OpenAI=${openaiYields?.length || 0}`);

  // Compute consensus from both sources
  return computeYieldConsensus(geminiYields, openaiYields, targetDate);
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

**[Two-Word Phrase].** [6-8 sentences capturing the prevailing tone in detail. Be specific about what drove sentiment. Discuss the key narrative that dominated trading. Mention any notable shifts in risk appetite or positioning. Touch on how different regions or asset classes reflected the mood. Provide context on whether this continues a recent trend or represents a shift.]

---

## Key Cross-Asset Moves

**Equities:**

*[One italic sentence summarizing the equity theme]*

• The **U.S.** [USE VERIFIED S&P 500, Nasdaq, Dow, and Russell 2000 figures]. [Context on sector rotation]. Notable movers: [2-3 significant US single-stock moves with brief context - e.g., earnings, guidance, analyst actions].
• **European** equities [USE VERIFIED Euro Stoxx, DAX, and FTSE figures with context]. Notable movers: [1-2 significant European single-stock moves - look for major names like ASML, LVMH, SAP, Shell, Novo Nordisk, etc. with context on why they moved].
• In **Asia**, [USE VERIFIED Nikkei and Hang Seng figures with context]. Notable movers: [1-2 significant Asian single-stock moves - look for major names like Toyota, Sony, Samsung, Alibaba, Tencent, TSMC, etc. with context on why they moved].

---

**Fixed Income:**

*[One italic sentence summarizing the rates theme]*

• **U.S.** The 2-year yield [USE VERIFIED US 2-YEAR YIELD]. The 10-year yield [USE VERIFIED US 10-YEAR YIELD AND BPS CHANGE]. The 30-year [USE VERIFIED US 30-YEAR YIELD]. [Curve context - note 2s10s spread steepening/flattening and Fed expectations].
• **Europe** German Bunds [USE VERIFIED GERMAN BUND YIELDS if available]. UK Gilts [USE VERIFIED UK GILT YIELDS if available]. [Note divergence or convergence with US rates, ECB/BOE context].
• **Asia** JGBs [USE VERIFIED JGB YIELDS if available]. [Note BOJ policy context and any divergence from global rates].

---

**Commodities:**

*[One italic sentence summarizing the commodity theme]*

• **Gold** [USE VERIFIED GOLD FIGURE with context].
• **Oil** [USE VERIFIED WTI/BRENT FIGURES with context].
• **Copper** [USE VERIFIED COPPER FIGURE with context - note its role as economic bellwether].

---

**Currencies:**

*[One italic sentence summarizing the FX theme]*

• **U.S.** The Dollar Index [USE VERIFIED DXY FIGURE] [context on dollar strength/weakness and drivers].
• **Europe** EUR/USD [USE VERIFIED EUR/USD FIGURE]. GBP/USD [USE VERIFIED GBP/USD FIGURE]. [Note any divergence between EUR and GBP, ECB/BOE context].
• **Asia** USD/JPY [USE VERIFIED USD/JPY FIGURE]. [Context on yen dynamics, BOJ policy, carry trade flows].

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

**[A grounded observation that synthesizes the day's key theme].** [3-4 sentences that leave the reader with something meaningful to consider. Connect the dots between the various asset class moves and what they might signal about market psychology or positioning. Offer a forward-looking perspective without making predictions — frame it as what to watch or what questions remain unanswered. End with a thought that encourages the reader to think critically about the narrative versus the data.]

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
