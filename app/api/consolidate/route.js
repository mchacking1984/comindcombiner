import { NextResponse } from 'next/server';

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

const COMPARISON_PROMPT = `You are a financial data analyst. Compare the extracted data from three sources and identify the consensus value for each metric.

RULES:
1. If 2 or 3 sources agree (within 0.5% for prices, within 0.1% for percentage changes), use that value as CONSENSUS
2. If all 3 sources differ significantly, mark as CONFLICT - needs verification
3. If only 1 source has data, mark as SINGLE SOURCE
4. Pay special attention to DIRECTION (up vs down) - if sources disagree on direction, this is a critical conflict

Output format for each metric:
[Metric]: [CONSENSUS/CONFLICT/SINGLE SOURCE] - Value: [value] - Sources agreeing: [list]

After listing all metrics, provide a SUMMARY of conflicts that need verification.`;

const CONSOLIDATION_PROMPT = `You are synthesizing three deep research reports on overnight market developments into a single "Co-Mind Morning Pulse" brief.

You have been provided with:
1. The raw research from three sources (ChatGPT, Gemini, Claude)
2. A data comparison showing consensus values and conflicts

CRITICAL: For numerical data, you MUST use the CONSENSUS values from the data comparison. Do NOT use values from sources that were identified as outliers.

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

    if (step === 'extract') {
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
      // Step 2: Compare extracted data from all sources
      const { chatgptData, geminiData, claudeData } = body;

      const comparisonPrompt = `Compare the extracted data from these three sources and identify consensus values:

=== CHATGPT DATA ===
${chatgptData}

=== GEMINI DATA ===
${geminiData}

=== CLAUDE DATA ===
${claudeData}

Identify CONSENSUS values (where 2+ sources agree) and CONFLICTS (where all 3 differ or direction disagrees).`;

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
