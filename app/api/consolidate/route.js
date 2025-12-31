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

CONTEXT ON SOURCES:
Each LLM was given identical verified market data but asked to approach the analysis differently:
- **ChatGPT** tends to surface news events, headlines, and single-stock moves well
- **Gemini** tends to be strong on quantitative relationships and cross-asset transmission
- **Claude** tends to offer regime-level thinking and non-consensus interpretation

Use this as a guide, not a strict rule. Draw insights from whichever source has the best take on any given point. Blend perspectives where they complement each other. If sources disagree on interpretation, use your judgment on which analysis is more compelling — or note the tension if it's informative.

CRITICAL: All three sources were given identical verified market data. The numbers should be consistent. Focus on synthesizing the ANALYSIS, not fact-checking figures.

TONE AND STYLE GUIDELINES:
- Be analytical and precise, not dramatic
- Let the data speak — avoid hyperbole like "plunged," "soared," "stunning," "remarkable"
- Use measured language: "fell," "rose," "declined," "gained," "notable," "significant"
- Avoid grand proclamations about regime shifts unless the evidence is genuinely compelling
- It's okay to say "modestly," "slightly," or "marginally" when moves are small
- Present multiple interpretations where reasonable rather than false certainty
- Be intellectually honest about what we know vs. what we're inferring
- The goal is INSIGHT, not excitement — help the reader understand, not hype them

Your output must follow this format:

---

## Market Mood

**[Two-Word Phrase].** [3-4 sentences capturing the prevailing tone. Be specific about what drove sentiment. Avoid vague generalities.]

---

## Key Cross-Asset Moves

**Equities:**

*[One italic sentence summarizing the equity theme]*

• The **U.S.** [S&P 500 and Nasdaq moves with specific figures and context]. [Notable single-stock moves if material].
• **European** equities [moves with context].
• In **Asia**, [moves with context].

---

**Fixed Income:**

*[One italic sentence summarizing the rates theme]*

• The **U.S.** 10-year yield [level and BASIS POINT change, e.g., "+2.5 bps to 4.58%"]. [Curve context].
• [Other notable yield moves].

---

**Commodities:**

*[One italic sentence summarizing the commodity theme]*

• **Gold** [price and % move with driver].
• **Oil** [WTI/Brent with context].
• [Other notable commodities if material].

---

**Currencies:**

*[One italic sentence summarizing the FX theme]*

• The **Dollar Index** [level and move with context].
• Key pairs: [EUR/USD, USD/JPY, etc. with context].

---

**Digital Assets:**

*[One italic sentence on crypto sentiment]*

• **Bitcoin** [price and move with context].
• **Ethereum** [if notably different from BTC].

---

## The Real Driver

**[One clear sentence identifying the primary force shaping markets].**

[2-3 paragraphs explaining the transmission mechanism. Be specific about cause and effect. Acknowledge uncertainty where it exists. If multiple factors were at play, say so rather than forcing a single narrative.]

---

## What We've Learned

• **[Concise insight].** [Supporting evidence — be specific, include data where possible].
• **[Concise insight].** [Supporting evidence].
• **[Concise insight].** [Supporting evidence].
• **[Concise insight].** [Supporting evidence].
• **[Concise insight].** [Supporting evidence].

[These should be genuinely non-obvious observations. Avoid restating what happened — focus on what it MEANS. If an insight is speculative, frame it appropriately.]

---

## Final Thought

**[A grounded, thought-provoking observation].** [1-2 sentences that leave the reader with something to consider, without overpromising what tomorrow holds.]

---

OUTPUT ONLY the formatted content starting with "## Market Mood". Do not include any preamble or meta-commentary.`;


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

Source context (use as a guide, not a strict assignment):
- ChatGPT: tends to be good at surfacing news events and single-stock moves
- Gemini: tends to be strong on quantitative cross-asset analysis
- Claude: tends to offer regime-level and non-consensus interpretation

Draw from all three where their analysis is strongest. Blend perspectives thoughtfully.

IMPORTANT: Keep the tone measured and analytical. Avoid hyperbole. Let the data and logic speak for themselves. If a move was modest, say so. If there's uncertainty, acknowledge it.

=== CHATGPT OUTPUT ===
${chatgptInput || 'Not provided'}

=== GEMINI OUTPUT ===
${geminiInput || 'Not provided'}

=== CLAUDE OUTPUT ===
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
