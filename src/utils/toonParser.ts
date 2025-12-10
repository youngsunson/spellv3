// src/utils/toonParser.ts

/**
 * Unified Response Interface
 * position optional রাখা হয়েছে App.tsx এর সাথে compatibility এর জন্য
 */
export interface UnifiedResponse {
  spellingErrors: Array<{
    wrong: string;
    suggestions: string[];
    position?: number;
  }>;
  languageStyleMixing: {
    detected: boolean;
    recommendedStyle?: string;
    reason?: string;
    corrections?: Array<{
      current: string;
      suggestion: string;
      type: string;
      position?: number;
    }>;
  };
  punctuationIssues: Array<{
    issue: string;
    currentSentence: string;
    correctedSentence: string;
    explanation: string;
    position?: number;
  }>;
  euphonyImprovements: Array<{
    current: string;
    suggestions: string[];
    reason: string;
    position?: number;
  }>;
  styleConversions: Array<{
    current: string;
    suggestion: string;
    type: string;
    position?: number;
  }>;
  toneConversions: Array<{
    current: string;
    suggestion: string;
    reason: string;
    position?: number;
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
 * Normalize text for comparison
 */
const normalizeText = (text: string): string => {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
};

/**
 * Remove duplicates from array based on a key
 */
const removeDuplicates = <T>(arr: T[], keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return arr.filter(item => {
    const key = normalizeText(keyFn(item));
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

/**
 * Validate spelling errors
 */
const validateSpellingErrors = (
  errors: UnifiedResponse['spellingErrors'],
  maxAllowed: number
): UnifiedResponse['spellingErrors'] => {
  // Remove duplicates
  const unique = removeDuplicates(errors, item => item.wrong);
  
  // Limit to maxAllowed
  const limited = unique.slice(0, maxAllowed);
  
  // Filter out suspicious entries (empty, too short, numbers, English)
  const filtered = limited.filter(err => {
    const word = err.wrong.trim();
    if (!word || word.length < 2) return false;
    if (/^\d+$/.test(word)) return false; // Pure numbers
    if (/^[a-zA-Z]+$/.test(word)) return false; // Pure English
    if (err.suggestions.length === 0) return false;
    return true;
  });
  
  return filtered;
};

/**
 * Unified TOON Parser
 */
export const parseUnifiedToon = (raw: string, wordCount?: number): UnifiedResponse => {
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

  // Validate and deduplicate spelling errors
  const maxErrors = wordCount ? Math.min(50, Math.ceil(wordCount * 0.5)) : 50;
  result.spellingErrors = validateSpellingErrors(result.spellingErrors, maxErrors);

  // Deduplicate other sections
  result.toneConversions = removeDuplicates(result.toneConversions, item => item.current);
  result.styleConversions = removeDuplicates(result.styleConversions, item => item.current);
  result.euphonyImprovements = removeDuplicates(result.euphonyImprovements, item => item.current);
  
  if (result.languageStyleMixing.corrections) {
    result.languageStyleMixing.corrections = removeDuplicates(
      result.languageStyleMixing.corrections, 
      item => item.current
    );
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
      const wrong = parts[0];
      const suggestions = parts[1].split(',').map(s => s.trim()).filter(Boolean);
      const position = parseInt(parts[2]) || 0;
      
      // Skip if wrong word is empty or too short
      if (wrong.length < 2) continue;
      
      // Skip if no valid suggestions
      if (suggestions.length === 0) continue;
      
      results.push({ wrong, suggestions, position });
    }
  }
  
  return results;
};

/**
 * Parse MIXING section
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
        position: current.position ?? 0
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
  
  // Limit punctuation issues
  return issues.slice(0, 10);
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
  
  // Limit euphony improvements
  return results.slice(0, 10);
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
  
  return results.slice(0, 30);
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
  
  return results.slice(0, 30);
};

/**
 * Parse CONTENT section
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
    if (!t || t.startsWith('#') || t.startsWith('@')) continue;

    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.substring(0, idx).toLowerCase().trim();
      const val = t.substring(idx + 1).trim();

      switch (key) {
        case 'type':
        case 'contenttype':
        case 'ধরন':
        case 'টাইপ':
          result.contentType = val;
          break;
        case 'desc':
        case 'description':
        case 'বর্ণনা':
          result.description = val;
          break;
        case 'missing':
        case 'missingelements':
        case 'অনুপস্থিত':
          result.missingElements = val.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
          break;
        case 'tips':
        case 'suggestions':
        case 'পরামর্শ':
        case 'সাজেশন':
          result.suggestions = val.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
          break;
      }
    }
  }

  // যদি কোনো content থাকে তাহলে return করো
  if (result.contentType || result.description || 
      (result.missingElements && result.missingElements.length > 0) ||
      (result.suggestions && result.suggestions.length > 0)) {
    return result;
  }

  return null;
};

/**
 * Auto-detect parser (TOON বা JSON fallback)
 */
export const parseAIResponse = (raw: string, wordCount?: number): UnifiedResponse | null => {
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
    return parseUnifiedToon(trimmed, wordCount);
  }

  // JSON fallback (backward compatibility)
  try {
    let cleaned = trimmed;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const json = JSON.parse(cleaned);
    
    const result: UnifiedResponse = {
      spellingErrors: json.spellingErrors || [],
      languageStyleMixing: json.languageStyleMixing || { detected: false },
      punctuationIssues: json.punctuationIssues || [],
      euphonyImprovements: json.euphonyImprovements || [],
      styleConversions: json.styleConversions || [],
      toneConversions: json.toneConversions || [],
      contentAnalysis: json.contentAnalysis || null
    };

    // Apply validation
    const maxErrors = wordCount ? Math.min(50, Math.ceil(wordCount * 0.5)) : 50;
    result.spellingErrors = validateSpellingErrors(result.spellingErrors, maxErrors);
    
    return result;
  } catch {
    console.warn('Parse failed:', trimmed.substring(0, 300));
    return null;
  }
};
