// src/utils/toonParser.ts

/**
 * Unified Response Interface
 * সব ধরনের বিশ্লেষণ ফলাফল একসাথে
 */
export interface UnifiedResponse {
  spellingErrors: Array<{
    wrong: string;
    suggestions: string[];
    position: number;
  }>;
  languageStyleMixing: {
    detected: boolean;
    recommendedStyle?: string;
    reason?: string;
    corrections?: Array<{
      current: string;
      suggestion: string;
      type: string;
      position: number;
    }>;
  };
  punctuationIssues: Array<{
    issue: string;
    currentSentence: string;
    correctedSentence: string;
    explanation: string;
    position: number;
  }>;
  euphonyImprovements: Array<{
    current: string;
    suggestions: string[];
    reason: string;
    position: number;
  }>;
  styleConversions: Array<{
    current: string;
    suggestion: string;
    type: string;
    position: number;
  }>;
  toneConversions: Array<{
    current: string;
    suggestion: string;
    reason: string;
    position: number;
  }>;
  contentAnalysis: {
    contentType: string;
    description?: string;
    missingElements?: string[];
    suggestions?: string[];
  } | null;
}

/**
 * Gemini response থেকে raw text বের করা
 */
export const extractTextFromGeminiResponse = (data: any): string | null => {
  try {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
};

/**
 * Unified TOON Parser - সব sections একসাথে parse করে
 */
export const parseUnifiedToon = (raw: string): UnifiedResponse => {
  const result: UnifiedResponse = {
    spellingErrors: [],
    languageStyleMixing: { detected: false },
    punctuationIssues: [],
    euphonyImprovements: [],
    styleConversions: [],
    toneConversions: [],
    contentAnalysis: null
  };

  // @ দিয়ে sections আলাদা করা
  const sections = raw.split(/^@/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0].trim().toUpperCase();
    const content = lines.slice(1);

    switch (header) {
      case 'SPELLING':
        result.spellingErrors = parseSpellingLines(content);
        break;

      case 'MIXING':
        result.languageStyleMixing = parseMixingLines(content);
        break;

      case 'PUNCTUATION':
        result.punctuationIssues = parsePunctuationLines(content);
        break;

      case 'EUPHONY':
        result.euphonyImprovements = parseEuphonyLines(content);
        break;

      case 'STYLE':
        result.styleConversions = parseStyleLines(content);
        break;

      case 'TONE':
        result.toneConversions = parseToneLines(content);
        break;

      case 'CONTENT':
        result.contentAnalysis = parseContentLines(content);
        break;
    }
  }

  return result;
};

/**
 * Parse SPELLING section
 * Format: ভুল|সঠিক১,সঠিক২|pos
 */
const parseSpellingLines = (lines: string[]): UnifiedResponse['spellingErrors'] => {
  const results: UnifiedResponse['spellingErrors'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('|')) continue;
    
    const parts = t.split('|').map(p => p.trim());
    if (parts.length >= 3 && parts[0] && parts[1]) {
      results.push({
        wrong: parts[0],
        suggestions: parts[1].split(',').map(s => s.trim()).filter(Boolean),
        position: parseInt(parts[2]) || 0
      });
    }
  }
  
  return results;
};

/**
 * Parse MIXING section
 * Format:
 * detected:true/false
 * style:চলিত/সাধু
 * reason:কারণ
 * @CORRECTIONS
 * বর্তমান|সংশোধন|টাইপ|pos
 */
const parseMixingLines = (lines: string[]): UnifiedResponse['languageStyleMixing'] => {
  const result: UnifiedResponse['languageStyleMixing'] = { detected: false };
  const corrections: NonNullable<UnifiedResponse['languageStyleMixing']['corrections']> = [];
  let inCorrections = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;

    if (t.toUpperCase() === 'CORRECTIONS' || t.toUpperCase() === '@CORRECTIONS') {
      inCorrections = true;
      continue;
    }

    if (inCorrections && t.includes('|')) {
      const parts = t.split('|').map(p => p.trim());
      if (parts.length >= 4 && parts[0] && parts[1]) {
        corrections.push({
          current: parts[0],
          suggestion: parts[1],
          type: parts[2] || '',
          position: parseInt(parts[3]) || 0
        });
      }
    } else if (t.includes(':')) {
      const idx = t.indexOf(':');
      const key = t.substring(0, idx).toLowerCase().trim();
      const val = t.substring(idx + 1).trim();
      
      if (key === 'detected') {
        result.detected = val.toLowerCase() === 'true' || val === 'হ্যাঁ';
      } else if (key === 'style') {
        result.recommendedStyle = val;
      } else if (key === 'reason') {
        result.reason = val;
      }
    }
  }

  if (corrections.length > 0) {
    result.corrections = corrections;
  }
  
  return result;
};

/**
 * Parse PUNCTUATION section
 * Format:
 * issue:সমস্যা
 * cur:বাক্য
 * fix:সংশোধিত
 * exp:ব্যাখ্যা
 * pos:0
 * ---
 */
const parsePunctuationLines = (lines: string[]): UnifiedResponse['punctuationIssues'] => {
  const issues: UnifiedResponse['punctuationIssues'] = [];
  let current: Partial<UnifiedResponse['punctuationIssues'][0]> = {};

  const pushCurrent = () => {
    if (current.issue || current.currentSentence) {
      issues.push({
        issue: current.issue || '',
        currentSentence: current.currentSentence || '',
        correctedSentence: current.correctedSentence || current.currentSentence || '',
        explanation: current.explanation || '',
        position: current.position || 0
      });
      current = {};
    }
  };

  for (const line of lines) {
    const t = line.trim();
    
    if (t === '---') {
      pushCurrent();
      continue;
    }
    
    if (!t || t.startsWith('#')) continue;

    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.substring(0, idx).toLowerCase().trim();
      const val = t.substring(idx + 1).trim();

      switch (key) {
        case 'issue':
          current.issue = val;
          break;
        case 'cur':
        case 'current':
          current.currentSentence = val;
          break;
        case 'fix':
        case 'corrected':
          current.correctedSentence = val;
          break;
        case 'exp':
        case 'explanation':
          current.explanation = val;
          break;
        case 'pos':
        case 'position':
          current.position = parseInt(val) || 0;
          break;
      }
    }
  }
  
  pushCurrent();
  return issues;
};

/**
 * Parse EUPHONY section
 * Format: শব্দ|বিকল্প১,বিকল্প২|কারণ|pos
 */
const parseEuphonyLines = (lines: string[]): UnifiedResponse['euphonyImprovements'] => {
  const results: UnifiedResponse['euphonyImprovements'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('|')) continue;
    
    const parts = t.split('|').map(p => p.trim());
    if (parts.length >= 4 && parts[0] && parts[1]) {
      results.push({
        current: parts[0],
        suggestions: parts[1].split(',').map(s => s.trim()).filter(Boolean),
        reason: parts[2] || '',
        position: parseInt(parts[3]) || 0
      });
    }
  }
  
  return results;
};

/**
 * Parse STYLE section
 * Format: বর্তমান|সংশোধিত|টাইপ|pos
 */
const parseStyleLines = (lines: string[]): UnifiedResponse['styleConversions'] => {
  const results: UnifiedResponse['styleConversions'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('|')) continue;
    
    const parts = t.split('|').map(p => p.trim());
    if (parts.length >= 4 && parts[0] && parts[1]) {
      results.push({
        current: parts[0],
        suggestion: parts[1],
        type: parts[2] || '',
        position: parseInt(parts[3]) || 0
      });
    }
  }
  
  return results;
};

/**
 * Parse TONE section
 * Format: বর্তমান|সংশোধিত|কারণ|pos
 */
const parseToneLines = (lines: string[]): UnifiedResponse['toneConversions'] => {
  const results: UnifiedResponse['toneConversions'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('|')) continue;
    
    const parts = t.split('|').map(p => p.trim());
    if (parts.length >= 4 && parts[0] && parts[1]) {
      results.push({
        current: parts[0],
        suggestion: parts[1],
        reason: parts[2] || '',
        position: parseInt(parts[3]) || 0
      });
    }
  }
  
  return results;
};

/**
 * Parse CONTENT section
 * Format:
 * type:লেখার ধরন
 * desc:সংক্ষিপ্ত বর্ণনা
 * missing:যা নেই১,যা নেই২
 * tips:পরামর্শ১,পরামর্শ২
 */
const parseContentLines = (lines: string[]): UnifiedResponse['contentAnalysis'] => {
  const result: NonNullable<UnifiedResponse['contentAnalysis']> = {
    contentType: '',
    description: '',
    missingElements: [],
    suggestions: []
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;

    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.substring(0, idx).toLowerCase().trim();
      const val = t.substring(idx + 1).trim();

      switch (key) {
        case 'type':
          result.contentType = val;
          break;
        case 'desc':
        case 'description':
          result.description = val;
          break;
        case 'missing':
          result.missingElements = val.split(',').map(s => s.trim()).filter(Boolean);
          break;
        case 'tips':
        case 'suggestions':
          result.suggestions = val.split(',').map(s => s.trim()).filter(Boolean);
          break;
      }
    }
  }

  return result.contentType ? result : null;
};

/**
 * Auto-detect parser (TOON বা JSON fallback)
 */
export const parseAIResponse = (raw: string): UnifiedResponse | null => {
  const trimmed = raw.trim();
  
  // TOON format check
  if (
    trimmed.includes('@SPELLING') || 
    trimmed.includes('@MIXING') || 
    trimmed.includes('@PUNCTUATION') || 
    trimmed.includes('@STYLE') ||
    trimmed.includes('@TONE') || 
    trimmed.includes('@EUPHONY') ||
    trimmed.includes('@CONTENT')
  ) {
    return parseUnifiedToon(trimmed);
  }

  // JSON fallback (backward compatibility)
  try {
    let cleaned = trimmed;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const json = JSON.parse(cleaned);
    
    return {
      spellingErrors: json.spellingErrors || [],
      languageStyleMixing: json.languageStyleMixing || { detected: false },
      punctuationIssues: json.punctuationIssues || [],
      euphonyImprovements: json.euphonyImprovements || [],
      styleConversions: json.styleConversions || [],
      toneConversions: json.toneConversions || [],
      contentAnalysis: json.contentAnalysis || null
    };
  } catch {
    console.warn('Parse failed:', trimmed.substring(0, 300));
    return null;
  }
};
