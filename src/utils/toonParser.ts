// src/utils/toonParser.ts

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
 * Unified TOON Parser - সব sections একসাথে parse
 */
export const parseUnifiedToon = (raw: string): UnifiedResponse => {
  const result: UnifiedResponse = {
    spellingErrors: [],
    languageStyleMixing: { detected: false },
    punctuationIssues: [],
    euphonyImprovements: [],
    styleConversions: [],
    toneConversions: []
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
    }
  }

  return result;
};

// ভুল|সঠিক১,সঠিক২|pos
const parseSpellingLines = (lines: string[]) => {
  const errors: UnifiedResponse['spellingErrors'] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split('|');
    if (parts.length >= 3) {
      errors.push({
        wrong: parts[0].trim(),
        suggestions: parts[1].split(',').map(s => s.trim()).filter(Boolean),
        position: parseInt(parts[2]) || 0
      });
    }
  }
  return errors;
};

// detected:true, style:চলিত, reason:..., @CORRECTIONS বর্তমান|সংশোধন|টাইপ|pos
const parseMixingLines = (lines: string[]) => {
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

    if (inCorrections) {
      const parts = t.split('|');
      if (parts.length >= 4) {
        corrections.push({
          current: parts[0].trim(),
          suggestion: parts[1].trim(),
          type: parts[2].trim(),
          position: parseInt(parts[3]) || 0
        });
      }
    } else {
      const idx = t.indexOf(':');
      if (idx > 0) {
        const key = t.substring(0, idx).toLowerCase();
        const val = t.substring(idx + 1).trim();
        if (key === 'detected') result.detected = val.toLowerCase() === 'true';
        else if (key === 'style') result.recommendedStyle = val;
        else if (key === 'reason') result.reason = val;
      }
    }
  }

  if (corrections.length > 0) result.corrections = corrections;
  return result;
};

// issue:, cur:, fix:, exp:, pos:, ---
const parsePunctuationLines = (lines: string[]) => {
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
    if (t === '---') { pushCurrent(); continue; }
    if (!t || t.startsWith('#')) continue;

    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.substring(0, idx).toLowerCase();
      const val = t.substring(idx + 1).trim();
      switch (key) {
        case 'issue': current.issue = val; break;
        case 'cur': case 'current': current.currentSentence = val; break;
        case 'fix': case 'corrected': current.correctedSentence = val; break;
        case 'exp': case 'explanation': current.explanation = val; break;
        case 'pos': case 'position': current.position = parseInt(val) || 0; break;
      }
    }
  }
  pushCurrent();
  return issues;
};

// শব্দ|বিকল্প১,বিকল্প২|কারণ|pos
const parseEuphonyLines = (lines: string[]) => {
  const items: UnifiedResponse['euphonyImprovements'] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split('|');
    if (parts.length >= 4) {
      items.push({
        current: parts[0].trim(),
        suggestions: parts[1].split(',').map(s => s.trim()).filter(Boolean),
        reason: parts[2].trim(),
        position: parseInt(parts[3]) || 0
      });
    }
  }
  return items;
};

// বর্তমান|সংশোধিত|টাইপ|pos
const parseStyleLines = (lines: string[]) => {
  const items: UnifiedResponse['styleConversions'] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split('|');
    if (parts.length >= 4) {
      items.push({
        current: parts[0].trim(),
        suggestion: parts[1].trim(),
        type: parts[2].trim(),
        position: parseInt(parts[3]) || 0
      });
    }
  }
  return items;
};

// বর্তমান|সংশোধিত|কারণ|pos
const parseToneLines = (lines: string[]) => {
  const items: UnifiedResponse['toneConversions'] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split('|');
    if (parts.length >= 4) {
      items.push({
        current: parts[0].trim(),
        suggestion: parts[1].trim(),
        reason: parts[2].trim(),
        position: parseInt(parts[3]) || 0
      });
    }
  }
  return items;
};

/**
 * Auto-detect parser (TOON or JSON fallback)
 */
export const parseAIResponse = (raw: string): UnifiedResponse | null => {
  const trimmed = raw.trim();
  
  // TOON format check
  if (trimmed.includes('@SPELLING') || trimmed.includes('@MIXING') || 
      trimmed.includes('@PUNCTUATION') || trimmed.includes('@STYLE') ||
      trimmed.includes('@TONE') || trimmed.includes('@EUPHONY')) {
    return parseUnifiedToon(trimmed);
  }

  // JSON fallback
  try {
    let cleaned = trimmed;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const json = JSON.parse(cleaned);
    // JSON to unified format
    return {
      spellingErrors: json.spellingErrors || [],
      languageStyleMixing: json.languageStyleMixing || { detected: false },
      punctuationIssues: json.punctuationIssues || [],
      euphonyImprovements: json.euphonyImprovements || [],
      styleConversions: json.styleConversions || [],
      toneConversions: json.toneConversions || []
    };
  } catch {
    console.warn('Parse failed:', trimmed.substring(0, 200));
    return null;
  }
};
