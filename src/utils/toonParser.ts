// src/utils/toonParser.ts
/**
 * TOON (Token-Oriented Object Notation) Parser
 * AI-friendly, কম টোকেন ব্যবহার করে, পার্সিং সহজ
 */

export interface ParsedMainResponse {
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
}

export interface ParsedStyleResponse {
  styleConversions: Array<{
    current: string;
    suggestion: string;
    type: string;
    position: number;
  }>;
}

export interface ParsedToneResponse {
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
 * TOON থেকে Main Response পার্স করা
 */
export const parseMainToon = (raw: string): ParsedMainResponse => {
  const result: ParsedMainResponse = {
    spellingErrors: [],
    languageStyleMixing: { detected: false },
    punctuationIssues: [],
    euphonyImprovements: []
  };

  const sections = raw.split(/^@/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0].trim().toUpperCase();
    const content = lines.slice(1);

    switch (header) {
      case 'SPELLING':
        result.spellingErrors = parseSpellingSection(content);
        break;
      case 'MIXING':
        result.languageStyleMixing = parseMixingSection(content);
        break;
      case 'PUNCTUATION':
        result.punctuationIssues = parsePunctuationSection(content);
        break;
      case 'EUPHONY':
        result.euphonyImprovements = parseEuphonySection(content);
        break;
    }
  }

  return result;
};

/**
 * Spelling section পার্স করা
 * Format: ভুল_শব্দ|সঠিক১,সঠিক২|position
 */
const parseSpellingSection = (lines: string[]): ParsedMainResponse['spellingErrors'] => {
  const errors: ParsedMainResponse['spellingErrors'] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const parts = trimmed.split('|');
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

/**
 * Mixing section পার্স করা
 * Format:
 * detected:true/false
 * style:চলিত/সাধু
 * reason:কারণ
 * @CORRECTIONS
 * বর্তমান|সংশোধন|টাইপ|position
 */
const parseMixingSection = (lines: string[]): ParsedMainResponse['languageStyleMixing'] => {
  const result: ParsedMainResponse['languageStyleMixing'] = { detected: false };
  const corrections: ParsedMainResponse['languageStyleMixing']['corrections'] = [];
  let inCorrections = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.toUpperCase() === 'CORRECTIONS' || trimmed.toUpperCase() === '@CORRECTIONS') {
      inCorrections = true;
      continue;
    }

    if (inCorrections) {
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        corrections.push({
          current: parts[0].trim(),
          suggestion: parts[1].trim(),
          type: parts[2].trim(),
          position: parseInt(parts[3]) || 0
        });
      }
    } else {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      switch (key.toLowerCase()) {
        case 'detected':
          result.detected = value.toLowerCase() === 'true' || value === '১' || value === 'হ্যাঁ';
          break;
        case 'style':
          result.recommendedStyle = value;
          break;
        case 'reason':
          result.reason = value;
          break;
      }
    }
  }

  if (corrections.length > 0) {
    result.corrections = corrections;
  }

  return result;
};

/**
 * Punctuation section পার্স করা
 * Format:
 * issue:সমস্যা
 * cur:বর্তমান বাক্য
 * fix:সংশোধিত বাক্য
 * exp:ব্যাখ্যা
 * pos:position
 * ---
 */
const parsePunctuationSection = (lines: string[]): ParsedMainResponse['punctuationIssues'] => {
  const issues: ParsedMainResponse['punctuationIssues'] = [];
  let current: Partial<ParsedMainResponse['punctuationIssues'][0]> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '---' || trimmed === '') {
      if (current.issue && current.currentSentence) {
        issues.push({
          issue: current.issue || '',
          currentSentence: current.currentSentence || '',
          correctedSentence: current.correctedSentence || current.currentSentence || '',
          explanation: current.explanation || '',
          position: current.position || 0
        });
        current = {};
      }
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.substring(0, colonIdx).toLowerCase();
      const value = trimmed.substring(colonIdx + 1).trim();

      switch (key) {
        case 'issue':
          current.issue = value;
          break;
        case 'cur':
        case 'current':
          current.currentSentence = value;
          break;
        case 'fix':
        case 'corrected':
          current.correctedSentence = value;
          break;
        case 'exp':
        case 'explanation':
          current.explanation = value;
          break;
        case 'pos':
        case 'position':
          current.position = parseInt(value) || 0;
          break;
      }
    }
  }

  // Last item
  if (current.issue && current.currentSentence) {
    issues.push({
      issue: current.issue || '',
      currentSentence: current.currentSentence || '',
      correctedSentence: current.correctedSentence || current.currentSentence || '',
      explanation: current.explanation || '',
      position: current.position || 0
    });
  }

  return issues;
};

/**
 * Euphony section পার্স করা
 * Format: বর্তমান|বিকল্প১,বিকল্প২|কারণ|position
 */
const parseEuphonySection = (lines: string[]): ParsedMainResponse['euphonyImprovements'] => {
  const improvements: ParsedMainResponse['euphonyImprovements'] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('|');
    if (parts.length >= 4) {
      improvements.push({
        current: parts[0].trim(),
        suggestions: parts[1].split(',').map(s => s.trim()).filter(Boolean),
        reason: parts[2].trim(),
        position: parseInt(parts[3]) || 0
      });
    }
  }

  return improvements;
};

/**
 * Style Response পার্স করা
 * Format:
 * @STYLE
 * বর্তমান|সংশোধন|টাইপ|position
 */
export const parseStyleToon = (raw: string): ParsedStyleResponse => {
  const result: ParsedStyleResponse = { styleConversions: [] };
  
  const lines = raw.split('\n');
  let inStyle = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.toUpperCase() === '@STYLE' || trimmed.toUpperCase() === 'STYLE') {
      inStyle = true;
      continue;
    }

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) continue;

    if (inStyle) {
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        result.styleConversions.push({
          current: parts[0].trim(),
          suggestion: parts[1].trim(),
          type: parts[2].trim(),
          position: parseInt(parts[3]) || 0
        });
      }
    }
  }

  return result;
};

/**
 * Tone Response পার্স করা
 * Format:
 * @TONE
 * বর্তমান|সংশোধন|কারণ|position
 */
export const parseToneToon = (raw: string): ParsedToneResponse => {
  const result: ParsedToneResponse = { toneConversions: [] };
  
  const lines = raw.split('\n');
  let inTone = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.toUpperCase() === '@TONE' || trimmed.toUpperCase() === 'TONE') {
      inTone = true;
      continue;
    }

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) continue;

    if (inTone) {
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        result.toneConversions.push({
          current: parts[0].trim(),
          suggestion: parts[1].trim(),
          reason: parts[2].trim(),
          position: parseInt(parts[3]) || 0
        });
      }
    }
  }

  return result;
};

/**
 * Auto-detect এবং parse করা (JSON fallback সহ)
 */
export const parseAIResponse = (raw: string): any => {
  const trimmed = raw.trim();
  
  // TOON format check
  if (trimmed.includes('@SPELLING') || trimmed.includes('@MIXING') || 
      trimmed.includes('@PUNCTUATION') || trimmed.includes('@EUPHONY')) {
    return parseMainToon(trimmed);
  }
  
  if (trimmed.includes('@STYLE')) {
    return parseStyleToon(trimmed);
  }
  
  if (trimmed.includes('@TONE')) {
    return parseToneToon(trimmed);
  }

  // JSON fallback (backward compatibility)
  try {
    // Clean markdown code blocks if present
    let cleaned = trimmed;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(cleaned);
  } catch {
    console.warn('Failed to parse response:', trimmed.substring(0, 200));
    return null;
  }
};