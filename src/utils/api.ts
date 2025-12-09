// src/utils/api.ts

import { parseAIResponse, extractTextFromGeminiResponse, UnifiedResponse } from './toonParser';
import { buildUnifiedPrompt, UnifiedPromptOptions } from '../prompts/unified';

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
      401: 'API Key ভুল বা মেয়াদ উত্তীর্ণ।',
      403: 'API অনুমতি নেই। Key চেক করুন।',
      404: `মডেল (${selectedModel}) পাওয়া যায়নি। সেটিংস চেক করুন।`,
      429: 'Rate limit! ১ মিনিট পর চেষ্টা করুন।',
      500: 'Gemini সার্ভারে সমস্যা। পরে চেষ্টা করুন।',
      503: 'Gemini সার্ভার ব্যস্ত। পরে চেষ্টা করুন।'
    };
    const bodyText = await response.text().catch(() => '');
    console.error('API Error:', status, bodyText);
    throw new Error(messages[status] || `API ত্রুটি: ${status}`);
  }

  const data = await response.json();
  const raw = extractTextFromGeminiResponse(data);
  
  if (!raw) {
    console.warn('Empty response from Gemini');
    return null;
  }
  
  return parseAIResponse(raw);
};
