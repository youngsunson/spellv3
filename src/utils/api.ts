// src/utils/api.ts

import { parseAIResponse, extractTextFromGeminiResponse, UnifiedResponse } from './toonParser';
import { buildUnifiedPrompt, UnifiedPromptOptions } from '../prompts/unified';

/**
 * Rate limit tracking
 */
export const getRateLimitInfo = (): { count: number; date: string } => {
  const today = new Date().toDateString();
  const saved = localStorage.getItem('bhasha_mitra_requests');
  
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.date === today) {
        return { count: data.count, date: today };
      }
    } catch {
      // Invalid data, reset
    }
  }
  
  return { count: 0, date: today };
};

export const incrementRequestCount = (): number => {
  const today = new Date().toDateString();
  const current = getRateLimitInfo();
  
  const newCount = current.date === today ? current.count + 1 : 1;
  
  localStorage.setItem('bhasha_mitra_requests', JSON.stringify({
    date: today,
    count: newCount
  }));
  
  return newCount;
};

export const MAX_DAILY_REQUESTS = 18; // Safe limit (out of 20)

/**
 * একটি মাত্র API call - সব বিশ্লেষণ একসাথে
 */
export const analyzeText = async (
  options: UnifiedPromptOptions,
  apiKey: string,
  selectedModel: string
): Promise<UnifiedResponse | null> => {
  const prompt = buildUnifiedPrompt(options);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'text/plain',
          temperature: 0.15
        }
      })
    });
  } catch (err) {
    console.error('Network error:', err);
    throw new Error('ইন্টারনেট সংযোগে সমস্যা। নেটওয়ার্ক চেক করুন।');
  }

  if (!response.ok) {
    const status = response.status;
    const messages: Record<number, string> = {
      400: 'রিকুয়েস্ট ফরম্যাট সঠিক নয় বা টেক্সট অনেক বেশি বড়।',
      401: 'API Key ভুল বা মেয়াদ উত্তীর্ণ। সেটিংস চেক করুন।',
      403: 'API অনুমতি নেই। API Key চেক করুন।',
      404: `মডেল "${selectedModel}" পাওয়া যায়নি। সেটিংস থেকে সঠিক মডেল বেছে নিন।`,
      429: 'Rate limit! দৈনিক সীমা শেষ। কাল আবার চেষ্টা করুন অথবা কিছুক্ষণ পর।',
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
  
  return parseAIResponse(raw);
};
