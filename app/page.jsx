'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const getYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  const [chatgptInput, setChatgptInput] = useState('');
  const [geminiInput, setGeminiInput] = useState('');
  const [claudeInput, setClaudeInput] = useState('');
  const [deepresearchInput, setDeepresearchInput] = useState('');
  const [pulseDate, setPulseDate] = useState(getYesterday());
  const [output, setOutput] = useState('');
  const [verifiedData, setVerifiedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState('');
  const [thinkingDepth, setThinkingDepth] = useState('deep'); // 'fast', 'standard', 'deep'
  const timerRef = useRef(null);
  
  const thinkingOptions = {
    fast: { budget: 10000, label: 'Fast', desc: '~30s' },
    standard: { budget: 16000, label: 'Standard', desc: '~45s' },
    deep: { budget: 24000, label: 'Deep', desc: '~60s' },
    max: { budget: 64000, label: 'Max', desc: '~120s' },
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return timerRef.current;
  };

  const stopTimer = (interval) => {
    if (interval) clearInterval(interval);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const consolidate = async () => {
    const inputCount = [chatgptInput, geminiInput, claudeInput, deepresearchInput].filter(Boolean).length;
    if (inputCount < 2) {
      setError('Please paste at least two research sources to combine');
      return;
    }

    setLoading(true);
    setError('');
    setOutput('');
    setVerifiedData(null);
    
    const interval = startTimer();
    const formattedDate = formatDate(pulseDate);
    const currentThinking = thinkingOptions[thinkingDepth];

    try {
      setStatus(`Fetching verified data & synthesizing (${currentThinking.label} thinking, ${currentThinking.desc})...`);
      
      const response = await fetch('/api/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'consolidate',
          chatgptInput,
          geminiInput,
          claudeInput,
          deepresearchInput,
          formattedDate,
          targetDate: pulseDate,
          thinkingBudget: currentThinking.budget,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Consolidation failed');
      }

      if (!data.content) {
        throw new Error('No content generated. Please try again.');
      }

      let finalContent = data.content;

      // Strip any reasoning before actual content
      const marketMoodIndex = finalContent.indexOf('## Market Mood');
      if (marketMoodIndex > 0) {
        finalContent = finalContent.substring(marketMoodIndex);
      }

      // Add the title header
      const fullOutput = `# Co-Mind Morning Pulse – ${formattedDate}

${finalContent}`;

      setOutput(fullOutput);
      setVerifiedData(data.verifiedData);
      setStatus('Complete!');
      stopTimer(interval);
    } catch (err) {
      console.error('Consolidation error:', err);
      setError(err.message || 'Failed to consolidate. Please check your inputs and try again.');
      setStatus('');
      stopTimer(interval);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      // Convert markdown to HTML for rich text
      const htmlContent = renderMarkdownToHtml(output);
      
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const plainBlob = new Blob([output], { type: 'text/plain' });
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': plainBlob,
        })
      ]);
    } catch (err) {
      // Fallback to plain text
      await navigator.clipboard.writeText(output);
    }
  };

  // Convert markdown to HTML for clipboard
  const renderMarkdownToHtml = (text) => {
    if (!text) return '';
    
    return text
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^---$/gm, '<hr />')
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/^\* (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br />');
  };

  const copyForGhost = async () => {
    try {
      const ghostHtml = renderMarkdownForGhost(output);
      await navigator.clipboard.writeText(ghostHtml);
    } catch (err) {
      await navigator.clipboard.writeText(output);
    }
  };

  // Convert markdown to clean HTML for Ghost editor
  const renderMarkdownForGhost = (text) => {
    if (!text) return '';

    let html = text
      // Headers
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr>')
      // Bold and italic combinations
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      // Bullet points - collect into proper ul
      .replace(/^\* (.*)$/gm, '<li>$1</li>');

    // Wrap consecutive li elements in ul tags
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
      return '<ul>\n' + match + '</ul>\n';
    });

    // Handle paragraphs - split by double newlines
    const blocks = html.split(/\n\n+/);
    html = blocks.map(block => {
      block = block.trim();
      if (!block) return '';
      // Don't wrap if already a block element
      if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<hr') || block.startsWith('<li')) {
        return block;
      }
      // Wrap plain text in paragraph, convert single newlines to <br>
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).filter(Boolean).join('\n\n');

    return html;
  };

  // Copy market data as markdown table for Substack
  const copyMarketDataTable = async () => {
    if (!verifiedData) return;

    const sortOrders = {
      'EQUITIES': ['S&P 500', 'Nasdaq Composite', 'Dow Jones', 'Euro Stoxx 50', 'DAX', 'FTSE 100', 'Russell 2000', 'Nikkei 225', 'Hang Seng', 'VIX'],
      'FIXED INCOME': ['US 2-Year Yield', 'US 10-Year Yield', 'US 30-Year Yield', 'JGB 2-Year Yield', 'JGB 10-Year Yield', 'JGB 30-Year Yield', 'German 2-Year Bund Yield', 'German 10-Year Bund Yield', 'German 30-Year Bund Yield', 'UK 2-Year Gilt Yield', 'UK 10-Year Gilt Yield', 'UK 30-Year Gilt Yield'],
      'COMMODITIES': ['Gold', 'Silver', 'Copper', 'WTI Oil', 'Brent Oil'],
    };

    const categories = ['EQUITIES', 'FIXED INCOME', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS'];
    let markdown = '';

    for (const category of categories) {
      const items = Object.entries(verifiedData)
        .filter(([_, data]) => data.category === category)
        .sort((a, b) => {
          const order = sortOrders[category];
          if (order) {
            const aIdx = order.indexOf(a[0]);
            const bIdx = order.indexOf(b[0]);
            const aPos = aIdx === -1 ? 999 : aIdx;
            const bPos = bIdx === -1 ? 999 : bIdx;
            return aPos - bPos;
          }
          return a[0].localeCompare(b[0]);
        });

      if (items.length === 0) continue;

      markdown += `**${category}**\n\n`;
      markdown += `| Asset | Price | Change |\n`;
      markdown += `|-------|-------|--------|\n`;

      for (const [name, data] of items) {
        const isYield = data.isYield;
        const change = isYield ? data.bpsChange : data.percentChange;
        const isPositive = change >= 0;

        let displayValue;
        if (isYield) {
          displayValue = `${data.close.toFixed(3)}%`;
        } else if (name.includes('/')) {
          displayValue = data.close.toFixed(4);
        } else if (data.close > 100) {
          displayValue = data.close.toLocaleString('en-US', { maximumFractionDigits: 2 });
        } else {
          displayValue = data.close.toFixed(2);
        }

        const changeDisplay = isYield
          ? `${isPositive ? '+' : ''}${change?.toFixed(1) || '0.0'} bps`
          : `${isPositive ? '+' : ''}${change?.toFixed(2) || '0.00'}%`;

        const arrow = isPositive ? '↑' : '↓';

        markdown += `| ${name} | ${displayValue} | ${changeDisplay} ${arrow} |\n`;
      }

      markdown += `\n`;
    }

    markdown += `*Data sourced via Yahoo Finance and LLM web search. May contain errors.*`;

    try {
      await navigator.clipboard.writeText(markdown);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Render markdown for display
  const renderMarkdown = (text) => {
    if (!text) return '';
    
    let html = text
      // Headers
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2 text-slate-200">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-6 mb-3 text-white border-b border-slate-700 pb-2">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mb-4 text-white">$1</h1>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr class="my-4 border-slate-700" />')
      // Bold and italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="text-slate-300">$1</em>')
      // Bullet points
      .replace(/^\* (.*)$/gm, '<li class="ml-4 mb-2 text-slate-300">$1</li>')
      .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc list-inside my-3">$&</ul>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p class="mb-3 text-slate-300">')
      // Line breaks
      .replace(/\n/g, '<br />');
    
    // Wrap in paragraph
    if (!html.startsWith('<')) {
      html = '<p class="mb-3 text-slate-300">' + html + '</p>';
    }
    
    return html;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 border-b border-slate-700 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Morning Pulse Consolidator</h1>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded font-mono">
              Powered by gemini-3-pro-preview
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Paste outputs from the Prompt Generator workflow → Synthesize into final Morning Pulse
          </p>
        </div>

        {/* Date Picker */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Pulse Date
          </label>
          <input
            type="date"
            value={pulseDate}
            onChange={(e) => setPulseDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Input Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* ChatGPT Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-emerald-700 px-4 py-2">
              <h3 className="font-semibold text-white">ChatGPT Output</h3>
              <p className="text-xs text-emerald-200">News events & headlines focus</p>
            </div>
            <textarea
              value={chatgptInput}
              onChange={(e) => setChatgptInput(e.target.value)}
              placeholder="Paste ChatGPT's deep research output here..."
              className="w-full h-48 p-3 bg-slate-900 text-slate-200 text-sm resize-none focus:outline-none"
            />
          </div>

          {/* Gemini Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-blue-700 px-4 py-2">
              <h3 className="font-semibold text-white">Gemini Output</h3>
              <p className="text-xs text-blue-200">Quantitative & flows focus</p>
            </div>
            <textarea
              value={geminiInput}
              onChange={(e) => setGeminiInput(e.target.value)}
              placeholder="Paste Gemini's deep research output here..."
              className="w-full h-48 p-3 bg-slate-900 text-slate-200 text-sm resize-none focus:outline-none"
            />
          </div>

          {/* Claude Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-orange-700 px-4 py-2">
              <h3 className="font-semibold text-white">Claude Output</h3>
              <p className="text-xs text-orange-200">Regime & interpretation focus</p>
            </div>
            <textarea
              value={claudeInput}
              onChange={(e) => setClaudeInput(e.target.value)}
              placeholder="Paste Claude's output here..."
              className="w-full h-48 p-3 bg-slate-900 text-slate-200 text-sm resize-none focus:outline-none"
            />
          </div>

          {/* DeepResearch Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-purple-700 px-4 py-2">
              <h3 className="font-semibold text-white">DeepResearch Output</h3>
              <p className="text-xs text-purple-200">Deep web research & sourcing</p>
            </div>
            <textarea
              value={deepresearchInput}
              onChange={(e) => setDeepresearchInput(e.target.value)}
              placeholder="Paste DeepResearch output here..."
              className="w-full h-48 p-3 bg-slate-900 text-slate-200 text-sm resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Thinking Depth Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Thinking:</span>
            <div className="flex bg-slate-800 rounded-lg p-1">
              {Object.entries(thinkingOptions).map(([key, opt]) => (
                <button
                  key={key}
                  onClick={() => setThinkingDepth(key)}
                  disabled={loading}
                  className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                    thinkingDepth === key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">{thinkingOptions[thinkingDepth].desc}</span>
          </div>

          <button
            onClick={consolidate}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              loading
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'
            }`}
          >
            {loading ? 'Synthesizing...' : 'Generate Morning Pulse'}
          </button>

          {loading && (
            <div className="flex items-center gap-3 text-slate-400">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <span className="text-sm">{status}</span>
              <span className="text-sm font-mono">Elapsed: {formatTime(elapsed)}</span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Output */}
        {output && (
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-6">
            <div className="bg-slate-700 px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold">Generated Morning Pulse</h3>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
                >
                  Copy for Substack
                </button>
                <button
                  onClick={copyForGhost}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium transition-colors"
                >
                  Copy for Ghost
                </button>
              </div>
            </div>
            <div
              className="p-6 prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
            />
          </div>
        )}

        {/* Verified Data Grid - Below Output */}
        {verifiedData && (
          <div className="mb-6 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-lg">Market Data for {formatDate(pulseDate)}</h3>
              <button
                onClick={copyMarketDataTable}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium transition-colors"
              >
                Copy Table for Substack
              </button>
            </div>
            <div className="p-5">
              {['EQUITIES', 'FIXED INCOME', 'COMMODITIES', 'CURRENCIES', 'DIGITAL ASSETS'].map(category => {
                // Custom sort orders for specific categories
                const sortOrders = {
                  'EQUITIES': ['S&P 500', 'Nasdaq Composite', 'Dow Jones', 'Euro Stoxx 50', 'DAX', 'FTSE 100', 'Russell 2000', 'Nikkei 225', 'Hang Seng', 'VIX'],
                  'FIXED INCOME': ['US 2-Year Yield', 'US 10-Year Yield', 'US 30-Year Yield', 'JGB 2-Year Yield', 'JGB 10-Year Yield', 'JGB 30-Year Yield', 'German 2-Year Bund Yield', 'German 10-Year Bund Yield', 'German 30-Year Bund Yield', 'UK 2-Year Gilt Yield', 'UK 10-Year Gilt Yield', 'UK 30-Year Gilt Yield'],
                  'COMMODITIES': ['Gold', 'Silver', 'Copper', 'WTI Oil', 'Brent Oil'],
                };

                const categoryItems = Object.entries(verifiedData)
                  .filter(([_, data]) => data.category === category)
                  .sort((a, b) => {
                    const order = sortOrders[category];
                    if (order) {
                      const aIdx = order.indexOf(a[0]);
                      const bIdx = order.indexOf(b[0]);
                      // Items not in the order list go to the end
                      const aPos = aIdx === -1 ? 999 : aIdx;
                      const bPos = bIdx === -1 ? 999 : bIdx;
                      return aPos - bPos;
                    }
                    return a[0].localeCompare(b[0]);
                  });

                if (categoryItems.length === 0) return null;

                return (
                  <div key={category} className="mb-6 last:mb-0">
                    <h4 className="text-xs font-semibold text-slate-400 mb-3 tracking-wide">{category}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                      {categoryItems.map(([name, data]) => {
                        const isYield = data.isYield;
                        const change = isYield ? data.bpsChange : data.percentChange;
                        const isPositive = change >= 0;
                        // For yields, up = red (bad for bonds), for others up = green
                        const colorClass = isYield
                          ? (isPositive ? 'text-red-400' : 'text-green-400')
                          : (isPositive ? 'text-green-400' : 'text-red-400');

                        let displayValue;
                        if (isYield) {
                          displayValue = `${data.close.toFixed(3)}%`;
                        } else if (name.includes('/')) {
                          displayValue = data.close.toFixed(4);
                        } else if (data.close > 100) {
                          displayValue = data.close.toLocaleString('en-US', { maximumFractionDigits: 2 });
                        } else {
                          displayValue = data.close.toFixed(2);
                        }

                        const changeDisplay = isYield
                          ? `${isPositive ? '+' : ''}${change?.toFixed(1) || '0.0'} bps`
                          : `${isPositive ? '+' : ''}${change?.toFixed(2) || '0.00'}%`;

                        const arrow = isPositive ? '↑' : '↓';

                        return (
                          <div key={name} className="flex items-center justify-between py-1.5">
                            <span className="text-slate-300 text-sm">{name}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm text-slate-100 font-medium">{displayValue}</span>
                              <span className={`font-mono text-sm ${colorClass} min-w-[80px] text-right`}>
                                {changeDisplay} {arrow}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-slate-500 italic mt-4 pt-4 border-t border-slate-700">
                * Some data has been sourced via LLM web search and may contain errors. Please verify before use.
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!output && !loading && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">New Simplified Workflow</h3>
            <ol className="space-y-3 text-slate-300">
              <li className="flex gap-3">
                <span className="bg-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">1</span>
                <span>Use the <strong>Prompt Generator</strong> to create tailored prompts with verified market data</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">2</span>
                <span>Run each prompt in ChatGPT, Gemini, Claude, and/or DeepResearch</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">3</span>
                <span>Paste the outputs here and click "Generate Morning Pulse"</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">4</span>
                <span>Copy to Substack and publish!</span>
              </li>
            </ol>
            
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">How Each Source Tends to Contribute</h4>
              <ul className="text-sm text-slate-400 space-y-2">
                <li><strong className="text-emerald-400">ChatGPT:</strong> Often good at surfacing news events, headlines, and single-stock moves</li>
                <li><strong className="text-blue-400">Gemini:</strong> Tends to be strong on quantitative relationships and cross-asset analysis</li>
                <li><strong className="text-orange-400">Claude:</strong> Often offers regime-level thinking and non-consensus interpretation</li>
                <li><strong className="text-purple-400">DeepResearch:</strong> Provides deep web research with sourced information and citations</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                Paste any combination of 2+ sources. The consolidator blends insights based on quality, not strict assignment.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Data Verification</h4>
              <p className="text-sm text-slate-400">
                Even though the Prompt Generator provided verified data to the LLMs, they sometimes hallucinate numbers anyway. 
                This consolidator re-fetches verified market data and injects it directly into the synthesis, 
                instructing Gemini to use the verified figures and ignore any incorrect numbers from the LLM outputs.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
