# Morning Pulse Consolidator

A web app that consolidates deep research from ChatGPT, Gemini, and Claude into a formatted "Co-Mind Morning Pulse" Substack post.

## Features

- Paste research outputs from three AI sources
- Gemini 2.5 Pro synthesizes and resolves data conflicts
- Google Search grounding for accurate market data
- Copy formatted output directly to Substack

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/morning-pulse-consolidator.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New Project"
3. Import your `morning-pulse-consolidator` repository
4. Before deploying, add your environment variable:
   - Click "Environment Variables"
   - Add `GEMINI_API_KEY` with your API key from [Google AI Studio](https://aistudio.google.com/apikey)
5. Click "Deploy"

### 3. Get Your Gemini API Key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key and add it to Vercel's environment variables

## Local Development

```bash
# Install dependencies
npm install

# Create .env.local with your API key
cp .env.example .env.local
# Edit .env.local and add your GEMINI_API_KEY

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## How It Works

1. **Fetch Verified Data** (Multi-Source): Downloads closing prices from 5 sources and determines consensus:
   
   | Source | Data Coverage | Why |
   |--------|--------------|-----|
   | **Yahoo Finance Chart** | Equities, Commodities, Crypto | Comprehensive, reliable |
   | **Yahoo Finance Quote** | Cross-verification | Different endpoint for validation |
   | **CoinGecko** | Bitcoin, Ethereum | Industry standard for crypto |
   | **Frankfurter (ECB)** | EUR, GBP, JPY rates | Official European Central Bank data |
   | **FRED** | Treasury yields | Official Federal Reserve data |
   
   **Consensus Logic:**
   - If sources agree within 1% (2% for crypto): High confidence ✓✓
   - If sources disagree: Priority given to official sources (FRED, ECB)
   - Output shows which sources agreed and confidence level

2. **Extract LLM Data** (parallel): Extracts numerical data from each LLM source into structured format

3. **Compare Against Verified** (with thinking): Compares LLM values against multi-source consensus, flags inaccurate sources

4. **Synthesize** (with thinking): Generates Morning Pulse using verified data for numbers + LLM sources for narrative/analysis

5. **Final Verification**: Light verification pass to catch any remaining issues

This ensures accuracy even when LLM sources hallucinate - verified market data from multiple official sources is always used.

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Gemini 2.5 Pro API with Google Search grounding
- Vercel for deployment
