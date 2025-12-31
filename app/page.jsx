'use client';

import { useState, useRef } from 'react';

export default function Home() {
  const [chatgptInput, setChatgptInput] = useState('');
  const [geminiInput, setGeminiInput] = useState('');
  const [claudeInput, setClaudeInput] = useState('');
  const [pulseDate, setPulseDate] = useState(new Date().toISOString().split('T')[0]);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState(null);
  const previewRef = useRef(null);

  const startTimer = () => {
    setElapsedTime(0);
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    setTimerInterval(interval);
    return interval;
  };

  const stopTimer = (interval) => {
    if (interval) clearInterval(interval);
    setTimerInterval(null);
  };

  const formatElapsedTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const renderMarkdown = (text) => {
    const lines = text.split('\n');
    const mergedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      const isStructural = 
        trimmed === '' ||
        trimmed === '---' ||
        trimmed.startsWith('# ') ||
        trimmed.startsWith('## ') ||
        trimmed.startsWith('* ') ||
        trimmed.startsWith('- ') ||
        (trimmed.startsWith('**') && trimmed.endsWith('**') && (trimmed.endsWith(':**') || trimmed.length < 40) && !trimmed.includes('.**')) ||
        (trimmed.startsWith('[') && trimmed.includes('PLACEHOLDER'));
      
      if (isStructural) {
        mergedLines.push(line);
      } else if (mergedLines.length > 0 && trimmed !== '') {
        let lastIndex = mergedLines.length - 1;
        
        while (lastIndex >= 0 && mergedLines[lastIndex].trim() === '') {
          lastIndex--;
        }
        
        if (lastIndex >= 0) {
          const lastLine = mergedLines[lastIndex].trim();
          const lastIsStructuralEnd = 
            lastLine === '---' || 
            lastLine.startsWith('## ') ||
            lastLine.startsWith('# ') ||
            (lastLine.startsWith('**') && lastLine.endsWith('**') && (lastLine.endsWith(':**') || lastLine.length < 40) && !lastLine.includes('.**'));
          
          if (!lastIsStructuralEnd) {
            const needsSpace = !mergedLines[lastIndex].endsWith(' ') && !trimmed.startsWith(',') && !trimmed.startsWith('.');
            mergedLines[lastIndex] = mergedLines[lastIndex] + (needsSpace ? ' ' : '') + trimmed;
          } else {
            mergedLines.push(line);
          }
        } else {
          mergedLines.push(line);
        }
      } else if (trimmed !== '') {
        mergedLines.push(line);
      }
    }
    
    return mergedLines.map((line, i) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        return <h1 key={i} className="text-2xl font-bold mt-6 mb-4 text-slate-100">{trimmed.replace('# ', '')}</h1>;
      }
      if (trimmed.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-bold mt-8 mb-3 text-slate-100">{trimmed.replace('## ', '')}</h2>;
      }
      if (trimmed.startsWith('**') && trimmed.endsWith('**') && (trimmed.endsWith(':**') || trimmed.length < 40) && !trimmed.includes('.**')) {
        return <p key={i} className="font-bold text-slate-100 mt-4 mb-2">{trimmed.replace(/\*\*/g, '')}</p>;
      }
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const content = trimmed.replace(/^[-*]\s*/, '');
        return (
          <li key={i} className="ml-6 my-2 text-slate-300 list-disc" dangerouslySetInnerHTML={{
            __html: content
              .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
              .replace(/\*([^*]+)\*/g, '<em>$1</em>')
          }} />
        );
      }
      if (trimmed === '---') {
        return <hr key={i} className="my-6 border-slate-600" />;
      }
      if (trimmed === '') {
        return null;
      }
      if (trimmed.startsWith('[') && trimmed.includes('PLACEHOLDER')) {
        return <div key={i} className="my-4 p-8 border-2 border-dashed border-slate-600 rounded-lg text-center text-slate-500">🎨 Cartoon Image Here</div>;
      }
      return (
        <p key={i} className="text-slate-300 my-2 leading-relaxed" dangerouslySetInnerHTML={{
          __html: trimmed
            .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        }} />
      );
    }).filter(Boolean);
  };

  const consolidate = async () => {
    if (!chatgptInput && !geminiInput && !claudeInput) {
      setError('Please paste at least one research source');
      return;
    }

    setLoading(true);
    setError('');
    setOutput('');
    
    const interval = startTimer();
    
    const formattedDate = formatDate(pulseDate);

    try {
      // Step 0: Fetch verified market data from multiple sources
      setStatus('Step 1/5: Fetching verified data (Yahoo, CoinGecko, FRED, Frankfurter)...');
      
      const fetchResponse = await fetch('/api/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'fetch', targetDate: pulseDate }),
      });
      
      const fetchResult = await fetchResponse.json();
      const verifiedData = fetchResult.formatted || 'Market data unavailable';
      
      if (fetchResult.errors && fetchResult.errors.length > 0) {
        console.log('Some market data unavailable:', fetchResult.errors);
      }

      // Step 1: Extract data from each source (parallel)
      setStatus('Step 2/5: Extracting data from LLM sources...');
      
      const extractionPromises = [];
      
      if (chatgptInput) {
        extractionPromises.push(
          fetch('/api/consolidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'extract', source: 'ChatGPT', content: chatgptInput }),
          }).then(r => r.json()).then(d => ({ source: 'chatgpt', data: d.extractedData }))
        );
      }
      
      if (geminiInput) {
        extractionPromises.push(
          fetch('/api/consolidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'extract', source: 'Gemini', content: geminiInput }),
          }).then(r => r.json()).then(d => ({ source: 'gemini', data: d.extractedData }))
        );
      }
      
      if (claudeInput) {
        extractionPromises.push(
          fetch('/api/consolidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: 'extract', source: 'Claude', content: claudeInput }),
          }).then(r => r.json()).then(d => ({ source: 'claude', data: d.extractedData }))
        );
      }

      const extractions = await Promise.all(extractionPromises);
      
      const chatgptData = extractions.find(e => e.source === 'chatgpt')?.data || 'Not provided';
      const geminiData = extractions.find(e => e.source === 'gemini')?.data || 'Not provided';
      const claudeData = extractions.find(e => e.source === 'claude')?.data || 'Not provided';

      // Step 2: Compare data against verified data
      setStatus('Step 3/5: Comparing against verified data (with thinking)...');
      
      const compareResponse = await fetch('/api/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'compare',
          chatgptData,
          geminiData,
          claudeData,
          verifiedData,
          formattedDate,
        }),
      });

      const compareResult = await compareResponse.json();
      
      if (!compareResponse.ok) {
        throw new Error(compareResult.error || 'Comparison failed');
      }

      // Step 3: Consolidate with verified + comparison data
      setStatus('Step 4/5: Synthesizing Morning Pulse (with thinking)...');
      
      const consolidateResponse = await fetch('/api/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'consolidate',
          chatgptInput,
          geminiInput,
          claudeInput,
          comparison: compareResult.comparison,
          formattedDate,
        }),
      });

      const consolidateData = await consolidateResponse.json();

      if (!consolidateResponse.ok) {
        throw new Error(consolidateData.error || 'Consolidation failed');
      }

      if (!consolidateData.content) {
        throw new Error('No content generated. Please try again.');
      }

      // Step 4: Verify key data (lighter touch since we have verified data)
      setStatus('Step 5/5: Final verification...');
      
      const verifyResponse = await fetch('/api/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'verify',
          content: consolidateData.content,
          formattedDate,
        }),
      });

      const verifyData = await verifyResponse.json();

      let finalContent = consolidateData.content;
      if (verifyResponse.ok && verifyData.content) {
        finalContent = verifyData.content;
      }

      // Strip any reasoning before actual content
      const marketMoodIndex = finalContent.indexOf('## Market Mood');
      if (marketMoodIndex > 0) {
        finalContent = finalContent.substring(marketMoodIndex);
      }

      // Add the title header
      const fullOutput = `# Co-Mind Morning Pulse – ${formattedDate}

[CARTOON IMAGE PLACEHOLDER]

${finalContent}`;

      setOutput(fullOutput);
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

  const copyPreview = async () => {
    if (!previewRef.current) return;
    
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(previewRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([previewRef.current.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([previewRef.current.innerText], { type: 'text/plain' })
        })
      ]);
      
      selection.removeAllRanges();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(previewRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        setError('Failed to copy. Please select and copy manually.');
      }
    }
  };

  const inputCount = [chatgptInput, geminiInput, claudeInput].filter(Boolean).length;

  const clearAll = () => {
    setChatgptInput('');
    setGeminiInput('');
    setClaudeInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 border-b border-slate-700 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Morning Pulse Consolidator</h1>
            <p className="text-slate-400 mt-2">Paste your deep research from ChatGPT, Gemini, and Claude → Get a formatted Substack post</p>
          </div>
          {(inputCount > 0 || output) && (
            <button
              onClick={clearAll}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Date Picker */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">Pulse Date</label>
          <input
            type="date"
            value={pulseDate}
            onChange={(e) => setPulseDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Input Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* ChatGPT Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-emerald-900/50 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="font-medium">ChatGPT Deep Research</span>
              {chatgptInput && <span className="ml-auto text-xs text-emerald-400">✓</span>}
            </div>
            <textarea
              value={chatgptInput}
              onChange={(e) => setChatgptInput(e.target.value)}
              placeholder="Paste ChatGPT output here..."
              className="w-full h-64 p-4 bg-transparent text-slate-200 placeholder-slate-500 resize-none focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Gemini Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-blue-900/50 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="font-medium">Gemini Deep Research</span>
              {geminiInput && <span className="ml-auto text-xs text-blue-400">✓</span>}
            </div>
            <textarea
              value={geminiInput}
              onChange={(e) => setGeminiInput(e.target.value)}
              placeholder="Paste Gemini output here..."
              className="w-full h-64 p-4 bg-transparent text-slate-200 placeholder-slate-500 resize-none focus:outline-none font-mono text-sm"
            />
          </div>

          {/* Claude Input */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-orange-900/50 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="font-medium">Claude Deep Research</span>
              {claudeInput && <span className="ml-auto text-xs text-orange-400">✓</span>}
            </div>
            <textarea
              value={claudeInput}
              onChange={(e) => setClaudeInput(e.target.value)}
              placeholder="Paste Claude output here..."
              className="w-full h-64 p-4 bg-transparent text-slate-200 placeholder-slate-500 resize-none focus:outline-none font-mono text-sm"
            />
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={consolidate}
          disabled={loading || inputCount === 0}
          className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
            loading || inputCount === 0
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="flex flex-col items-start">
                <span>{status || 'Processing...'}</span>
                <span className="text-sm opacity-75">Elapsed: {formatElapsedTime(elapsedTime)}</span>
              </span>
            </span>
          ) : (
            `Consolidate ${inputCount} Source${inputCount !== 1 ? 's' : ''} → Morning Pulse`
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg flex items-start gap-3">
            <span className="text-red-400 mt-0.5">⚠️</span>
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Output */}
        {output && (
          <div className="mt-8 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <div className="bg-slate-700 px-4 py-3 flex items-center justify-between">
              <span className="font-medium text-slate-200">📋 Ready for Substack</span>
              <button
                onClick={copyPreview}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  copied
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {copied ? (
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
                    Copy Preview
                  </>
                )}
              </button>
            </div>
            <div ref={previewRef} className="p-6 overflow-auto max-h-[700px]">
              {renderMarkdown(output)}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!output && !loading && (
          <div className="mt-8 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">How to use</h3>
            <ol className="space-y-3 text-slate-300">
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">1</span>
                <span>Run your deep research prompt in ChatGPT, Gemini, and Claude</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">2</span>
                <span>Paste each output into the corresponding box above</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">3</span>
                <span>Click consolidate – Gemini 2.5 Pro will synthesize and resolve any data conflicts</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium shrink-0">4</span>
                <span>Click "Copy Preview" and paste directly into Substack (formatting preserved)</span>
              </li>
            </ol>
            
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">How It Works</h4>
              <p className="text-sm text-slate-400 space-y-1">
                <span className="block"><strong className="text-slate-300">Step 1:</strong> Fetch verified data from 5 sources (Yahoo Finance, CoinGecko, FRED, Frankfurter) with consensus logic</span>
                <span className="block"><strong className="text-slate-300">Step 2:</strong> Extract numerical data from each LLM source into structured format</span>
                <span className="block"><strong className="text-slate-300">Step 3:</strong> Compare LLM data against verified consensus, flag inaccurate sources (with thinking)</span>
                <span className="block"><strong className="text-slate-300">Step 4:</strong> Synthesize Morning Pulse using verified data + narrative insights (with thinking)</span>
                <span className="block"><strong className="text-slate-300">Step 5:</strong> Final verification pass</span>
              </p>
              <p className="text-xs text-slate-500 mt-3">
                <strong>Data Sources:</strong> Yahoo Finance (equities, commodities), CoinGecko (crypto), FRED (Treasury yields), Frankfurter/ECB (FX rates). 
                When sources agree (within 1%), confidence is high. When they disagree, official sources (FRED, ECB) are prioritized.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
