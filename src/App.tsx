// src/App.tsx
import { useState, useCallback, useRef } from 'react';

// ============ IMPORTS FROM UTILS ============
import { normalize } from './utils/normalize';
import { callGeminiJson } from './utils/api';
import {
  getTextFromWord,
  highlightMultipleInWord,
  highlightInWord,
  replaceInWord,
  clearHighlights
} from './utils/word';

// ============ IMPORTS FROM PROMPTS ============
import { buildTonePrompt, getToneName } from './prompts/tone';
import { buildStylePrompt } from './prompts/style';
import {
  buildMainPrompt,
  DOC_TYPE_CONFIG,
  getDocTypeLabel,
  DocType
} from './prompts/core';

// ============ TYPE DEFINITIONS ============
export interface Correction {
  wrong: string;
  suggestions: string[];
  position?: number;
}

export interface ToneSuggestion {
  current: string;
  suggestion: string;
  reason: string;
  position?: number;
}

export interface StyleSuggestion {
  current: string;
  suggestion: string;
  type: string;
  position?: number;
}

export interface StyleMixingCorrection {
  current: string;
  suggestion: string;
  type: string;
  position?: number;
}

export interface StyleMixing {
  detected: boolean;
  recommendedStyle?: string;
  reason?: string;
  corrections?: StyleMixingCorrection[];
}

export interface PunctuationIssue {
  issue: string;
  currentSentence: string;
  correctedSentence: string;
  explanation: string;
  position?: number;
}

export interface EuphonyImprovement {
  current: string;
  suggestions: string[];
  reason: string;
  position?: number;
}

export interface ContentAnalysis {
  contentType: string;
  description?: string;
  missingElements?: string[];
  suggestions?: string[];
}

type SectionKey = 'spelling' | 'tone' | 'style' | 'mixing' | 'punctuation' | 'euphony' | 'content';
type ViewFilter = 'all' | 'spelling' | 'punctuation';

// ============ MAIN COMPONENT ============
function App() {
  // Settings State
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(
    localStorage.getItem('gemini_model') || 'gemini-2.5-flash'
  );
  const [docType, setDocType] = useState<DocType>(
    (localStorage.getItem('doc_type') as DocType) || 'generic'
  );

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeModal, setActiveModal] = useState<
    'none' | 'settings' | 'instructions' | 'tone' | 'style' | 'doctype' | 'mainMenu'
  >('none');

  const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    spelling: false,
    tone: false,
    style: false,
    mixing: false,
    punctuation: false,
    euphony: false,
    content: false
  });

  // Selection State
  const [selectedTone, setSelectedTone] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<'none' | 'sadhu' | 'cholito'>('none');

  // Data State
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [toneSuggestions, setToneSuggestions] = useState<ToneSuggestion[]>([]);
  const [styleSuggestions, setStyleSuggestions] = useState<StyleSuggestion[]>([]);
  const [languageStyleMixing, setLanguageStyleMixing] = useState<StyleMixing | null>(null);
  const [punctuationIssues, setPunctuationIssues] = useState<PunctuationIssue[]>([]);
  const [euphonyImprovements, setEuphonyImprovements] = useState<EuphonyImprovement[]>([]);
  const [contentAnalysis, setContentAnalysis] = useState<ContentAnalysis | null>(null);

  const [stats, setStats] = useState({ totalWords: 0, errorCount: 0, accuracy: 100 });

  // Debounce ref for highlight - ব্রাউজার compatible টাইপ
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============ HELPERS ============
  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const saveSettings = useCallback(() => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('gemini_model', selectedModel);
    localStorage.setItem('doc_type', docType);
    showMessage('সেটিংস সংরক্ষিত হয়েছে! ✓', 'success');
    setActiveModal('none');
  }, [apiKey, selectedModel, docType, showMessage]);

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ============ DEBOUNCED HIGHLIGHT ============
  const handleHighlight = useCallback((text: string, color: string, position?: number) => {
    // Cancel previous timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    // Debounce highlight - 300ms পরে হাইলাইট করবে
    highlightTimeoutRef.current = setTimeout(() => {
      highlightInWord(text, color, position);
    }, 300);
  }, []);

  // ============ REPLACE HANDLER ============
  const handleReplace = useCallback(async (oldText: string, newText: string, position?: number) => {
    const success = await replaceInWord(oldText, newText, position);

    if (success) {
      const target = normalize(oldText.trim());
      const isNotMatch = (textToCheck: string) => normalize(textToCheck) !== target;

      setCorrections(prev => prev.filter(c => isNotMatch(c.wrong)));
      setToneSuggestions(prev => prev.filter(t => isNotMatch(t.current)));
      setStyleSuggestions(prev => prev.filter(s => isNotMatch(s.current)));
      setEuphonyImprovements(prev => prev.filter(e => isNotMatch(e.current)));
      setPunctuationIssues(prev => prev.filter(p => isNotMatch(p.currentSentence)));

      setLanguageStyleMixing(prev => {
        if (!prev || !prev.corrections) return prev;
        const filtered = prev.corrections.filter(c => isNotMatch(c.current));
        return filtered.length > 0 ? { ...prev, corrections: filtered } : null;
      });

      showMessage(`সংশোধিত হয়েছে ✓`, 'success');
    } else {
      showMessage(`শব্দটি ডকুমেন্টে খুঁজে পাওয়া যায়নি।`, 'error');
    }
  }, [showMessage]);

  // ============ DISMISS HANDLER ============
  const dismissSuggestion = useCallback((
    type: 'spelling' | 'tone' | 'style' | 'mixing' | 'punct' | 'euphony',
    textToDismiss: string
  ) => {
    const target = normalize(textToDismiss);
    const isNotMatch = (t: string) => normalize(t) !== target;

    switch (type) {
      case 'spelling':
        setCorrections(prev => prev.filter(c => isNotMatch(c.wrong)));
        break;
      case 'tone':
        setToneSuggestions(prev => prev.filter(t => isNotMatch(t.current)));
        break;
      case 'style':
        setStyleSuggestions(prev => prev.filter(s => isNotMatch(s.current)));
        break;
      case 'mixing':
        setLanguageStyleMixing(prev => {
          if (!prev || !prev.corrections) return prev;
          const filtered = prev.corrections.filter(c => isNotMatch(c.current));
          return filtered.length > 0 ? { ...prev, corrections: filtered } : null;
        });
        break;
      case 'punct':
        setPunctuationIssues(prev => prev.filter(p => isNotMatch(p.currentSentence)));
        break;
      case 'euphony':
        setEuphonyImprovements(prev => prev.filter(e => isNotMatch(e.current)));
        break;
    }
  }, []);

  // ============ BATCH HIGHLIGHT (ALL AT ONCE) ============
  const batchHighlightAll = useCallback(async (
    spellingErrors: Correction[],
    toneItems: ToneSuggestion[],
    styleItems: StyleSuggestion[]
  ) => {
    const items: Array<{ text: string; color: string; position?: number }> = [];

    // Spelling errors - red
    spellingErrors.forEach(err => {
      items.push({ text: err.wrong, color: '#fee2e2', position: err.position });
    });

    // Tone - yellow
    toneItems.forEach(t => {
      items.push({ text: t.current, color: '#fef3c7', position: t.position });
    });

    // Style - teal
    styleItems.forEach(s => {
      items.push({ text: s.current, color: '#ccfbf1', position: s.position });
    });

    if (items.length > 0) {
      await highlightMultipleInWord(items);
    }
  }, []);

  // ============ API LOGIC ============
  const checkSpelling = useCallback(async () => {
    if (!apiKey) {
      showMessage('অনুগ্রহ করে প্রথমে API Key দিন', 'error');
      setActiveModal('settings');
      return;
    }

    const text = await getTextFromWord();
    if (!text || text.trim().length === 0) {
      showMessage('টেক্সট নির্বাচন করুন বা কার্সার রাখুন', 'error');
      return;
    }

    setIsLoading(true);
    setLoadingText('বিশ্লেষণ করা হচ্ছে...');

    // Reset states
    setCorrections([]);
    setToneSuggestions([]);
    setStyleSuggestions([]);
    setLanguageStyleMixing(null);
    setPunctuationIssues([]);
    setEuphonyImprovements([]);
    setContentAnalysis(null);
    setStats({ totalWords: 0, errorCount: 0, accuracy: 100 });

    await clearHighlights();

    let allSpelling: Correction[] = [];
    let allTone: ToneSuggestion[] = [];
    let allStyle: StyleSuggestion[] = [];

    try {
      // 1. Main Check
      setLoadingText('বানান ও ব্যাকরণ দেখা হচ্ছে...');
      const mainResult = await performMainCheck(text);
      if (mainResult) {
        allSpelling = mainResult.spelling;
      }
      await delay(1500);

      // 2. Tone Check
      if (selectedTone) {
        setLoadingText('টোন বিশ্লেষণ হচ্ছে...');
        const toneResult = await performToneCheck(text);
        if (toneResult) {
          allTone = toneResult;
        }
        await delay(1500);
      }

      // 3. Style Check
      if (selectedStyle !== 'none') {
        setLoadingText('ভাষারীতি বিশ্লেষণ হচ্ছে...');
        const styleResult = await performStyleCheck(text);
        if (styleResult) {
          allStyle = styleResult;
        }
        await delay(1500);
      }

      // 4. Content Analysis
      setLoadingText('সারাংশ তৈরি হচ্ছে...');
      await analyzeContent(text);

      // 5. BATCH Highlight - একবারে সব হাইলাইট
      setLoadingText('হাইলাইট করা হচ্ছে...');
      await batchHighlightAll(allSpelling, allTone, allStyle);

    } catch (error: any) {
      console.error(error);
      showMessage(
        error?.message || 'ত্রুটি হয়েছে। API Key, Model বা নেটওয়ার্ক চেক করুন।',
        'error'
      );
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }, [apiKey, selectedModel, docType, selectedTone, selectedStyle, showMessage, batchHighlightAll]);

  // ============ PERFORM MAIN CHECK ============
  const performMainCheck = async (text: string): Promise<{ spelling: Correction[] } | null> => {
    const prompt = buildMainPrompt(text, docType);
    const result = await callGeminiJson(prompt, apiKey, selectedModel, { temperature: 0.1 });

    if (!result) return null;

    const allSpelling: Correction[] = (result.spellingErrors || []).map((e: any) => ({
      ...e,
      position: typeof e.position === 'number' ? e.position : undefined
    }));

    const allPunct: PunctuationIssue[] = (result.punctuationIssues || []).map((p: any) => ({
      ...p,
      position: typeof p.position === 'number' ? p.position : undefined
    }));

    const allEuphony: EuphonyImprovement[] = (result.euphonyImprovements || []).map((e: any) => ({
      ...e,
      position: typeof e.position === 'number' ? e.position : undefined
    }));

    let globalMixing: StyleMixing | null = result.languageStyleMixing || null;
    if (globalMixing && globalMixing.corrections) {
      globalMixing.corrections = globalMixing.corrections.map((c: any) => ({
        ...c,
        position: typeof c.position === 'number' ? c.position : undefined
      }));
    }

    // Sort
    allSpelling.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    allPunct.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    allEuphony.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (globalMixing?.corrections) {
      globalMixing.corrections.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    setCorrections(allSpelling);
    setPunctuationIssues(allPunct);
    setEuphonyImprovements(allEuphony);
    setLanguageStyleMixing(globalMixing);

    const words = text.trim().length > 0 ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const errors = allSpelling.length;

    setStats({
      totalWords: words,
      errorCount: errors,
      accuracy: words > 0 ? Math.round(((words - errors) / words) * 100) : 100
    });

    return { spelling: allSpelling };
  };

  // ============ PERFORM TONE CHECK ============
  const performToneCheck = async (text: string): Promise<ToneSuggestion[] | null> => {
    const prompt = buildTonePrompt(text, selectedTone);
    const result = await callGeminiJson(
      `${prompt}\n\nযদি কোন পরিবর্তন প্রয়োজন না হয় তাহলে "toneConversions": [] খালি array রাখবেন।`,
      apiKey,
      selectedModel,
      { temperature: 0.2 }
    );
    if (!result) return null;

    const toneConversions: ToneSuggestion[] = (result.toneConversions || []).map((t: any) => ({
      ...t,
      position: typeof t.position === 'number' ? t.position : undefined
    }));

    toneConversions.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    setToneSuggestions(toneConversions);

    return toneConversions;
  };

  // ============ PERFORM STYLE CHECK ============
  const performStyleCheck = async (text: string): Promise<StyleSuggestion[] | null> => {
    const prompt = buildStylePrompt(text, selectedStyle);
    const result = await callGeminiJson(
      `${prompt}\n\nযদি কোন পরিবর্তন প্রয়োজন না হয় তাহলে "styleConversions": [] খালি array রাখবেন।`,
      apiKey,
      selectedModel,
      { temperature: 0.2 }
    );
    if (!result) return null;

    const styleConversions: StyleSuggestion[] = (result.styleConversions || []).map((s: any) => ({
      ...s,
      position: typeof s.position === 'number' ? s.position : undefined
    }));

    styleConversions.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    setStyleSuggestions(styleConversions);

    return styleConversions;
  };

  // ============ ANALYZE CONTENT ============
  const analyzeContent = async (text: string): Promise<void> => {
    const cfg = DOC_TYPE_CONFIG[docType];
    const prompt = `
বাংলা লেখাটি খুব সংক্ষেপে বিশ্লেষণ করুন।

ধরুন এটি: ${cfg.label}

${cfg.contentHint}

"""${text}"""

Response format (ONLY valid JSON, no extra text):

{
  "contentType": "লেখার ধরন (১-২ শব্দ)",
  "description": "খুব সংক্ষিপ্ত বর্ণনা (১ লাইন)",
  "missingElements": ["গুরুত্বপূর্ণ ১-২টি জিনিস যা নেই"],
  "suggestions": ["১টি প্রধান পরামর্শ"]
}
`;
    const result = await callGeminiJson(prompt, apiKey, selectedModel, { temperature: 0.4 });
    if (!result) return;

    setContentAnalysis(result as ContentAnalysis);
  };

  // ============ RENDER HELPERS ============
  const shouldShowSection = useCallback((key: SectionKey): boolean => {
    if (viewFilter === 'all') return true;
    if (viewFilter === 'spelling') return key === 'spelling';
    if (viewFilter === 'punctuation') return key === 'punctuation';
    return true;
  }, [viewFilter]);

  // ============ UI RENDER ============
  return (
    <div className="app-container">
      {/* Header & Toolbar */}
      <div className="header-section">
        <div className="header-top">
          <button
            className="menu-btn header-menu-btn"
            onClick={() => setActiveModal('mainMenu')}
            title="মেনু"
          >
            ☰
          </button>

          <div className="app-title">
            <h1>🌟 ভাষা মিত্র</h1>
            <p>বাংলা বানান ও ব্যাকরণ পরীক্ষক</p>
          </div>

          <div className="header-spacer" />
        </div>

        <div className="toolbar">
          <div className="toolbar-top">
            <button onClick={checkSpelling} disabled={isLoading} className="btn-check">
              {isLoading ? '...' : '🔍 পরীক্ষা করুন'}
            </button>
          </div>

          <div className="toolbar-bottom">
            <div className="view-filter">
              <button
                className={viewFilter === 'all' ? 'active' : ''}
                onClick={() => setViewFilter('all')}
              >
                সব
              </button>
              <button
                className={viewFilter === 'spelling' ? 'active' : ''}
                onClick={() => setViewFilter('spelling')}
              >
                শুধু বানান
              </button>
              <button
                className={viewFilter === 'punctuation' ? 'active' : ''}
                onClick={() => setViewFilter('punctuation')}
              >
                শুধু বিরামচিহ্ন
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Selection Display */}
      {(selectedTone || selectedStyle !== 'none' || docType !== 'generic') && (
        <div className="selection-display">
          {selectedTone && (
            <span className="selection-tag tone-tag">
              {getToneName(selectedTone)}
              <button onClick={() => setSelectedTone('')} className="clear-btn">
                ✕
              </button>
            </span>
          )}
          {selectedStyle !== 'none' && (
            <span className="selection-tag style-tag">
              {selectedStyle === 'sadhu' ? '📜 সাধু রীতি' : '💬 চলিত রীতি'}
              <button onClick={() => setSelectedStyle('none')} className="clear-btn">
                ✕
              </button>
            </span>
          )}
          {docType && (
            <span className="selection-tag doc-type-tag">
              📂 {getDocTypeLabel(docType)}
              <button onClick={() => setDocType('generic')} className="clear-btn">
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="content-area">
        {isLoading && (
          <div className="loading-box">
            <div className="loader"></div>
            <p>{loadingText}</p>
          </div>
        )}

        {message && <div className={`message-box ${message.type}`}>{message.text}</div>}

        {/* Empty State */}
        {!isLoading && stats.totalWords === 0 && !message && (
          <div className="empty-state">
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✨</div>
            <p style={{ fontSize: '13px', fontWeight: 500 }}>সাজেশন এখানে দেখা যাবে</p>
            <p style={{ fontSize: '11px', marginTop: '6px' }}>
              টেক্সট সিলেক্ট করে "পরীক্ষা করুন" ক্লিক করুন
            </p>
          </div>
        )}

        {/* Stats */}
        {stats.totalWords > 0 && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="val" style={{ color: '#667eea' }}>{stats.totalWords}</div>
              <div className="lbl">শব্দ</div>
            </div>
            <div className="stat-card">
              <div className="val" style={{ color: '#dc2626' }}>{stats.errorCount}</div>
              <div className="lbl">ভুল</div>
            </div>
            <div className="stat-card">
              <div className="val" style={{ color: '#16a34a' }}>{stats.accuracy}%</div>
              <div className="lbl">শুদ্ধতা</div>
            </div>
          </div>
        )}

        {/* Content Analysis */}
        {contentAnalysis && shouldShowSection('content') && (
          <>
            <div className="section-header">
              <h3>📋 কনটেন্ট বিশ্লেষণ</h3>
              <button className="collapse-btn" onClick={() => toggleSection('content')}>
                {collapsedSections.content ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.content && (
              <>
                <div className="analysis-card content-analysis">
                  <h3>📋 {contentAnalysis.contentType}</h3>
                  {contentAnalysis.description && <p>{contentAnalysis.description}</p>}
                </div>
                {contentAnalysis.missingElements && contentAnalysis.missingElements.length > 0 && (
                  <div className="analysis-card missing-analysis">
                    <h3 style={{ color: '#78350f' }}>⚠️ যা যোগ করুন</h3>
                    <ul>
                      {contentAnalysis.missingElements.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {contentAnalysis.suggestions && contentAnalysis.suggestions.length > 0 && (
                  <div className="analysis-card suggestion-analysis">
                    <h3 style={{ color: '#115e59' }}>✨ পরামর্শ</h3>
                    <ul>
                      {contentAnalysis.suggestions.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Spelling Errors */}
        {corrections.length > 0 && shouldShowSection('spelling') && (
          <>
            <div className="section-header">
              <h3>📝 বানান ভুল</h3>
              <span className="section-badge" style={{ background: '#fee2e2', color: '#dc2626' }}>
                {corrections.length}টি
              </span>
              <button className="collapse-btn" onClick={() => toggleSection('spelling')}>
                {collapsedSections.spelling ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.spelling &&
              corrections.map((c, i) => (
                <div
                  key={i}
                  className="suggestion-card error-card"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => handleHighlight(c.wrong, '#fee2e2', c.position)}
                >
                  <button
                    onClick={() => dismissSuggestion('spelling', c.wrong)}
                    className="dismiss-btn"
                    title="বাদ দিন"
                  >
                    ✕
                  </button>
                  <div className="wrong-word">❌ {c.wrong}</div>
                  {c.suggestions.map((s, j) => (
                    <button
                      key={j}
                      onClick={() => handleReplace(c.wrong, s, c.position)}
                      className="suggestion-btn success-btn"
                    >
                      ✓ {s}
                    </button>
                  ))}
                </div>
              ))}
          </>
        )}

        {/* Tone Suggestions */}
        {toneSuggestions.length > 0 && shouldShowSection('tone') && (
          <>
            <div className="section-header">
              <h3>💬 টোন রূপান্তর</h3>
              <span className="section-badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                {getToneName(selectedTone)}
              </span>
              <button className="collapse-btn" onClick={() => toggleSection('tone')}>
                {collapsedSections.tone ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.tone &&
              toneSuggestions.map((t, i) => (
                <div
                  key={i}
                  className="suggestion-card warning-card"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => handleHighlight(t.current, '#fef3c7', t.position)}
                >
                  <button
                    onClick={() => dismissSuggestion('tone', t.current)}
                    className="dismiss-btn"
                    title="বাদ দিন"
                  >
                    ✕
                  </button>
                  <div className="wrong-word" style={{ color: '#b45309' }}>💡 {t.current}</div>
                  {t.reason && <div className="reason">{t.reason}</div>}
                  <button
                    onClick={() => handleReplace(t.current, t.suggestion, t.position)}
                    className="suggestion-btn warning-btn"
                  >
                    ✨ {t.suggestion}
                  </button>
                </div>
              ))}
          </>
        )}

        {/* Style Suggestions */}
        {styleSuggestions.length > 0 && shouldShowSection('style') && (
          <>
            <div className="section-header">
              <h3>📝 ভাষারীতি</h3>
              <span
                className="section-badge"
                style={{
                  background: selectedStyle === 'sadhu' ? '#fef3c7' : '#ccfbf1',
                  color: selectedStyle === 'sadhu' ? '#92400e' : '#0f766e'
                }}
              >
                {selectedStyle === 'sadhu' ? '📜 সাধু রীতি' : '💬 চলিত রীতি'}
              </span>
              <button className="collapse-btn" onClick={() => toggleSection('style')}>
                {collapsedSections.style ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.style &&
              styleSuggestions.map((s, i) => (
                <div
                  key={i}
                  className="suggestion-card info-card"
                  style={{
                    borderColor: selectedStyle === 'sadhu' ? '#fbbf24' : '#5eead4',
                    position: 'relative'
                  }}
                  onMouseEnter={() => handleHighlight(s.current, '#ccfbf1', s.position)}
                >
                  <button
                    onClick={() => dismissSuggestion('style', s.current)}
                    className="dismiss-btn"
                    title="বাদ দিন"
                  >
                    ✕
                  </button>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: selectedStyle === 'sadhu' ? '#92400e' : '#0f766e'
                      }}
                    >
                      🔄 {s.current}
                    </span>
                    {s.type && (
                      <span
                        style={{
                          fontSize: '9px',
                          background: 'white',
                          padding: '2px 6px',
                          borderRadius: '10px'
                        }}
                      >
                        {s.type}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleReplace(s.current, s.suggestion, s.position)}
                    className="suggestion-btn"
                    style={{
                      background:
                        selectedStyle === 'sadhu'
                          ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
                          : 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)',
                      borderColor: selectedStyle === 'sadhu' ? '#fbbf24' : '#5eead4',
                      color: selectedStyle === 'sadhu' ? '#92400e' : '#0f766e'
                    }}
                  >
                    ➜ {s.suggestion}
                  </button>
                </div>
              ))}
          </>
        )}

        {/* Auto Style Mixing Detection */}
        {languageStyleMixing?.detected && selectedStyle === 'none' && shouldShowSection('mixing') && (
          <>
            <div className="section-header">
              <h3>🔄 মিশ্রণ সনাক্ত</h3>
              <span className="section-badge" style={{ background: '#e9d5ff', color: '#6b21a8' }}>
                স্বয়ংক্রিয়
              </span>
              <button className="collapse-btn" onClick={() => toggleSection('mixing')}>
                {collapsedSections.mixing ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.mixing && (
              <>
                <div
                  className="suggestion-card purple-card"
                  style={{ background: 'rgba(237, 233, 254, 0.5)' }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b21a8' }}>
                    প্রস্তাবিত: {languageStyleMixing.recommendedStyle}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                    {languageStyleMixing.reason}
                  </div>
                </div>
                {languageStyleMixing.corrections?.map((c, i) => (
                  <div
                    key={i}
                    className="suggestion-card purple-card-light"
                    style={{ position: 'relative' }}
                    onMouseEnter={() => handleHighlight(c.current, '#e9d5ff', c.position)}
                  >
                    <button
                      onClick={() => dismissSuggestion('mixing', c.current)}
                      className="dismiss-btn"
                      title="বাদ দিন"
                    >
                      ✕
                    </button>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#7c3aed' }}>
                        🔄 {c.current}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          background: '#e9d5ff',
                          color: '#6b21a8',
                          padding: '2px 6px',
                          borderRadius: '10px'
                        }}
                      >
                        {c.type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleReplace(c.current, c.suggestion, c.position)}
                      className="suggestion-btn purple-btn"
                    >
                      ➜ {c.suggestion}
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* Punctuation */}
        {punctuationIssues.length > 0 && shouldShowSection('punctuation') && (
          <>
            <div className="section-header">
              <h3>🔤 বিরাম চিহ্ন</h3>
              <span className="section-badge" style={{ background: '#fed7aa', color: '#c2410c' }}>
                {punctuationIssues.length}টি
              </span>
              <button className="collapse-btn" onClick={() => toggleSection('punctuation')}>
                {collapsedSections.punctuation ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.punctuation &&
              punctuationIssues.map((p, i) => (
                <div
                  key={i}
                  className="suggestion-card orange-card"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => handleHighlight(p.currentSentence, '#ffedd5')}
                >
                  <button
                    onClick={() => dismissSuggestion('punct', p.currentSentence)}
                    className="dismiss-btn"
                    title="বাদ দিন"
                  >
                    ✕
                  </button>
                  <div className="wrong-word" style={{ color: '#ea580c' }}>⚠️ {p.issue}</div>
                  <div className="reason">{p.explanation}</div>
                  <button
                    onClick={() => handleReplace(p.currentSentence, p.correctedSentence)}
                    className="suggestion-btn orange-btn"
                  >
                    ✓ {p.correctedSentence}
                  </button>
                </div>
              ))}
          </>
        )}

        {/* Euphony */}
        {euphonyImprovements.length > 0 && shouldShowSection('euphony') && (
          <>
            <div className="section-header">
              <h3>🎵 শ্রুতিমধুরতা</h3>
              <span className="section-badge" style={{ background: '#fce7f3', color: '#be185d' }}>
                {euphonyImprovements.length}টি
              </span>
              <button className="collapse-btn" onClick={() => toggleSection('euphony')}>
                {collapsedSections.euphony ? '➕' : '➖'}
              </button>
            </div>
            {!collapsedSections.euphony &&
              euphonyImprovements.map((e, i) => (
                <div
                  key={i}
                  className="suggestion-card"
                  style={{ borderLeft: '4px solid #db2777', position: 'relative' }}
                  onMouseEnter={() => handleHighlight(e.current, '#fce7f3', e.position)}
                >
                  <button
                    onClick={() => dismissSuggestion('euphony', e.current)}
                    className="dismiss-btn"
                    title="বাদ দিন"
                  >
                    ✕
                  </button>
                  <div className="wrong-word" style={{ color: '#db2777' }}>🎵 {e.current}</div>
                  <div className="reason">{e.reason}</div>
                  {e.suggestions.map((s, j) => (
                    <button
                      key={j}
                      onClick={() => handleReplace(e.current, s, e.position)}
                      className="suggestion-btn"
                      style={{ background: '#fce7f3', borderColor: '#f9a8d4', color: '#9f1239' }}
                    >
                      ♪ {s}
                    </button>
                  ))}
                </div>
              ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="footer">
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
          Developed by: হিমাদ্রি বিশ্বাস
        </p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>☎ +880 9696 196566</p>
      </div>

      {/* ============ MODALS ============ */}

      {/* Main Menu Modal */}
      {activeModal === 'mainMenu' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header menu-header">
              <h3>☰ মেনু</h3>
              <button onClick={() => setActiveModal('none')}>✕</button>
            </div>
            <div className="modal-body">
              <div className="option-item" onClick={() => setActiveModal('tone')}>
                <div className="opt-icon">🗣️</div>
                <div style={{ flex: 1 }}>
                  <div className="opt-title">টোন / ভাব</div>
                  <div className="opt-desc">
                    {selectedTone ? getToneName(selectedTone) : 'কোনো নির্দিষ্ট টোন সেট নেই'}
                  </div>
                </div>
              </div>

              <div className="option-item" onClick={() => setActiveModal('style')}>
                <div className="opt-icon">📝</div>
                <div style={{ flex: 1 }}>
                  <div className="opt-title">ভাষারীতি (সাধু / চলিত)</div>
                  <div className="opt-desc">
                    {selectedStyle === 'none'
                      ? 'স্বয়ংক্রিয় মিশ্রণ সনাক্তকরণ চালু'
                      : selectedStyle === 'sadhu'
                      ? 'বর্তমান: সাধু রীতি'
                      : 'বর্তমান: চলিত রীতি'}
                  </div>
                </div>
              </div>

              <div className="option-item" onClick={() => setActiveModal('doctype')}>
                <div className="opt-icon">📂</div>
                <div style={{ flex: 1 }}>
                  <div className="opt-title">ডকুমেন্ট টাইপ</div>
                  <div className="opt-desc">বর্তমান: {getDocTypeLabel(docType)}</div>
                </div>
              </div>

              <div className="option-item" onClick={() => setActiveModal('settings')}>
                <div className="opt-icon">⚙️</div>
                <div style={{ flex: 1 }}>
                  <div className="opt-title">সেটিংস</div>
                  <div className="opt-desc">API Key, মডেল, ডিফল্ট ডক টাইপ</div>
                </div>
              </div>

              <div className="option-item" onClick={() => setActiveModal('instructions')}>
                <div className="opt-icon">❓</div>
                <div style={{ flex: 1 }}>
                  <div className="opt-title">ব্যবহার নির্দেশিকা</div>
                  <div className="opt-desc">কিভাবে এই অ্যাড-ইন ব্যবহার করবেন</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {activeModal === 'settings' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header settings-header">
              <h3>⚙️ সেটিংস</h3>
              <button onClick={() => setActiveModal('none')}>✕</button>
            </div>
            <div className="modal-body">
              <label>🔑 Google Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="আপনার API Key এখানে দিন"
              />

              <label>🤖 AI Model</label>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              </select>

              <label>📂 ডকুমেন্ট টাইপ (ডিফল্ট)</label>
              <select value={docType} onChange={e => setDocType(e.target.value as DocType)}>
                <option value="generic">সাধারণ লেখা</option>
                <option value="academic">একাডেমিক লেখা</option>
                <option value="official">অফিশিয়াল চিঠি</option>
                <option value="marketing">মার্কেটিং কপি</option>
                <option value="social">সোশ্যাল মিডিয়া পোস্ট</option>
              </select>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={saveSettings} className="btn-primary-full">
                  ✓ সংরক্ষণ
                </button>
                <button
                  onClick={() => setActiveModal('none')}
                  style={{
                    padding: '12px 20px',
                    background: '#f3f4f6',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  বাতিল
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions Modal */}
      {activeModal === 'instructions' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header instructions-header">
              <h3>🎯 ব্যবহার নির্দেশিকা</h3>
              <button onClick={() => setActiveModal('none')}>✕</button>
            </div>
            <div className="modal-body">
              <ol style={{ paddingLeft: '18px', lineHeight: '2', fontSize: '13px' }}>
                <li style={{ marginBottom: '10px' }}>⚙️ সেটিংস থেকে API Key দিন</li>
                <li style={{ marginBottom: '10px' }}>
                  📂 প্রয়োজন হলে ডক টাইপ নির্বাচন করুন
                </li>
                <li style={{ marginBottom: '10px' }}>
                  ✍️ বাংলা টেক্সট সিলেক্ট করুন অথবা সম্পূর্ণ ডকুমেন্ট চেক করুন
                </li>
                <li style={{ marginBottom: '10px' }}>
                  💬 <strong>টোন</strong> (মেনু থেকে) নির্বাচন করুন (ঐচ্ছিক)
                </li>
                <li style={{ marginBottom: '10px' }}>
                  📝 <strong>ভাষারীতি</strong> (মেনু থেকে) নির্বাচন করুন (ঐচ্ছিক)
                </li>
                <li style={{ marginBottom: '10px' }}>🔍 "পরীক্ষা করুন" বাটনে ক্লিক করুন</li>
                <li>✓ সাজেশনে ক্লিক করে প্রতিস্থাপন করুন</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Tone Modal */}
      {activeModal === 'tone' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header tone-header">
              <h3>💬 টোন/ভাব নির্বাচন</h3>
              <button onClick={() => setActiveModal('none')}>✕</button>
            </div>
            <div className="modal-body">
              {[
                { id: '', icon: '❌', title: 'কোনটি নয়', desc: 'শুধু বানান ও ব্যাকরণ পরীক্ষা' },
                { id: 'formal', icon: '📋', title: 'আনুষ্ঠানিক', desc: 'দাপ্তরিক চিঠি, আবেদন' },
                { id: 'informal', icon: '💬', title: 'অনানুষ্ঠানিক', desc: 'ব্যক্তিগত চিঠি, ব্লগ' },
                { id: 'professional', icon: '💼', title: 'পেশাদার', desc: 'ব্যবসায়িক যোগাযোগ' },
                { id: 'friendly', icon: '😊', title: 'বন্ধুত্বপূর্ণ', desc: 'উষ্ণ, আন্তরিক' },
                { id: 'respectful', icon: '🙏', title: 'সম্মানজনক', desc: 'বয়োজ্যেষ্ঠদের জন্য' },
                { id: 'persuasive', icon: '💪', title: 'প্রভাবশালী', desc: 'মার্কেটিং, বিক্রয়' },
                { id: 'neutral', icon: '⚖️', title: 'নিরপেক্ষ', desc: 'সংবাদ, তথ্যমূলক' },
                { id: 'academic', icon: '📚', title: 'শিক্ষামূলক', desc: 'গবেষণা পত্র' }
              ].map(opt => (
                <div
                  key={opt.id}
                  className={`option-item ${selectedTone === opt.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTone(opt.id);
                    setActiveModal('none');
                  }}
                >
                  <div className="opt-icon">{opt.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="opt-title">{opt.title}</div>
                    <div className="opt-desc">{opt.desc}</div>
                  </div>
                  {selectedTone === opt.id && <div className="check-mark">✓</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Style Modal */}
      {activeModal === 'style' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header style-header">
              <h3>📝 ভাষারীতি নির্বাচন</h3>
              <button onClick={() => setActiveModal('none')}>✕</button>
            </div>
            <div className="modal-body">
              {[
                { id: 'none', icon: '❌', title: 'কোনটি নয়', desc: 'স্বয়ংক্রিয় সনাক্তকরণ' },
                { id: 'sadhu', icon: '📜', title: 'সাধু রীতি', desc: 'করিতেছি, তাহার' },
                { id: 'cholito', icon: '💬', title: 'চলিত রীতি', desc: 'করছি, তার' }
              ].map(opt => (
                <div
                  key={opt.id}
                  className={`option-item ${selectedStyle === opt.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedStyle(opt.id as 'none' | 'sadhu' | 'cholito');
                    setActiveModal('none');
                  }}
                >
                  <div className="opt-icon">{opt.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="opt-title">{opt.title}</div>
                    <div className="opt-desc">{opt.desc}</div>
                  </div>
                  {selectedStyle === opt.id && <div className="check-mark">✓</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Doc Type Modal */}
      {activeModal === 'doctype' && (
        <div className="modal-overlay" onClick={() => setActiveModal('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header style-header">
              <h3>📂 ডকুমেন্ট টাইপ নির্বাচন</h3>
              <button onClick={() => setActiveModal('none')}>✕</button>
            </div>
            <div className="modal-body">
              {(['generic', 'academic', 'official', 'marketing', 'social'] as DocType[]).map(dt => {
                const cfg = DOC_TYPE_CONFIG[dt];
                return (
                  <div
                    key={dt}
                    className={`option-item ${docType === dt ? 'selected' : ''}`}
                    onClick={() => {
                      setDocType(dt);
                      if (!selectedTone && cfg.defaultTone) {
                        setSelectedTone(cfg.defaultTone);
                      }
                      setActiveModal('none');
                    }}
                  >
                    <div className="opt-icon">📂</div>
                    <div style={{ flex: 1 }}>
                      <div className="opt-title">{cfg.label}</div>
                      <div className="opt-desc">{cfg.description}</div>
                    </div>
                    {docType === dt && <div className="check-mark">✓</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
