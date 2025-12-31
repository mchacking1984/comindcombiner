import { NextResponse } from 'next/server';

// ============================================
// SIMPLIFIED CONSOLIDATOR - NEW WORKFLOW
// ============================================
// The Prompt Generator already:
// 1. Fetched verified market data
// 2. Embedded it in each LLM's prompt
// 3. Gave each LLM a specific analytical focus
//
// So now we just need to synthesize the outputs,
// understanding what each LLM was asked to focus on.
// ============================================

const CONSOLIDATION_PROMPT = `You are synthesizing three deep research reports on overnight market developments into a single "Co-Mind Morning Pulse" brief.

IMPORTANT CONTEXT - Each LLM was given the SAME verified market data but a DIFFERENT analytical focus:

1. **ChatGPT** focused on: News narrative, events, single-stock moves, sector rotations
   → Use ChatGPT's output for: What happened, key headlines, individual stock moves not in the core data

2. **Gemini** focused on: Quantitative analysis, cross-asset flows, transmission mechanisms  
   → Use Gemini's output for: How moves propagated across assets, correlations, flow dynamics

3. **Claude** focused on: Regime analysis, non-consensus interpretation, what everyone is missing
   → Use Claude's output for: The Real Driver section, contrarian insights, "What We've Learned"

CRITICAL: All three sources were given identical verified market data (prices, % changes). 
- The numbers should be consistent across sources
- If there's any numerical discrepancy, it's likely a rounding difference - use the most precise figure
- Focus on SYNTHESIZING THE ANALYSIS, not fact-checking

Your output must EXACTLY match this format and tone:

---

## Market Mood

**[Two-Word Phrase].** [3-4 sentences of deep macro analysis. Synthesize the psychological read from all three sources. Be bold and conviction-driven.]

---

## Key Cross-Asset Moves

**Equities:**

*[One italic sentence summarizing the equity theme]*

* The **U.S.** [S&P 500 and Nasdaq moves with context]. *[Include notable single-stock moves that ChatGPT surfaced].*
* **European** equities [moves with context].
* In **Asia**, [moves with context].

---

**Fixed Income:**

*[One italic sentence summarizing the rates theme]*

* The **U.S.** 10-year yield [level and BASIS POINT change, e.g., "+2.5 bps to 4.58%"]. [Curve context from Gemini].
* In **Europe**, [German and UK yields].
* **Credit** markets [spread behavior if mentioned].

---

**Commodities:**

*[One italic sentence summarizing the commodity theme]*

* **Gold** [price and % move with driver].
* **Oil** [WTI/Brent with context].
* **Copper** [if significant, or other notable commodities].

---

**Currencies:**

*[One italic sentence summarizing the FX theme]*

* The **Dollar Index** [level and context].
* Key pairs: [EUR/USD, GBP/USD, USD/JPY with context].
* [Any notable EM moves ChatGPT surfaced].

---

**Digital Assets:**

*[One italic sentence summarizing crypto sentiment]*

* **Bitcoin** [price and move with context].
* **Ethereum** [price and move].

---

## The Real Driver

**[Bold one-sentence thesis - lean heavily on Claude's regime analysis here].**

[2-3 paragraphs explaining the transmission mechanism. Draw from Gemini's cross-asset flow analysis and Claude's interpretation. Be specific about cause and effect.]

---

## What We've Learned

* **[Bold insight].** [Evidence - prioritize Claude's non-consensus takes here].
* **[Bold insight].** [Evidence].
* **[Bold insight].** [Evidence].
* **[Bold insight].** [Evidence].
* **[Bold insight].** [Evidence].

---

## Final Thought

**[Bold provocative phrase].** [2-3 sentences with a memorable takeaway. Synthesize the forward-looking views.]

---

STYLE REQUIREMENTS:
1. Sophisticated institutional tone - no hedging, no "may" or "could"
2. Every number must be specific
3. Use "bps" for yield changes, not percentages
4. The "What We've Learned" bullets must be NON-OBVIOUS insights
5. Output ONLY the formatted content starting with "## Market Mood"`;

async function callGemini(systemPrompt, userPrompt, apiKey, useThinking = false) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 12000,
    },
  };

  if (useThinking) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 10000 };
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
    const { step, formattedDate } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY environment variable not configured' },
        { status: 500 }
      );
    }

    if (step === 'consolidate') {
      const { chatgptInput, geminiInput, claudeInput } = body;

      const userPrompt = `Synthesize these three research outputs into the Co-Mind Morning Pulse for ${formattedDate}.

Remember:
- ChatGPT focused on NEWS NARRATIVE and EVENTS (use for single-stock moves, headlines)
- Gemini focused on QUANTITATIVE FLOWS (use for cross-asset transmission)
- Claude focused on REGIME ANALYSIS (use for "Real Driver" and "What We've Learned")

=== CHATGPT OUTPUT (News & Events Focus) ===
${chatgptInput || 'Not provided'}

=== GEMINI OUTPUT (Quantitative & Flows Focus) ===
${geminiInput || 'Not provided'}

=== CLAUDE OUTPUT (Regime & Non-Consensus Focus) ===
${claudeInput || 'Not provided'}

Synthesize into a single Morning Pulse. Output ONLY the formatted content starting with "## Market Mood".`;

      const content = await callGemini(
        CONSOLIDATION_PROMPT,
        userPrompt,
        apiKey,
        true // Use thinking for quality synthesis
      );

      if (!content) {
        return NextResponse.json({ error: 'No content generated' }, { status: 500 });
      }

      return NextResponse.json({ content });

    } else {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
