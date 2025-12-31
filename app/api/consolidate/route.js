import { NextResponse } from 'next/server';

const CONSOLIDATION_PROMPT = `You are synthesizing three deep research reports on overnight market developments into a single "Co-Mind Morning Pulse" brief.

CRITICAL DATA CONFLICT RESOLUTION:
When the three sources provide different values for the same metric (e.g., S&P 500 level, gold price, yield levels):
1. If TWO sources agree and one differs → Use the majority value
2. If ALL THREE differ → Use Google Search to find the correct value. IMPORTANT: Always include the specific date in your search query (e.g., "S&P 500 close December 30 2025", "Tesla stock price December 30 2025", "Bitcoin price December 30 2025"). This ensures you get the correct historical close, not current/intraday data.
3. Always prefer the most specific number over rounded approximations
4. Do NOT search if two or more sources agree - trust the majority
5. Flag any significant discrepancies in your reasoning but do NOT mention conflicts in the final output

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
1. Synthesize insights from ALL THREE sources - don't favor one over others
2. Use majority rule for conflicting data; search web if all three differ
3. Maintain the EXACT formatting with horizontal rules (---) between sections
4. Use **bold** for emphasis and *italics* for summary lines exactly as shown
5. Keep the sophisticated institutional tone - no hedging, no "may" or "could"
6. Every number must be specific (not "around" or "approximately" unless source says so)
7. The "What We've Learned" bullets must be NON-OBVIOUS insights, not recaps
8. Match the length of the example - not shorter, not significantly longer
9. Output ONLY the formatted content - no preamble, no "Here's the consolidated report"
10. NEVER include your reasoning, search commentary, or thinking process in the output. No "Based on the search results...", "Let me search...", "I can see...", etc. Your output must start DIRECTLY with "## Market Mood" and contain ONLY the Morning Pulse content.`;

export async function POST(request) {
  try {
    const { chatgptInput, geminiInput, claudeInput, formattedDate } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY environment variable not configured' },
        { status: 500 }
      );
    }

    const userPrompt = `Consolidate the following deep research reports into the Co-Mind Morning Pulse for ${formattedDate}.

${chatgptInput ? `=== CHATGPT DEEP RESEARCH ===
${chatgptInput}

` : ''}${geminiInput ? `=== GEMINI DEEP RESEARCH ===
${geminiInput}

` : ''}${claudeInput ? `=== CLAUDE DEEP RESEARCH ===
${claudeInput}

` : ''}
IMPORTANT: For conflicting numerical data between sources:
- Use majority rule if 2 of 3 sources agree (do NOT search)
- Only use Google Search if all 3 sources differ - and include the date "${formattedDate}" in your search query to get the correct close price

Synthesize these sources into a single Morning Pulse following the EXACT format specified. Output ONLY the formatted Morning Pulse content starting with "## Market Mood" - no preamble or explanation.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          systemInstruction: {
            parts: [{ text: CONSOLIDATION_PROMPT }],
          },
          tools: [
            {
              googleSearch: {},
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error?.message || `Gemini API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || 'Gemini API error' },
        { status: 500 }
      );
    }

    // Extract text from Gemini response
    let content = '';
    if (data.candidates && data.candidates[0]?.content?.parts) {
      content = data.candidates[0].content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('\n\n');
    }

    if (!content) {
      return NextResponse.json(
        { error: 'No content generated' },
        { status: 500 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Consolidation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
