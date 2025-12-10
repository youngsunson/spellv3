// src/utils/toonParser.ts

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

export const extractTextFromGeminiResponse = (data: any): string | null => {
  try {
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
};

const normalizeText = (text: string): string => {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
};

const removeDuplicates = <T>(arr: T[], keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return arr.filter(item => {
    const key = normalizeText(keyFn(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const validateSpellingErrors = (
  errors: UnifiedResponse['spellingErrors'],
  maxAllowed: number
): UnifiedResponse['spellingErrors'] => {
  const unique = removeDuplicates(errors, item => item.wrong);
  const limited = unique.slice(0, maxAllowed);
  
  const filtered = limited.filter(err => {
    const word = err.wrong.trim();
    if (!word || word.length < 2) return false;
    if (/^\d+$/.test(word)) return false;
    if (/^[a-zA-Z]+$/.test(word)) return false;
    if (err.suggestions.length === 0) return false;
    return true;
  });
  
  return filtered;
};

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

  console.log('═══════════════════════════════════════');
  console.log('🔍 TOON PARSER - Starting Analysis');
  console.log('═══════════════════════════════════════');
  console.log('📄 Raw response length:', raw.length);
  console.log('📝 First 500 chars:', raw.substring(0, 500));
  console.log('═══════════════════════════════════════\n');

  // Split by @ sections
  const sections = raw.split(/^@/m).filter(s => s.trim());
  console.log('📦 Total sections found:', sections.length, '\n');

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0].trim().toUpperCase();
    const content = lines.slice(1);

    console.log(`\n┌─────────────────────────────────────┐`);
    console.log(`│ Section: ${header.padEnd(28)} │`);
    console.log(`│ Content lines: ${String(content.length).padEnd(22)} │`);
    console.log(`└─────────────────────────────────────┘`);

    switch (header) {
      case 'SPELLING':
        result.spellingErrors = parseSpellingLines(content);
        console.log(`✅ Spelling errors found: ${result.spellingErrors.length}`);
        break;

      case 'MIXING':
        result.languageStyleMixing = parseMixingLines(content);
        console.log(`✅ Mixing detected: ${result.languageStyleMixing.detected}`);
        break;

      case 'PUNCTUATION':
        result.punctuationIssues = parsePunctuationLines(content);
        console.log(`✅ Punctuation issues found: ${result.punctuationIssues.length}`);
        if (result.punctuationIssues.length > 0) {
          result.punctuationIssues.forEach((p, i) => {
            console.log(`   ${i + 1}. ${p.issue} (pos: ${p.position})`);
          });
        }
        break;

      case 'EUPHONY':
        result.euphonyImprovements = parseEuphonyLines(content);
        console.log(`✅ Euphony improvements found: ${result.euphonyImprovements.length}`);
        if (result.euphonyImprovements.length > 0) {
          result.euphonyImprovements.forEach((e, i) => {
            console.log(`   ${i + 1}. "${e.current}" → ${e.suggestions.join(', ')}`);
          });
        }
        break;

      case 'STYLE':
        result.styleConversions = parseStyleLines(content);
        console.log(`✅ Style conversions found: ${result.styleConversions.length}`);
        break;

      case 'TONE':
        result.toneConversions = parseToneLines(content);
        console.log(`✅ Tone conversions found: ${result.toneConversions.length}`);
        break;

      case 'CONTENT':
        result.contentAnalysis = parseContentLines(content);
        console.log(`✅ Content analysis:`, result.contentAnalysis ? 'Found' : 'Not found');
        if (result.contentAnalysis) {
          console.log(`   Type: ${result.contentAnalysis.contentType}`);
          console.log(`   Missing: ${result.contentAnalysis.missingElements?.length || 0} items`);
          console.log(`   Tips: ${result.contentAnalysis.suggestions?.length || 0} items`);
        }
        break;
    }
  }

  // Validate and deduplicate
  const maxErrors = wordCount ? Math.min(50, Math.ceil(wordCount * 0.5)) : 50;
  result.spellingErrors = validateSpellingErrors(result.spellingErrors, maxErrors);
  result.toneConversions = removeDuplicates(result.toneConversions, item => item.current);
  result.styleConversions = removeDuplicates(result.styleConversions, item => item.current);
  result.euphonyImprovements = removeDuplicates(result.euphonyImprovements, item => item.current);
  
  if (result.languageStyleMixing.corrections) {
    result.languageStyleMixing.corrections = removeDuplicates(
      result.languageStyleMixing.corrections, 
      item => item.current
    );
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📊 FINAL RESULTS:');
  console.log('═══════════════════════════════════════');
  console.log(`Spelling: ${result.spellingErrors.length}`);
  console.log(`Punctuation: ${result.punctuationIssues.length}`);
  console.log(`Euphony: ${result.euphonyImprovements.length}`);
  console.log(`Mixing: ${result.languageStyleMixing.detected ? 'Yes' : 'No'}`);
  console.log(`Style: ${result.styleConversions.length}`);
  console.log(`Tone: ${result.toneConversions.length}`);
  console.log(`Content: ${result.contentAnalysis ? 'Yes' : 'No'}`);
  console.log('═══════════════════════════════════════\n');

  return result;
};

const parseSpellingLines = (lines: string[]): UnifiedResponse['spellingErrors'] => {
  const results: UnifiedResponse['spellingErrors'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('[') || t.startsWith('ফরম্যাট') || t.startsWith('উদাহরণ')) continue;
    if (!t.includes('|')) continue;
    
    const parts = t.split('|').map(p => p.trim());
    if (parts.length >= 3 && parts[0] && parts[1]) {
      const wrong = parts[0];
      const suggestions = parts[1].split(',').map(s => s.trim()).filter(Boolean);
      const position = parseInt(parts[2]) || 0;
      
      if (wrong.length >= 2 && suggestions.length > 0) {
        results.push({ wrong, suggestions, position });
      }
    }
  }
  
  return results;
};

const parseMixingLines = (lines: string[]): UnifiedResponse['languageStyleMixing'] => {
  const result: UnifiedResponse['languageStyleMixing'] = { detected: false };
  const corrections: NonNullable<UnifiedResponse['languageStyleMixing']['corrections']> = [];
  let inCorrections = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;

    if (t.toUpperCase().includes('CORRECTIONS')) {
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

const parsePunctuationLines = (lines: string[]): UnifiedResponse['punctuationIssues'] => {
  const issues: UnifiedResponse['punctuationIssues'] = [];
  let current: Partial<UnifiedResponse['punctuationIssues'][0]> = {};

  console.log('  🔸 Parsing PUNCTUATION section:');
  console.log('  Lines to parse:', lines.length);

  const pushCurrent = () => {
    if (current.currentSentence || current.issue) {
      issues.push({
        issue: current.issue || 'বিরাম চিহ্ন সমস্যা',
        currentSentence: current.currentSentence || '',
        correctedSentence: current.correctedSentence || current.currentSentence || '',
        explanation: current.explanation || '',
        position: current.position ?? 0
      });
      console.log(`    ✓ Added issue: "${current.issue}" at pos ${current.position}`);
      current = {};
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    
    console.log(`    Line ${i}: "${t.substring(0, 50)}..."`);
    
    // Skip empty, comments, examples, format lines
    if (!t || t.startsWith('#') || t.startsWith('[') || 
        t.startsWith('ফরম্যাট') || t.startsWith('উদাহরণ') ||
        t.startsWith('প্রতিটি') || t.startsWith('⚠️')) {
      continue;
    }
    
    // Separator
    if (t === '---' || t.match(/^-{3,}$/)) {
      console.log(`    → Separator found, pushing current`);
      pushCurrent();
      continue;
    }

    // Key:Value parsing
    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.substring(0, idx).toLowerCase().trim();
      const val = t.substring(idx + 1).trim();

      switch (key) {
        case 'issue':
        case 'সমস্যা':
          current.issue = val;
          console.log(`      ↳ Issue: ${val}`);
          break;
        case 'cur':
        case 'current':
        case 'বর্তমান':
          current.currentSentence = val;
          console.log(`      ↳ Current: ${val.substring(0, 30)}...`);
          break;
        case 'fix':
        case 'fixed':
        case 'corrected':
        case 'সংশোধিত':
          current.correctedSentence = val;
          console.log(`      ↳ Fixed: ${val.substring(0, 30)}...`);
          break;
        case 'exp':
        case 'explanation':
        case 'ব্যাখ্যা':
          current.explanation = val;
          break;
        case 'pos':
        case 'position':
          current.position = parseInt(val) || 0;
          break;
      }
    }
  }
  
  // Push last item
  pushCurrent();

  console.log(`  🔸 Total punctuation issues parsed: ${issues.length}`);
  
  return issues;
};

const parseEuphonyLines = (lines: string[]): UnifiedResponse['euphonyImprovements'] => {
  const results: UnifiedResponse['euphonyImprovements'] = [];

  console.log('  🔹 Parsing EUPHONY section:');
  console.log('  Lines to parse:', lines.length);
  
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    
    console.log(`    Line ${i}: "${t.substring(0, 50)}..."`);
    
    // Skip empty, comments, examples, format, instruction lines
    if (!t || t.startsWith('#') || t.startsWith('[') || 
        t.startsWith('ফরম্যাট') || t.startsWith('উদাহরণ') ||
        t.startsWith('খুঁজুন') || t.startsWith('১.') || 
        t.startsWith('২.') || t.startsWith('৩.') || 
        t.startsWith('৪.') || t.startsWith('⚠️')) {
      continue;
    }
    
    // Pipe format: শব্দ|বিকল্প|কারণ|pos
    if (t.includes('|')) {
      const parts = t.split('|').map(p => p.trim());
      if (parts.length >= 3 && parts[0] && parts[1]) {
        const current = parts[0];
        const suggestions = parts[1].split(',').map(s => s.trim()).filter(Boolean);
        const reason = parts[2] || 'উন্নত শব্দচয়ন';
        const position = parts[3] ? parseInt(parts[3]) || 0 : 0;

        if (current.length >= 2 && suggestions.length > 0) {
          results.push({ current, suggestions, reason, position });
          console.log(`      ✓ Added: "${current}" → ${suggestions.join(', ')}`);
        }
      }
    }
  }

  console.log(`  🔹 Total euphony improvements parsed: ${results.length}`);
  
  return results;
};

const parseStyleLines = (lines: string[]): UnifiedResponse['styleConversions'] => {
  const results: UnifiedResponse['styleConversions'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('[') || 
        t.startsWith('ফরম্যাট') || t.startsWith('উদাহরণ')) continue;
    if (!t.includes('|')) continue;
    
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

const parseToneLines = (lines: string[]): UnifiedResponse['toneConversions'] => {
  const results: UnifiedResponse['toneConversions'] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('[') || 
        t.startsWith('ফরম্যাট') || t.startsWith('উদাহরণ')) continue;
    if (!t.includes('|')) continue;
    
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

const parseContentLines = (lines: string[]): UnifiedResponse['contentAnalysis'] => {
  const result: NonNullable<UnifiedResponse['contentAnalysis']> = {
    contentType: '',
    description: '',
    missingElements: [],
    suggestions: []
  };

  console.log('  📋 Parsing CONTENT section:');
  console.log('  Lines to parse:', lines.length);

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    
    console.log(`    Line ${i}: "${t.substring(0, 50)}..."`);
    
    if (!t || t.startsWith('#') || t.startsWith('[') || 
        t.startsWith('ফরম্যাট') || t.startsWith('উদাহরণ') || 
        t.startsWith('@') || t.startsWith('⚠️')) {
      continue;
    }

    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.substring(0, idx).toLowerCase().trim();
      const val = t.substring(idx + 1).trim();

      console.log(`      Key: "${key}", Value: "${val.substring(0, 30)}..."`);

      switch (key) {
        case 'type':
        case 'contenttype':
        case 'ধরন':
          result.contentType = val;
          console.log(`      ✓ Type set: ${val}`);
          break;
        case 'desc':
        case 'description':
        case 'বর্ণনা':
          result.description = val;
          console.log(`      ✓ Description set`);
          break;
        case 'missing':
        case 'missingelements':
        case 'অনুপস্থিত':
          result.missingElements = val.split(',').map(s => s.trim()).filter(Boolean);
          console.log(`      ✓ Missing elements: ${result.missingElements.length}`);
          break;
        case 'tips':
        case 'suggestions':
        case 'পরামর্শ':
          result.suggestions = val.split(',').map(s => s.trim()).filter(Boolean);
          console.log(`      ✓ Suggestions: ${result.suggestions.length}`);
          break;
      }
    }
  }

  console.log(`  📋 Content parsing result:`, {
    hasType: !!result.contentType,
    hasDesc: !!result.description,
    missingCount: result.missingElements?.length || 0,
    tipsCount: result.suggestions?.length || 0
  });

  if (result.contentType || result.description || 
      (result.missingElements && result.missingElements.length > 0) ||
      (result.suggestions && result.suggestions.length > 0)) {
    return result;
  }

  return null;
};

export const parseAIResponse = (raw: string, wordCount?: number): UnifiedResponse | null => {
  const trimmed = raw.trim();
  
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

  // JSON fallback
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

    const maxErrors = wordCount ? Math.min(50, Math.ceil(wordCount * 0.5)) : 50;
    result.spellingErrors = validateSpellingErrors(result.spellingErrors, maxErrors);
    
    return result;
  } catch {
    console.warn('❌ Parse failed');
    return null;
  }
};
