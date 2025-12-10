// src/App.tsx
import { useState, useCallback, useRef, useEffect } from 'react';

// ============ IMPORTS ============
import { normalize } from './utils/normalize';
import { 
  analyzeText, 
  getRateLimitInfo, 
  incrementRequestCount,
  RateLimitInfo,
  getSafeLimit
} from './utils/api';
import { UnifiedResponse } from './utils/toonParser';
import {
  getTextFromWord,
  highlightMultipleInWord,
  highlightInWord,
  replaceInWord,
  clearHighlights
} from './utils/word';

import {
  DOC_TYPE_CONFIG,
  getDocTypeLabel,
  getToneName,
  DocType,
  StyleType,
  MODEL_OPTIONS,
  TONE_OPTIONS,
  STYLE_OPTIONS
} from './prompts/core';

// ============ TYPE DEFINITIONS ============
interface Correction {
  wrong: string;
  suggestions: string[];
  position?: number;
}

interface ToneSuggestion {
  current: string;
  suggestion: string;
  reason: string;
  position?: number;
}

interface StyleSuggestion {
  current: string;
  suggestion: string;
  type: string;
  position?: number;
}

interface StyleMixingCorrection {
  current: string;
  suggestion: string;
  type: string;
  position?: number;
}

interface StyleMixing {
  detected: boolean;
  recommendedStyle?: string;
  reason?: string;
  corrections?: StyleMixingCorrection[];
}

interface PunctuationIssue {
  issue: string;
  currentSentence: string;
  correctedSentence: string;
  explanation: string;
  position?: number;
}

interface EuphonyImprovement {
  current: string;
  suggestions: string[];
  reason: string;
  position?: number;
}

interface ContentAnalysis {
  contentType: string;
  description?: string;
  missingElements?: string[];
  suggestions?: string[];
}

type SectionKey = 'spelling' | 'tone' | 'style' | 'mixing' | 'punctuation' | 'euphony' | 'content';
type ViewFilter = 'all' | 'spelling' | 'punctuation';
type ModalType = 'none' | 'settings' | 'instructions' | 'tone' | 'style' | 'doctype' | 'mainMenu';

// ============ DEDUPLICATION HELPERS ============
/**
 * ডুপ্লিকেট বানান ভুল রিমুভ করা
 */
const deduplicateCorrections = (items: Correction[]): Correction[] => {
  const seen = new Map<string, Correction>();
  
  for (const item of items) {
    const key = normalize(item.wrong);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  
  return Array.from(seen.values());
};

/**
 * ডুপ্লিকেট টোন সাজেশন রিমুভ করা
 */
const deduplicateToneSuggestions = (items: ToneSuggestion[]): ToneSuggestion[] => {
  const seen = new Map<string, ToneSuggestion>();
  
  for (const item of items) {
    const key = normalize(item.current);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  
  return Array.from(seen.values());
};

/**
 * ডুপ্লিকেট স্টাইল সাজেশন রিমুভ করা
 */
const deduplicateStyleSuggestions = (items: StyleSuggestion[]): StyleSuggestion[] => {
  const seen = new Map<string, StyleSuggestion>();
  
  for (const item of items) {
    const key = normalize(item.current);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  
  return Array.from(seen.values());
};

/**
 * ডুপ্লিকেট ইউফোনি সাজেশন রিমুভ করা
 */
const deduplicateEuphony = (items: EuphonyImprovement[]): EuphonyImprovement[] => {
  const seen = new Map<string, EuphonyImprovement>();
  
  for (const item of items) {
    const key = normalize(item.current);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  
  return Array.from(seen.values());
};

/**
 * ডুপ্লিকেট মিক্সিং কারেকশন রিমুভ করা
 */
const deduplicateMixingCorrections = (items: StyleMixingCorrection[]): StyleMixingCorrection[] => {
  const seen = new Map<string, StyleMixingCorrection>();
  
  for (const item of items) {
    const key = normalize(item.current);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  
  return Array.from(seen.values());
};

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

  // Rate Limit State
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>('none');

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
  const [selectedStyle, setSelectedStyle] = useState<StyleType>('none');

  // Data State
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [toneSuggestions, setToneSuggestions] = useState<ToneSuggestion[]>([]);
  const [styleSuggestions, setStyleSuggestions] = useState<StyleSuggestion[]>([]);
  const [languageStyleMixing, setLanguageStyleMixing] = useState<StyleMixing | null>(null);
  const [punctuationIssues, setPunctuationIssues] = useState<PunctuationIssue[]>([]);
  const [euphonyImprovements, setEuphonyImprovements] = useState<EuphonyImprovement[]>([]);
  const [contentAnalysis, setContentAnalysis] = useState<ContentAnalysis | null>(null);

  const [stats, setStats] = useState({ totalWords: 0, errorCount: 0, accuracy: 100 });

  // Debounce ref for highlight
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============ LOAD RATE LIMIT ON MOUNT & MODEL CHANGE ============
  useEffect(() => {
    const info = getRateLimitInfo(selectedModel);
    setRateLimitInfo(info);
  }, [selectedModel]);

  // ============ HELPERS ============
  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }, []);

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
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
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

      showMessage('সংশোধিত হয়েছে ✓', 'success');
    } else {
      showMessage('শব্দটি ডকুমেন্টে খুঁজে পাওয়া যায়নি।', 'error');
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

  // ============ BATCH HIGHLIGHT ============
  const batchHighlightAll = useCallback(async (result: UnifiedResponse) => {
    const items: Array<{ text: string; color: string; position?: number }> = [];

    // Spelling errors - red
    result.spellingErrors.forEach(err => {
      items.push({ text: err.wrong, color: '#fee2e2', position: err.position });
    });

    // Tone - yellow
    result.toneConversions.forEach(t => {
      items.push({ text: t.current, color: '#fef3c7', position: t.position });
    });

    // Style - teal
    result.styleConversions.forEach(s => {
      items.push({ text: s.current, color: '#ccfbf1', position: s.position });
    });

    // Mixing - purple
    if (result.languageStyleMixing?.corrections) {
      result.languageStyleMixing.corrections.forEach(c => {
        items.push({ text: c.current, color: '#e9d5ff', position: c.position });
      });
    }

    if (items.length > 0) {
      await highlightMultipleInWord(items);
    }
  }, []);

  // ============ MAIN API CALL - একটি মাত্র request ============
  const checkSpelling = useCallback(async () => {
    // API Key check
    if (!apiKey) {
      showMessage('অনুগ্রহ করে প্রথমে API Key দিন', 'error');
      setActiveModal('settings');
      return;
    }

    // Rate limit check
    const currentInfo = getRateLimitInfo(selectedModel);
    if (currentInfo.isLimited) {
      showMessage(`দৈনিক সীমা (${currentInfo.limit}টি) শেষ। কাল আবার চেষ্টা করুন বা অন্য মডেল ব্যবহার করুন।`, 'error');
      return;
    }

    // Get text from Word
    const text = await getTextFromWord();
    if (!text || text.trim().length === 0) {
      showMessage('টেক্সট নির্বাচন করুন বা কার্সার রাখুন', 'error');
      return;
    }

    setIsLoading(true);
    setLoadingText('বিশ্লেষণ করা হচ্ছে...');

    // Reset all states
    setCorrections([]);
    setToneSuggestions([]);
    setStyleSuggestions([]);
    setLanguageStyleMixing(null);
    setPunctuationIssues([]);
    setEuphonyImprovements([]);
    setContentAnalysis(null);
    setStats({ totalWords: 0, errorCount: 0, accuracy: 100 });

    await clearHighlights();

    try {
      // ✅ একটি মাত্র API call!
      const result = await analyzeText(
        {
          text,
          docType,
          style: selectedStyle,
          tone: selectedTone
        },
        apiKey,
        selectedModel
      );

      // Increment request count after successful call
      const newInfo = incrementRequestCount(selectedModel);
      setRateLimitInfo(newInfo);

      if (!result) {
        showMessage('বিশ্লেষণ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।', 'error');
        return;
      }

      // Sort helper
      const sortByPos = <T extends { position?: number }>(arr: T[]) =>
        [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      // ✅ Deduplicate and set states
      const dedupedSpelling = deduplicateCorrections(result.spellingErrors);
      const dedupedTone = deduplicateToneSuggestions(result.toneConversions);
      const dedupedStyle = deduplicateStyleSuggestions(result.styleConversions);
      const dedupedEuphony = deduplicateEuphony(result.euphonyImprovements);

      setCorrections(sortByPos(dedupedSpelling));
      setPunctuationIssues(sortByPos(result.punctuationIssues));
      setEuphonyImprovements(sortByPos(dedupedEuphony));
      setToneSuggestions(sortByPos(dedupedTone));
      setStyleSuggestions(sortByPos(dedupedStyle));

if (result.languageStyleMixing?.detected) {
  const mixing: StyleMixing = {
    detected: result.languageStyleMixing.detected,
    recommendedStyle: result.languageStyleMixing.recommendedStyle,
    reason: result.languageStyleMixing.reason,
    corrections: result.languageStyleMixing.corrections 
      ? sortByPos(deduplicateMixingCorrections(
          result.languageStyleMixing.corrections.map(c => ({
            current: c.current,
            suggestion: c.suggestion,
            type: c.type,
            position: c.position
          }))
        ))
      : undefined
  };
  setLanguageStyleMixing(mixing);
}

      if (result.contentAnalysis) {
        setContentAnalysis(result.contentAnalysis);
      }

      // Calculate stats (using deduplicated count)
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const errors = dedupedSpelling.length;
      setStats({
        totalWords: words,
        errorCount: errors,
        accuracy: words > 0 ? Math.round(((words - errors) / words) * 100) : 100
      });

      // Batch highlight
      setLoadingText('হাইলাইট করা হচ্ছে...');
      await batchHighlightAll(result);

      showMessage('বিশ্লেষণ সম্পন্ন! ✓', 'success');

    } catch (error: any) {
      console.error(error);
      // Update rate limit info in case of 429 error
      const updatedInfo = getRateLimitInfo(selectedModel);
      setRateLimitInfo(updatedInfo);
      showMessage(error?.message || 'ত্রুটি হয়েছে। আবার চেষ্টা করুন।', 'error');
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }, [apiKey, selectedModel, docType, selectedTone, selectedStyle, showMessage, batchHighlightAll]);

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
            <button 
              onClick={checkSpelling} 
              disabled={isLoading || (rateLimitInfo?.isLimited ?? false)} 
              className="btn-check"
            >
              {isLoading ? '⏳ অপেক্ষা করুন...' : '🔍 পরীক্ষা করুন'}
            </button>
          </div>

          {/* Dynamic Request Counter */}
          {rateLimitInfo && (
            <div 
              className="request-counter" 
              style={{
                textAlign: 'center',
                fontSize: '11px',
                color: rateLimitInfo.remaining <= 3 ? '#dc2626' : '#6b7280',
                marginTop: '6px',
                padding: '4px 8px',
                background: rateLimitInfo.isLimited ? '#fee2e2' : '#f3f4f6',
                borderRadius: '6px'
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {rateLimitInfo.count}/{rateLimitInfo.limit}
              </span>
              {' '}ব্যবহৃত
              {rateLimitInfo.remaining > 0 && (
                <span style={{ color: '#16a34a', marginLeft: '8px' }}>
                  ({rateLimitInfo.remaining}টি বাকি)
                </span>
              )}
              {rateLimitInfo.isLimited && (
                <span style={{ color: '#dc2626', display: 'block', marginTop: '2px' }}>
                  ⚠️ আজকের সীমা শেষ
                </span>
              )}
            </div>
          )}

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
          {docType !== 'generic' && (
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
                  key={`spell-${i}-${c.wrong}`}
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
                  key={`tone-${i}-${t.current}`}
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
                  key={`style-${i}-${s.current}`}
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
                    key={`mix-${i}-${c.current}`}
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
                  key={`punct-${i}`}
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
                  key={`euph-${i}-${e.current}`}
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
                  <div className="opt-desc">API Key, মডেল নির্বাচন</div>
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
              {/* API Key */}
              <label>🔑 Google Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="আপনার API Key এখানে দিন"
              />
              <p style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px', marginBottom: '12px' }}>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: '#667eea' }}
                >
                  API Key তৈরি করুন →
                </a>
              </p>

              {/* Model Selection with Dynamic Info */}
              <label>🤖 AI Model</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {MODEL_OPTIONS.map(opt => {
                  const modelInfo = getRateLimitInfo(opt.id);
                  const safeLimit = getSafeLimit(opt.id);
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setSelectedModel(opt.id)}
                      style={{
                        padding: '10px 12px',
                        border: selectedModel === opt.id ? '2px solid #667eea' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: selectedModel === opt.id ? '#eef2ff' : 'white',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>
                            {opt.name}
                            {opt.badge && (
                              <span style={{ 
                                marginLeft: '6px', 
                                fontSize: '10px', 
                                background: '#fef3c7', 
                                padding: '2px 6px', 
                                borderRadius: '4px' 
                              }}>
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                            {opt.desc} • দৈনিক {opt.rpd}টি
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ 
                            fontSize: '11px', 
                            fontWeight: 600,
                            color: modelInfo.isLimited ? '#dc2626' : '#16a34a'
                          }}>
                            {modelInfo.remaining}/{safeLimit}
                          </div>
                          <div style={{ fontSize: '9px', color: '#6b7280' }}>
                            বাকি
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Document Type */}
              <label>📂 ডকুমেন্ট টাইপ (ডিফল্ট)</label>
              <select value={docType} onChange={e => setDocType(e.target.value as DocType)}>
                {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
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
                <li>⚙️ সেটিংস থেকে API Key দিন</li>
                <li>📂 ডক টাইপ নির্বাচন করুন (ঐচ্ছিক)</li>
                <li>✍️ বাংলা টেক্সট সিলেক্ট করুন</li>
                <li>💬 টোন নির্বাচন করুন (ঐচ্ছিক)</li>
                <li>📝 ভাষারীতি নির্বাচন করুন (ঐচ্ছিক)</li>
                <li>🔍 "পরীক্ষা করুন" ক্লিক করুন</li>
                <li>✓ সাজেশনে ক্লিক করে সংশোধন করুন</li>
              </ol>
              <div style={{ 
                marginTop: '16px', 
                padding: '12px', 
                background: '#fef3c7', 
                borderRadius: '8px',
                fontSize: '11px'
              }}>
                <strong>💡 টিপস:</strong><br/>
                • <strong>Gemini 2.5 Flash</strong> সবচেয়ে ভালো কাজ করে (প্রস্তাবিত)<br/>
                • <strong>Gemini 2.0 Flash</strong> এ দৈনিক 1350টি পর্যন্ত request করা যায়
              </div>
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
              {TONE_OPTIONS.map(opt => (
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
              {STYLE_OPTIONS.map(opt => (
                <div
                  key={opt.id}
                  className={`option-item ${selectedStyle === opt.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedStyle(opt.id as StyleType);
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
              {(Object.keys(DOC_TYPE_CONFIG) as DocType[]).map(dt => {
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
