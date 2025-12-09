// src/prompts/style.ts

export type StyleType = 'none' | 'sadhu' | 'cholito';

const styleInstructions: Record<string, string> = {
  'sadhu': `নিচের টেক্সটকে **সাধু রীতি**তে রূপান্তরের জন্য বিশ্লেষণ করুন। (ছি->তেছি, ল->ইল, তার->তাহার)।`,
  'cholito': `নিচের টেক্সটকে **চলিত রীতি**তে রূপান্তরের জন্য বিশ্লেষণ করুন। (তেছি->ছি, ইল->ল, তাহার->তার)।`
};

export const buildStylePrompt = (text: string, style: string): string => {
  return `${styleInstructions[style]}

Text: """${text}"""

⚠️ **OUTPUT FORMAT (TOON):**
Do NOT use JSON. Use the Section Header "[[STYLE_CONVERSION]]".
Separate items with "---".

Structure per item:
@current: [Original word exactly from text]
@suggestion: [Converted word]
@type: [Type of change e.g. Verb/Pronoun]
@position: [0-based word index]

Example:
[[STYLE_CONVERSION]]
@current: করছি
@suggestion: করিতেছি
@type: Verb
@position: 5
---
@current: তার
@suggestion: তাহার
@type: Pronoun
@position: 10
`;
};

export const STYLE_OPTIONS = [
  { id: 'none' as StyleType, icon: '❌', title: 'কোনটি নয়', desc: 'স্বয়ংক্রিয় মিশ্রণ সনাক্তকরণ' },
  { id: 'sadhu' as StyleType, icon: '📜', title: 'সাধু রীতি', desc: 'করিতেছি, করিয়াছি' },
  { id: 'cholito' as StyleType, icon: '💬', title: 'চলিত রীতি', desc: 'করছি, করেছি' }
];