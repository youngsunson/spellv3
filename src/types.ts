// src/types.ts

export type DocType = 'generic' | 'academic' | 'official' | 'marketing' | 'social';

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

export interface DocTypeConfig {
  label: string;
  description: string;
  defaultTone: string;
  mainHint: string;
  contentHint: string;
}

// Result Object Structure from ParseToon
export interface AnalysisResult {
  spellingErrors: Correction[];
  languageStyleMixing: StyleMixing;
  punctuationIssues: PunctuationIssue[];
  euphonyImprovements: EuphonyImprovement[];
  toneConversions: ToneSuggestion[];
  styleConversions: StyleSuggestion[];
}