# Morning Pulse Consolidator

Synthesizes research outputs from ChatGPT, Gemini, and Claude into a formatted "Co-Mind Morning Pulse" Substack post.

## Two-Tool Workflow

This app is part of a two-tool system:

1. **Prompt Generator** (separate app) - Fetches verified market data and generates tailored prompts
2. **This Consolidator** - Synthesizes the LLM outputs into the final Morning Pulse

## How It Works

The Prompt Generator already verified market data and embedded it in each prompt, so this consolidator only needs to **synthesize** — no fact-checking required.

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

| Metric | Old Workflow | New Workflow |
|--------|--------------|--------------|
| Steps | 5 | 1 |
| API calls | 6 | 1 |
| Time | 2-4 minutes | ~30-60 seconds |
| Fact-checking | Required | Not needed |

The numbers are already correct because the Prompt Generator verified them upstream.

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Gemini 2.5 Pro API with extended thinking
- Vercel for deployment
