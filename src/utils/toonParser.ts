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
 * Unified TOON Parser
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

  const sections = raw.split(/^@/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0].trim().toUpperCase();
    const content = lines.slice(1);

    switch (header) {
      case 'SPELLING':
        result.spellingErrors = parsePipeLines(content, 3).map(p => ({
          wrong: p[0],
          suggestions: p[1].split(',').map(s => s.trim()).filter(Boolean),
          position: parseInt(p[2]) || 0
        }));
        break;

      case 'MIXING':
        result.languageStyleMixing = parseMixingLines(content);
        break;

      case 'PUNCTUATION':
        result.punctuationIssues = parsePunctuationLines(content);
        break;

      case 'EUPHONY':
        result.euphonyImprovements = parsePipeLines(content, 4).map(p => ({
          current: p[0],
          suggestions: p[1].split(',').map(s => s.trim()).filter(Boolean),
          reason: p[2],
          position: parseInt(p[3]) || 0
        }));
        break;

      case 'STYLE':
        result.styleConversions = parsePipeLines(content, 4).map(p => ({
          current: p[0],
          suggestion: p[1],
          type: p[2],
          position: parseInt(p[3]) || 0
        }));
        break;

      case 'TONE':
        result.toneConversions = parsePipeLines(content, 4).map(p => ({
          current: p[0],
          suggestion: p[1],
          reason: p[2],
          position: parseInt(p[3]) || 0
        }));
        break;

      case 'CONTENT':
        result.contentAnalysis = parseContentLines(content);
        break;
    }
  }

  return result;
};

// Helper: Parse pipe-separated lines
const parsePipeLines = (lines: string[], minParts: number): string[][] => {
  const results: string[][] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.includes(':') && !t.includes('|')) continue;
    const parts = t.split('|').map(p => p.trim());
    if (parts.length >= minParts) {
      results.push(parts);
    }
  }
  return results;
};

// Parse MIXING section
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
      if (parts.length >= 4) {
        corrections.push({
          current: parts[0],
          suggestion: parts[1],
          type: parts[2],
          position: parseInt(parts[3]) || 0
        });
      }
    } else if (t.includes(':')) {
      const idx = t.indexOf(':');
      const key = t.substring(0, idx).toLowerCase();
      const val = t.substring(idx + 1).trim();
      
      if (key === 'detected') result.detected = val.toLowerCase() === 'true';
      else if (key === 'style') result.recommendedStyle = val;
      else if (key === 'reason') result.reason = val;
    }
  }

  if (corrections.length > 0) result.corrections = corrections;
  return result;
};

// Parse PUNCTUATION section
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

// Parse CONTENT section
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
      const key = t.substring(0, idx).toLowerCase();
      const val = t.substring(idx + 1).trim();

      switch (key) {
        case 'type': result.contentType = val; break;
        case 'desc': case 'description': result.description = val; break;
        case 'missing': result.missingElements = val.split(',').map(s => s.trim()).filter(Boolean); break;
        case 'tips': case 'suggestions': result.suggestions = val.split(',').map(s => s.trim()).filter(Boolean); break;
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
  if (trimmed.includes('@SPELLING') || trimmed.includes('@MIXING') || 
      trimmed.includes('@PUNCTUATION') || trimmed.includes('@STYLE') ||
      trimmed.includes('@TONE') || trimmed.includes('@EUPHONY') ||
      trimmed.includes('@CONTENT')) {
    return parseUnifiedToon(trimmed);
  }

  // JSON fallback
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
