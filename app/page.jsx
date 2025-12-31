'use client';

import { useState } from 'react';

export default function Home() {
  const getYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  const [targetDate, setTargetDate] = useState(getYesterday());
  const [marketData, setMarketData] = useState(null);
  const [formattedData, setFormattedData] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState(null);
  const [copied, setCopied] = useState({ chatgpt: false, gemini: false, claude: false });
  
  // Manual yield inputs for data that's hard to fetch automatically
  const [manualYields, setManualYields] = useState({
    us2y: '',
    de10y: '',
    uk10y: '',
    jp10y: '',
  });

  const formatDisplayDate = (dateStr) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setWarnings(null);
    setMarketData(null);
    setFormattedData('');

    try {
      const response = await fetch('/api/fetch-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      // Merge manual yields into the data
      const mergedData = { ...result.marketData };
      
      // Add manual yields if provided
      if (manualYields.us2y && !isNaN(parseFloat(manualYields.us2y))) {
        const val = parseFloat(manualYields.us2y);
        mergedData['US 2-Year Yield'] = {
          close: val,
          previousClose: null,
          bpsChange: null,
          date: targetDate,
          category: 'FIXED INCOME',
          isYield: true,
          source: 'Manual',
          confidence: 'manual',
        };
      }
      
      if (manualYields.de10y && !isNaN(parseFloat(manualYields.de10y))) {
        const val = parseFloat(manualYields.de10y);
        mergedData['German 10-Year Yield'] = {
          close: val,
          previousClose: null,
          bpsChange: null,
          date: targetDate,
          category: 'FIXED INCOME',
          isYield: true,
          source: 'Manual',
          confidence: 'manual',
        };
      }
      
      if (manualYields.uk10y && !isNaN(parseFloat(manualYields.uk10y))) {
        const val = parseFloat(manualYields.uk10y);
        mergedData['UK 10-Year Yield'] = {
          close: val,
          previousClose: null,
          bpsChange: null,
          date: targetDate,
          category: 'FIXED INCOME',
          isYield: true,
          source: 'Manual',
          confidence: 'manual',
        };
      }
      
      if (manualYields.jp10y && !isNaN(parseFloat(manualYields.jp10y))) {
        const val = parseFloat(manualYields.jp10y);
        mergedData['Japan 10-Year Yield'] = {
          close: val,
          previousClose: null,
          bpsChange: null,
          date: targetDate,
          category: 'FIXED INCOME',
          isYield: true,
          source: 'Manual',
          confidence: 'manual',
        };
      }

      setMarketData(mergedData);
      
      // Regenerate formatted data with merged yields
      const formatted = formatDataForDisplay(mergedData, targetDate);
      setFormattedData(formatted);
      
      // Filter out warnings for yields that were manually entered
      const remainingWarnings = result.errors?.filter(err => {
        if (err.includes('US 2-Year') && manualYields.us2y) return false;
        if (err.includes('German') && manualYields.de10y) return false;
        if (err.includes('UK 10-Year') && manualYields.uk10y) return false;
        if (err.includes('Japan') && manualYields.jp10y) return false;
        return true;
      });
      
      if (remainingWarnings && remainingWarnings.length > 0) {
        setWarnings(remainingWarnings);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Format data for prompt (client-side version for merged data)
  const formatDataForDisplay = (data, date) => {
    let output = `VERIFIED MARKET DATA FOR ${date}\n`;
    output += `(Multi-source consensus from Yahoo Finance, CoinGecko, FRED, ECB + manual inputs)\n\n`;
    
    const categories = ['EQUITIES', 'FIXED INCOME', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS'];
    
    for (const category of categories) {
      output += `${category}:\n`;
      
      for (const [assetName, assetData] of Object.entries(data)) {
        if (assetData.category !== category) continue;
        
        let priceStr;
        let changeStr;
        let direction;
        
        if (assetData.isYield) {
          priceStr = assetData.close.toFixed(3) + '%';
          if (assetData.bpsChange !== null && assetData.bpsChange !== undefined) {
            direction = assetData.bpsChange >= 0 ? '↑' : '↓';
            changeStr = `${assetData.bpsChange > 0 ? '+' : ''}${assetData.bpsChange.toFixed(1)} bps`;
          } else {
            direction = '';
            changeStr = 'level only';
          }
        } else {
          direction = assetData.percentChange >= 0 ? '↑' : '↓';
          changeStr = assetData.percentChange !== null
            ? `${assetData.percentChange > 0 ? '+' : ''}${assetData.percentChange.toFixed(2)}%`
            : 'N/A';
          
          if (assetName.includes('/')) {
            priceStr = assetData.close.toFixed(4);
          } else if (assetData.close > 10000) {
            priceStr = assetData.close.toLocaleString('en-US', { maximumFractionDigits: 0 });
          } else {
            priceStr = assetData.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
        }
        
        output += `  ${assetName}: ${priceStr} (${changeStr} ${direction})\n`;
      }
      output += '\n';
    }
    
    return output;
  };

  const displayDate = formatDisplayDate(targetDate);
  
  // Calculate the next day's date for the prompt (analysis window ends 6am London on this day)
  const endDate = new Date(targetDate + 'T12:00:00Z');
  endDate.setDate(endDate.getDate() + 1);
  const endTimeStr = endDate.toLocaleDateString('en-US', { 
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Base prompt components
  const baseObjective = `Objective: Conduct deep, cross-asset macro research covering the last 24 hours of global market activity ending at 6am London time on ${endTimeStr}. The goal is to generate the raw intelligence and analytical foundation for the Co-Mind Morning Pulse, a concise yet deeply reasoned macro-tactical brief for a professional investor.`;

  const baseInstructions = `Instructions:
- The verified market data below is CONFIRMED ACCURATE. Use these exact figures - do not look them up again or report different numbers.
- Focus your research on: (1) WHY these moves occurred, (2) additional notable moves NOT in the verified data (single stocks, sectors, EM currencies, other commodities, etc.)
- IMPORTANT: If international yields (German Bund, UK Gilt, Japan JGB) are not in the verified data below, research their current levels and daily changes via web search.
- Apply deep reasoning, not just summarization. Interpret why moves occurred, not just what happened.
- Prioritize signal over noise. No forecasts or recommendations; just truth distilled.`;

  const baseTone = `Tone and Style:
- Analytical, precise, and professional
- Let the data speak — avoid hyperbole like "plunged," "soared," "stunning," "remarkable"
- Use measured language: "fell," "rose," "declined," "gained," "notable," "significant"
- It's okay to say "modestly," "slightly," or "marginally" when moves are small
- Avoid grand proclamations unless the evidence is genuinely compelling
- Be intellectually honest about what we know vs. what we're inferring
- Seek underlying truth and reflexivity — what the market is revealing about itself
- The goal is insight, not excitement — help the reader understand, not hype them`;

  const baseStructure = `Structure your analysis in the following sections (use markdown headings):

1. Market Mood
One tight paragraph capturing the prevailing tone of global markets, risk appetite, volatility, conviction, dominant psychology, and any observable inflection in sentiment or narrative.

2. Key Cross-Asset Moves
List concise bullet points by asset class:

Equities
- Use the verified index data provided. Add context on drivers.
- Identify key sector rotations or notable divergences NOT in the verified data.
- Surface any large single-stock moves (earnings, news) with specific percentages.

Fixed Income
- Use the verified yield data provided.
- Add context on curve shape, real yields, credit spreads, or breakevens if relevant.

Commodities
- Use the verified commodity data provided.
- Add context on drivers (supply, demand, geopolitical).

Currencies
- Use the verified FX data provided.
- Add any notable EM currency moves not in the verified data.

Digital Assets
- Use the verified crypto data provided.
- Analyse Bitcoin and Ethereum separately — they often have different drivers.
- Consider: macro correlation (risk-on/off), ETF flows, on-chain metrics, regulatory developments, altcoin divergence.
- Note any significant divergence between BTC and ETH, or between crypto and traditional risk assets.

3. The Real Driver
Identify the single most important force shaping markets in the past 24h. This could be a data release, policy communication, liquidity dynamic, positioning event, or narrative pivot. Explain why it mattered, how it propagated through assets, and what it reveals about underlying regime conditions.

4. What We've Learned
Distill 3-5 key insights about the current macro landscape — structural, behavioral, or narrative. Each bullet should teach the reader something genuinely non-obvious. Keep bullets concise with data to support claims. Rank by novelty/importance but don't show scores. If an insight is speculative, frame it appropriately rather than asserting false certainty.

5. Final Thought
One short paragraph — clear, grounded, insight-rich — capturing the deeper meaning of the day's market behavior. Avoid dramatic predictions.`;

  const baseDeliverable = `Deliverable: A coherent, insight-dense but concise daily macro brief (readable in 2-3 minutes). No links to sources in output.`;

  // ChatGPT-specific prompt (focuses on news/narrative)
  const chatgptPrompt = `${baseObjective}

YOUR SPECIFIC FOCUS: News narrative and event synthesis. You excel at web search and summarizing what happened. Focus on surfacing the key news events, data releases, and headlines that drove markets. Find the notable single-stock moves and sector rotations.

${baseInstructions}

${formattedData}

${baseTone}

${baseStructure}

${baseDeliverable}`;

  // Gemini-specific prompt (focuses on quantitative/flows)
  const geminiPrompt = `${baseObjective}

YOUR SPECIFIC FOCUS: Quantitative analysis and cross-asset flows. Focus on the transmission mechanisms between asset classes. How did moves in yields affect equities? How did dollar strength propagate through commodities? How did risk sentiment transmit to crypto? Look for positioning signals, unusual correlations, flow dynamics, and ETF/fund flow data where available.

${baseInstructions}

${formattedData}

${baseTone}

${baseStructure}

${baseDeliverable}`;

  // Claude-specific prompt (focuses on regime/non-consensus)
  const claudePrompt = `${baseObjective}

YOUR SPECIFIC FOCUS: Regime analysis and non-consensus interpretation. Go beyond the obvious narrative. What is everyone missing? What does today's price action reveal about underlying market structure, positioning, or psychology that isn't being discussed? Challenge the consensus view where warranted.

${baseInstructions}

${formattedData}

${baseTone}

${baseStructure}

ADDITIONAL FOCUS FOR "WHAT WE'VE LEARNED":
- What is the prevailing narrative on today's moves? Is there reason to question it?
- What positioning or structural dynamics might be underappreciated?
- What does today's action suggest about the current market regime?
(Only challenge consensus where you have genuine reason to — don't be contrarian for its own sake.)

${baseDeliverable}`;

  const copyPrompt = async (platform, prompt) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(prev => ({ ...prev, [platform]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [platform]: false })), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const renderDataTable = () => {
    if (!marketData) return null;

    const categories = ['EQUITIES', 'FIXED INCOME', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS'];
    
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="bg-slate-700 px-4 py-3">
          <h3 className="font-semibold text-slate-200">Verified Market Data for {displayDate}</h3>
        </div>
        <div className="p-4 space-y-4">
          {categories.map(category => {
            const assets = Object.entries(marketData).filter(([_, data]) => data.category === category);
            if (assets.length === 0) return null;
            
            return (
              <div key={category}>
                <h4 className="text-sm font-medium text-slate-400 mb-2">{category}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {assets.map(([name, data]) => {
                    let changeStr;
                    let changeColor;
                    let arrow;
                    
                    if (data.isYield) {
                      // For yields, show basis points
                      const isUp = data.bpsChange >= 0;
                      changeColor = isUp ? 'text-green-400' : 'text-red-400';
                      arrow = isUp ? '↑' : '↓';
                      changeStr = data.bpsChange !== null && data.bpsChange !== undefined
                        ? `${data.bpsChange > 0 ? '+' : ''}${data.bpsChange.toFixed(1)} bps`
                        : 'N/A';
                    } else {
                      // For everything else, show percentage
                      const isUp = data.percentChange >= 0;
                      changeColor = isUp ? 'text-green-400' : 'text-red-400';
                      arrow = isUp ? '↑' : '↓';
                      changeStr = data.percentChange !== null
                        ? `${data.percentChange > 0 ? '+' : ''}${data.percentChange.toFixed(2)}%`
                        : 'N/A';
                    }
                    
                    let priceStr;
                    if (name.includes('Yield')) {
                      priceStr = data.close.toFixed(3) + '%';
                    } else if (name.includes('/')) {
                      priceStr = data.close.toFixed(4);
                    } else if (data.close > 10000) {
                      priceStr = data.close.toLocaleString('en-US', { maximumFractionDigits: 0 });
                    } else {
                      priceStr = data.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                    
                    return (
                      <div key={name} className="bg-slate-900/50 rounded px-3 py-2 flex justify-between items-center">
                        <span className="text-slate-300 text-sm">{name}</span>
                        <div className="text-right">
                          <span className="text-slate-200 text-sm font-medium">{priceStr}</span>
                          <span className={`ml-2 text-sm ${changeColor}`}>
                            {changeStr} {arrow}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPromptCard = (title, subtitle, prompt, platform, color) => (
    <div className={`bg-slate-800 rounded-lg border border-slate-700 overflow-hidden`}>
      <div className={`${color} px-4 py-3 flex items-center justify-between`}>
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-white/70">{subtitle}</p>
        </div>
        <button
          onClick={() => copyPrompt(platform, prompt)}
          className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
            copied[platform]
              ? 'bg-green-600 text-white'
              : 'bg-white/20 hover:bg-white/30 text-white'
          }`}
        >
          {copied[platform] ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Prompt
            </>
          )}
        </button>
      </div>
      <div className="p-4 max-h-64 overflow-auto">
        <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{prompt.slice(0, 500)}...</pre>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 border-b border-slate-700 pb-6">
          <h1 className="text-3xl font-bold">Morning Pulse Prompt Generator</h1>
          <p className="text-slate-400 mt-2">
            Fetch verified market data → Generate tailored prompts for ChatGPT, Gemini, and Claude
          </p>
        </div>

        {/* Step 1: Date Selection & Fetch */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-semibold">1</div>
            <h2 className="text-xl font-semibold">Select Date & Fetch Market Data</h2>
          </div>
          
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Trading Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                loading
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Fetching...
                </span>
              ) : (
                'Fetch Market Data'
              )}
            </button>
          </div>
          
          {/* Manual Yield Inputs */}
          <div className="mt-4 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
            <p className="text-sm font-medium text-slate-300 mb-3">
              Manual Yield Inputs <span className="text-slate-500 font-normal">(optional - enter yield levels from your preferred source)</span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">US 2-Year (%)</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="e.g. 4.25"
                  value={manualYields.us2y}
                  onChange={(e) => setManualYields(prev => ({ ...prev, us2y: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">German 10-Year (%)</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="e.g. 2.35"
                  value={manualYields.de10y}
                  onChange={(e) => setManualYields(prev => ({ ...prev, de10y: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">UK 10-Year (%)</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="e.g. 4.50"
                  value={manualYields.uk10y}
                  onChange={(e) => setManualYields(prev => ({ ...prev, uk10y: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Japan 10-Year (%)</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="e.g. 1.05"
                  value={manualYields.jp10y}
                  onChange={(e) => setManualYields(prev => ({ ...prev, jp10y: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Quick lookup: <a href="https://www.marketwatch.com/investing/bond/tmubmusd02y" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">US 2Y</a> • <a href="https://www.marketwatch.com/investing/bond/tmbmkde-10y" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">German 10Y</a> • <a href="https://www.marketwatch.com/investing/bond/tmbmkgb-10y" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">UK 10Y</a> • <a href="https://www.marketwatch.com/investing/bond/tmbmkjp-10y" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Japan 10Y</a>
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Warnings for missing data */}
        {warnings && warnings.length > 0 && (
          <div className="mb-6 bg-yellow-900/50 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg">
            <p className="font-medium">Some data unavailable</p>
            <ul className="text-sm mt-1 list-disc list-inside">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
            <p className="text-xs mt-2 text-yellow-300">Data sources may have delayed updates. The LLMs can still research these values via web search.</p>
          </div>
        )}

        {/* Step 2: View Data */}
        {marketData && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center font-semibold">2</div>
              <h2 className="text-xl font-semibold">Review Verified Data</h2>
            </div>
            {renderDataTable()}
          </div>
        )}

        {/* Step 3: Copy Prompts */}
        {marketData && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-semibold">3</div>
              <h2 className="text-xl font-semibold">Copy Prompts to Each LLM</h2>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Each prompt includes the verified market data and a specific analytical focus. Copy and paste into the respective LLM's deep research feature.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {renderPromptCard(
                'ChatGPT',
                'Focus: News events & headlines',
                chatgptPrompt,
                'chatgpt',
                'bg-emerald-700'
              )}
              {renderPromptCard(
                'Gemini',
                'Focus: Quantitative & cross-asset flows',
                geminiPrompt,
                'gemini',
                'bg-blue-700'
              )}
              {renderPromptCard(
                'Claude',
                'Focus: Regime analysis & interpretation',
                claudePrompt,
                'claude',
                'bg-orange-700'
              )}
            </div>
          </div>
        )}

        {/* Instructions when no data */}
        {!marketData && !loading && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">How to Use</h3>
            <ol className="space-y-3 text-slate-300">
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">1</span>
                <span>Select the trading date you want to analyze (defaults to yesterday)</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">2</span>
                <span>Click "Fetch Market Data" to pull verified closing prices from multiple sources</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">3</span>
                <span>Review the data to confirm it looks correct</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">4</span>
                <span>Copy each tailored prompt into ChatGPT, Gemini, and Claude's deep research</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">5</span>
                <span>Use the outputs in the Morning Pulse Consolidator</span>
              </li>
            </ol>
            
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Why Different Prompts?</h4>
              <ul className="text-sm text-slate-400 space-y-2">
                <li><strong className="text-emerald-400">ChatGPT:</strong> Strong at web search and news synthesis. Focuses on surfacing events and single-stock moves.</li>
                <li><strong className="text-blue-400">Gemini:</strong> Good at data patterns and quantitative analysis. Focuses on cross-asset flows and transmission.</li>
                <li><strong className="text-orange-400">Claude:</strong> Strong at nuanced reasoning. Focuses on regime interpretation and non-obvious insights.</li>
              </ul>
              <p className="text-xs text-slate-500 mt-3">
                All prompts include guidance to avoid hyperbole and maintain a measured, analytical tone.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
