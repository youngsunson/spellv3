// src/prompts/tone.ts

const toneInstructions: Record<string, string> = {
  'formal': `Convert to Formal (আনুষ্ঠানিক). Use আপনি/আপনার, করুন/বলুন.`,
  'informal': `Convert to Informal (অনানুষ্ঠানিক). Use তুমি/তুই, simple words.`,
  'professional': `Convert to Professional (পেশাদার). Confident, clear language.`,
  'friendly': `Convert to Friendly (বন্ধুত্বপূর্ণ). Warm, emotional.`,
  'respectful': `Convert to Respectful (সম্মানজনক). Honorable address.`,
  'persuasive': `Convert to Persuasive (প্রভাবশালী). Strong verbs, CTA.`,
  'neutral': `Convert to Neutral (নিরপেক্ষ). Objective tone.`,
  'academic': `Convert to Academic (শিক্ষামূলক). Complex sentence, terminology.`
};

export const buildTonePrompt = (text: string, tone: string): string => {
  return `${toneInstructions[tone]}

Text: """${text}"""

⚠️ **OUTPUT FORMAT (TOON):**
Do NOT use JSON. Use the Section Header "[[TONE]]".
Separate items with "---".

Structure per item:
@current: [Original word/phrase]
@suggestion: [Better version]
@reason: [Why change is needed]
@position: [0-based word index]

Example:
[[TONE]]
@current: কাজটা কর
@suggestion: কাজটি সম্পন্ন করুন
@reason: More formal imperative
@position: 2
---
@current: হে
@suggestion: জনাব
@reason: Respectful address
@position: 0
`;
};

export const getToneName = (tone: string): string => {
  const map: Record<string, string> = {
    'formal': '📋 আনুষ্ঠানিক',
    'informal': '💬 অনানুষ্ঠানিক',
    'professional': '💼 পেশাদার',
    'friendly': '😊 বন্ধুত্বপূর্ণ',
    'respectful': '🙏 সম্মানজনক',
    'persuasive': '💪 প্রভাবশালী',
    'neutral': '⚖️ নিরপেক্ষ',
    'academic': '📚 শিক্ষামূলক'
  };
  return map[tone] || tone;
};

export const TONE_OPTIONS = [
  { id: '', icon: '❌', title: 'কোনটি নয়', desc: 'শুধু বানান পরীক্ষা' },
  { id: 'formal', icon: '📋', title: 'আনুষ্ঠানিক (Formal)', desc: 'দাপ্তরিক চিঠি' },
  { id: 'informal', icon: '💬', title: 'অনানুষ্ঠানিক (Informal)', desc: 'সোশ্যাল মিডিয়া' },
  { id: 'professional', icon: '💼', title: 'পেশাদার (Professional)', desc: 'ব্যবসায়িক' },
  { id: 'friendly', icon: '😊', title: 'বন্ধুত্বপূর্ণ (Friendly)', desc: 'আন্তরিক' },
  { id: 'respectful', icon: '🙏', title: 'সম্মানজনক (Respectful)', desc: 'শ্রদ্ধেয়' },
  { id: 'persuasive', icon: '💪', title: 'প্রভাবশালী (Persuasive)', desc: 'মার্কেটিং' },
  { id: 'neutral', icon: '⚖️', title: 'নিরপেক্ষ (Neutral)', desc: 'সংবাদ' },
  { id: 'academic', icon: '📚', title: 'শিক্ষামূলক (Academic)', desc: 'গবেষণা' }
];