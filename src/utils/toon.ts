// src/utils/toon.ts

/**
 * Helper to parse a specific value based on expected type
 */
const cleanValue = (val: string): string => val.trim();

const parseArray = (val: string): string[] => {
  // Handles comma separated values or new lines
  return val.split(/,|،|\n/).map(s => s.trim()).filter(s => s.length > 0);
};

const parseNumber = (val: string): number => {
  const num = parseInt(val.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? -1 : num;
};

/**
 * Parses a single TOON block into an object
 */
const parseBlock = <T>(blockText: string): T => {
  const result: any = {};
  
  // Regex to find @key: value pairs (handles multi-line values)
  // Looks for @key: followed by content until the next @key or end of string
  const keyRegex = /@(\w+):([\s\S]*?)(?=(?:@\w+:)|$)/g;
  
  let match;
  while ((match = keyRegex.exec(blockText)) !== null) {
    const key = match[1];
    const rawValue = match[2].trim();

    // Field-specific parsing logic based on key names common in your app
    if (key === 'suggestions' || key === 'missingElements') {
      result[key] = parseArray(rawValue);
    } else if (key === 'position') {
      result[key] = parseNumber(rawValue);
    } else if (key === 'detected') {
      result[key] = rawValue.toLowerCase() === 'true';
    } else {
      result[key] = cleanValue(rawValue);
    }
  }
  return result as T;
};

/**
 * Parses the full AI response text containing multiple sections (e.g. [[SPELLING]])
 */
export const parseToonResponse = (text: string) => {
  // Default structure
  const output = {
    spellingErrors: [] as any[],
    languageStyleMixing: { detected: false, corrections: [] as any[] },
    punctuationIssues: [] as any[],
    euphonyImprovements: [] as any[],
    toneConversions: [] as any[],
    styleConversions: [] as any[]
  };

  // 1. Split by Section Headers (e.g. [[SPELLING]])
  const sectionRegex = /\[\[([A-Z_]+)\]\]([\s\S]*?)(?=\[\[|$)/g;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(text)) !== null) {
    const sectionName = sectionMatch[1];
    const sectionContent = sectionMatch[2];

    // 2. Split items within a section by delimiter "---"
    const items = sectionContent.split('---').filter(i => i.trim().length > 0);

    items.forEach(itemStr => {
      const obj = parseBlock(itemStr);
      if (Object.keys(obj).length === 0) return;

      switch (sectionName) {
        case 'SPELLING':
          output.spellingErrors.push(obj);
          break;
        case 'PUNCTUATION':
          output.punctuationIssues.push(obj);
          break;
        case 'EUPHONY':
          output.euphonyImprovements.push(obj);
          break;
        case 'TONE':
          output.toneConversions.push(obj);
          break;
        case 'STYLE_CONVERSION':
          output.styleConversions.push(obj);
          break;
        case 'MIXING_META':
          // Special case for mixing metadata
          Object.assign(output.languageStyleMixing, obj);
          break;
        case 'MIXING_ITEMS':
           // @ts-ignore
          output.languageStyleMixing.corrections.push(obj);
          break;
      }
    });
  }

  return output;
};