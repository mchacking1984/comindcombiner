# Morning Pulse Prompt Generator

Generates tailored deep research prompts for ChatGPT, Gemini, and Claude with verified market data embedded.

## The Problem This Solves

When asking LLMs to research market moves, they often hallucinate numbers. By fetching verified data first and including it in the prompts, the LLMs can focus on **analysis and narrative** rather than data gathering.

## How It Works

1. **Fetch Verified Data**: Downloads closing prices from 5 sources:
   - Yahoo Finance (equities, commodities, FX)
   - CoinGecko (crypto)
   - FRED (Treasury yields)
   - Frankfurter/ECB (FX rates)
   
2. **Generate Tailored Prompts**: Creates three different prompts, each with:
   - The verified market data embedded
   - Instructions NOT to re-report these numbers
   - A specific analytical focus based on the LLM's strengths

3. **Different Focus Per LLM**:

   | LLM | Focus Area | Why |
   |-----|------------|-----|
   | **ChatGPT** | News narrative, events, single stocks | Best web search, good at "what happened" |
   | **Gemini** | Cross-asset flows, quantitative analysis | Strong on data patterns, transmission mechanisms |
   | **Claude** | Regime analysis, non-consensus takes | Best at nuanced reasoning, contrarian thinking |

## Assets Covered

- **Equities**: S&P 500, Nasdaq, Dow, Euro Stoxx 50, Nikkei 225, FTSE 100
- **Fixed Income**: US 2Y, 10Y, 30Y yields
- **Commodities**: Gold, Silver, WTI, Brent, Copper, Natural Gas
- **Currencies**: DXY, EUR/USD, GBP/USD, USD/JPY, USD/CNH
- **Digital Assets**: Bitcoin, Ethereum

## Deployment

### Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pulse-prompt-generator.git
git push -u origin main
```

### Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and import your repository
2. Click "Deploy" (no environment variables needed for this app)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Workflow

1. Open the Prompt Generator
2. Select the trading date (defaults to yesterday)
3. Click "Fetch Market Data"
4. Review the verified data
5. Copy the ChatGPT prompt → Paste into ChatGPT Deep Research
6. Copy the Gemini prompt → Paste into Gemini Deep Research
7. Copy the Claude prompt → Paste into Claude
8. Use the three outputs in the Morning Pulse Consolidator

## Why This Is Better

| Before | After |
|--------|-------|
| LLMs guess at numbers | Numbers are verified before LLMs see them |
| All 3 LLMs do the same job | Each focuses on their strength |
| Consolidator fact-checks | Consolidator just synthesizes |
| Errors in core data | Core data guaranteed correct |
