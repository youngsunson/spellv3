// src/utils/api.ts

import { parseAIResponse, extractTextFromGeminiResponse, UnifiedResponse } from './toonParser';
import { buildUnifiedPrompt, UnifiedPromptOptions } from '../prompts/unified';

/**
 * মডেল অনুযায়ী Rate Limits (Free Tier)
 */
export const MODEL_LIMITS: Record<string, { rpm: number; rpd: number; tpm: number }> = {
  'gemini-2.5-flash': { rpm: 5, rpd: 20, tpm: 250000 },
  'gemini-2.5-flash-lite': { rpm: 10, rpd: 20, tpm: 250000 },
  'gemini-2.0-flash': { rpm: 15, rpd: 1500, tpm: 1000000 },
  'default': { rpm: 5, rpd: 20, tpm: 250000 }
};

/**
 * Safe limit (90% of actual to avoid hitting exact limit)
 */
export const getSafeLimit = (model: string): number => {
  const limits = MODEL_LIMITS[model] || MODEL_LIMITS['default'];
  return Math.floor(limits.rpd * 0.9);
};

/**
 * Rate limit info interface
 */
export interface RateLimitInfo {
  model: string;
  count: number;
  date: string;
  limit: number;
  remaining: number;
  isLimited: boolean;
}

/**
 * Get rate limit info for a specific model
 */
export const getRateLimitInfo = (model: string): RateLimitInfo => {
  const today = new Date().toDateString();
  const storageKey = `bhasha_mitra_requests_${model}`;
  const limit = getSafeLimit(model);
  
  let count = 0;
  const saved = localStorage.getItem(storageKey);
  
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.date === today) {
        count = data.count;
      }
    } catch {
      // Invalid data, reset
    }
  }
  
  return {
    model,
    count,
    date: today,
    limit,
    remaining: Math.max(0, limit - count),
    isLimited: count >= limit
  };
};

/**
 * Increment request count for a model
 */
export const incrementRequestCount = (model: string): RateLimitInfo => {
  const today = new Date().toDateString();
  const storageKey = `bhasha_mitra_requests_${model}`;
  const current = getRateLimitInfo(model);
  
  const newCount = current.date === today ? current.count + 1 : 1;
  
  localStorage.setItem(storageKey, JSON.stringify({
    date: today,
    count: newCount
  }));
  
  const limit = getSafeLimit(model);
  
  return {
    model,
    count: newCount,
    date: today,
    limit,
    remaining: Math.max(0, limit - newCount),
    isLimited: newCount >= limit
  };
};

/**
 * একটি মাত্র API call - সব বিশ্লেষণ একসাথে
 */
export const analyzeText = async (
  options: UnifiedPromptOptions,
  apiKey: string,
  selectedModel: string
): Promise<UnifiedResponse | null> => {
  // Pre-check rate limit
  const rateLimitInfo = getRateLimitInfo(selectedModel);
  if (rateLimitInfo.isLimited) {
    throw new Error(`দৈনিক সীমা (${rateLimitInfo.limit}টি) শেষ। কাল আবার চেষ্টা করুন বা অন্য মডেল ব্যবহার করুন।`);
  }

  // Count words for validation
  const wordCount = options.text.trim().split(/\s+/).filter(Boolean).length;

  const prompt = buildUnifiedPrompt(options);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  let response: Response;

  // Timeout for request (60 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'text/plain',
          temperature: 0.1, // Lower temperature for more consistent output
          maxOutputTokens: 4096
        }
      }),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    
    if (err.name === 'AbortError') {
      throw new Error('অনুরোধ সময়সীমা অতিক্রম করেছে। আবার চেষ্টা করুন বা ছোট টেক্সট ব্যবহার করুন।');
    }
    
    console.error('Network error:', err);
    throw new Error('ইন্টারনেট সংযোগে সমস্যা। নেটওয়ার্ক চেক করুন।');
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    const status = response.status;
    
    // 429 = Rate limited by API
    if (status === 429) {
      const storageKey = `bhasha_mitra_requests_${selectedModel}`;
      const limit = getSafeLimit(selectedModel);
      localStorage.setItem(storageKey, JSON.stringify({
        date: new Date().toDateString(),
        count: limit
      }));
      
      throw new Error('Rate limit! Google এর দৈনিক সীমা শেষ। কাল আবার চেষ্টা করুন বা অন্য মডেল ব্যবহার করুন।');
    }
    
    const messages: Record<number, string> = {
      400: 'রিকুয়েস্ট ফরম্যাট সঠিক নয় বা টেক্সট অনেক বেশি বড়।',
      401: 'API Key ভুল বা মেয়াদ উত্তীর্ণ। সেটিংস চেক করুন।',
      403: 'API অনুমতি নেই। API Key চেক করুন।',
      404: `মডেল "${selectedModel}" পাওয়া যায়নি। সেটিংস থেকে সঠিক মডেল বেছে নিন।`,
      500: 'Gemini সার্ভারে সমস্যা। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      503: 'Gemini সার্ভার ব্যস্ত। কিছুক্ষণ পর চেষ্টা করুন।'
    };
    
    const bodyText = await response.text().catch(() => '');
    console.error('API Error:', status, bodyText);
    
    throw new Error(messages[status] || `API ত্রুটি (স্ট্যাটাস: ${status})`);
  }

  const data = await response.json();
  const raw = extractTextFromGeminiResponse(data);
  
  if (!raw) {
    console.warn('Empty response from Gemini');
    return null;
  }
  
  // Pass wordCount for validation
  const result = parseAIResponse(raw, wordCount);
  
  // Final validation: if spelling errors exceed word count, something is wrong
  if (result && result.spellingErrors.length > wordCount) {
    console.warn(`Invalid result: ${result.spellingErrors.length} errors for ${wordCount} words`);
    result.spellingErrors = result.spellingErrors.slice(0, Math.ceil(wordCount * 0.3));
  }
  
  return result;
};
