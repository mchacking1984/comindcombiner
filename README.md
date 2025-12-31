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

1. **Input**: Paste deep research outputs from ChatGPT, Gemini, and Claude
2. **Processing**: Gemini 2.5 Pro consolidates the three sources using:
   - Majority rule when 2 of 3 sources agree
   - Google Search with date-specific queries when all 3 differ
3. **Output**: Formatted Morning Pulse ready to copy into Substack

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Gemini 2.5 Pro API with Google Search grounding
- Vercel for deployment
