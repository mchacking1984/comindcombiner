# Morning Pulse Consolidator

Synthesizes research outputs from ChatGPT, Gemini, and Claude into a formatted "Co-Mind Morning Pulse" Substack post.

## Two-Tool Workflow

This app is part of a two-tool system:

1. **Prompt Generator** (separate app) - Fetches verified market data and generates tailored prompts
2. **This Consolidator** - Synthesizes the LLM outputs into the final Morning Pulse

## How It Works

The Prompt Generator provides verified data to the LLMs, but they sometimes hallucinate anyway. This consolidator:

1. **Re-fetches verified market data** from Yahoo Finance for the target date
2. **Injects it directly** into the synthesis prompt
3. **Instructs Gemini** to use the verified figures and ignore incorrect numbers from LLM outputs
4. **Synthesizes** the narrative and analysis from all three sources

This ensures Bitcoin, S&P 500, yields, etc. are always correct in the final output.

### Each LLM's Role

| LLM | Focus | Used For |
|-----|-------|----------|
| **ChatGPT** | News narrative, events, single-stock moves | "What happened", headlines, sector moves |
| **Gemini** | Quantitative analysis, cross-asset flows | Transmission mechanisms, correlations |
| **Claude** | Regime analysis, non-consensus takes | "The Real Driver", "What We've Learned" |

The consolidator knows these roles and weights each source's contributions accordingly.

## Usage

1. Use the **Prompt Generator** to create tailored prompts with verified data
2. Run each prompt in ChatGPT, Gemini, and Claude deep research
3. Paste the outputs into this consolidator
4. Click "Generate Morning Pulse"
5. Copy to Substack and publish

## Setup

### Environment Variables

Create a `.env.local` file:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Deploy on Vercel

1. Push to GitHub
2. Import to Vercel
3. Add `GEMINI_API_KEY` environment variable
4. Deploy

### Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Performance

| Metric | Old Multi-Step | New Approach |
|--------|----------------|--------------|
| Steps | 5 | 2 (fetch + synthesize) |
| Gemini API calls | 6 | 1 |
| Time | 2-4 minutes | ~45-90 seconds |
| Data accuracy | Consensus-based | Direct injection |

The numbers are guaranteed correct because verified data is injected directly into the synthesis prompt.

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Gemini 2.5 Pro API with extended thinking
- Vercel for deployment
