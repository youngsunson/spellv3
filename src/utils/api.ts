// src/utils/api.ts

import { parseAIResponse, extractTextFromGeminiResponse } from './toonParser';

interface CallGeminiOptions {
  temperature?: number;
}

/**
 * Call Gemini API with text response mode (for TOON format)
 * Includes error handling with user-friendly messages
 */
export const callGeminiJson = async (
  prompt: string,
  apiKey: string,
  selectedModel: string,
  options: CallGeminiOptions = {}
): Promise<any | null> => {
  const { temperature = 0.2 } = options;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          // TOON এর জন্য text/plain ব্যবহার করা হচ্ছে (JSON নয়)
          responseMimeType: 'text/plain',
          temperature
        }
      })
    });
  } catch (err: any) {
    console.error('Network error:', err);
    throw new Error('ইন্টারনেট সংযোগে সমস্যা হয়েছে। দয়া করে নেটওয়ার্ক চেক করে আবার চেষ্টা করুন।');
  }

  if (!response.ok) {
    const status = response.status;
    let userMessage = '';

    if (status === 401 || status === 403) {
      userMessage = 'API Key বা অনুমতি (permission) সংক্রান্ত সমস্যা হয়েছে। Key সঠিক কিনা এবং প্রয়োজনীয় access আছে কিনা চেক করুন।';
    } else if (status === 429) {
      userMessage = 'অনেক বেশি রিকুয়েস্ট পাঠানো হয়েছে। কিছুক্ষণ বিরতি নিয়ে আবার চেষ্টা করুন (rate limit)।';
    } else if (status === 404) {
      userMessage = `মডেল (${selectedModel}) খুঁজে পাওয়া যায়নি (404)। সেটিংস থেকে সঠিক মডেল (যেমন: gemini-2.5-flash) সিলেক্ট করুন।`;
    } else if (status >= 500) {
      userMessage = 'Gemini সার্ভারে সাময়িক সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
    } else if (status === 400) {
      userMessage = 'রিকুয়েস্ট ফরম্যাট সঠিক নয় বা টেক্সট অনেক বেশি বড়।';
    } else {
      userMessage = `Gemini সার্ভার থেকে ত্রুটি (স্ট্যাটাস: ${status})।`;
    }

    const bodyText = await response.text().catch(() => '');
    console.error('Gemini API error:', status, bodyText);
    throw new Error(userMessage);
  }

  const data = await response.json();
  const raw = extractTextFromGeminiResponse(data);

  if (!raw) return null;

  return parseAIResponse(raw);
};