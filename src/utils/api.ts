// src/utils/api.ts

import { parseToonResponse } from './toon';

interface CallGeminiOptions {
  temperature?: number;
}

/**
 * Call Gemini API with TEXT response mode (TOON Format)
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
          // Changed from application/json to text/plain for TOON
          responseMimeType: 'text/plain', 
          temperature
        }
      })
    });
  } catch (err: any) {
    console.error('Network error:', err);
    throw new Error('ইন্টারনেট সংযোগে সমস্যা হয়েছে।');
  }

  if (!response.ok) {
    const status = response.status;
    let userMessage = `Gemini সার্ভার থেকে ত্রুটি (স্ট্যাটাস: ${status})।`;
    if (status === 401) userMessage = 'API Key ভুল বা মেয়াদোত্তীর্ণ।';
    else if (status === 429) userMessage = 'অতিরিক্ত রিকুয়েস্ট। কিছুক্ষণ অপেক্ষা করুন।';
    else if (status === 503) userMessage = 'সার্ভার ব্যস্ত। আবার চেষ্টা করুন।';

    throw new Error(userMessage);
  }

  const data = await response.json();
  
  // Extract raw text
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) return null;

  console.log("Raw AI Response:", rawText); // Debugging

  // Parse TOON format
  return parseToonResponse(rawText);
};