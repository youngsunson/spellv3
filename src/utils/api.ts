// src/utils/api.ts

import { parseAIResponse, extractTextFromGeminiResponse, UnifiedResponse } from './toonParser';
import { buildUnifiedPrompt, UnifiedPromptOptions } from '../prompts/unified';

/**
 * একটি মাত্র API call - সব কিছু একসাথে
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
          temperature: 0.2
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
      401: 'API Key সমস্যা। Key চেক করুন।',
      403: 'API অনুমতি নেই।',
      404: `মডেল (${selectedModel}) পাওয়া যায়নি।`,
      429: 'Rate limit! কিছুক্ষণ পর চেষ্টা করুন।',
      500: 'Gemini সার্ভার সমস্যা।'
    };
    throw new Error(messages[status] || `ত্রুটি: ${status}`);
  }

  const data = await response.json();
  const raw = extractTextFromGeminiResponse(data);
  
  if (!raw) return null;
  
  return parseAIResponse(raw);
};
