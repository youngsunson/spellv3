// src/prompts/core.ts

export type DocType = 'generic' | 'academic' | 'official' | 'marketing' | 'social';

export interface DocTypeConfig {
  label: string;
  description: string;
  defaultTone: string;
  mainHint: string;
  contentHint: string;
}

export const DOC_TYPE_CONFIG: { [key in DocType]: DocTypeConfig } = {
  generic: {
    label: 'সাধারণ লেখা',
    description: 'যেকোনো সাধারণ লেখা',
    defaultTone: '',
    mainHint: 'এটি একটি সাধারণ বাংলা লেখা হিসেবে বিবেচনা করুন।',
    contentHint: 'সাধারণ লেখার ক্ষেত্রে মূল বক্তব্য পরিষ্কার আছে কি না দেখুন।'
  },
  academic: {
    label: 'একাডেমিক লেখা',
    description: 'গবেষণা পত্র, প্রবন্ধ',
    defaultTone: 'academic',
    mainHint: 'এটি একাডেমিক লেখা। ভাষার শুদ্ধতা ও পরিভাষার গুরুত্ব দিন।',
    contentHint: 'ভূমিকা, যুক্তি ও উপসংহার আছে কি না লক্ষ্য করুন।'
  },
  official: {
    label: 'অফিশিয়াল চিঠি',
    description: 'দাপ্তরিক আবেদন, নোটিশ',
    defaultTone: 'formal',
    mainHint: 'এটি অফিসিয়াল লেখা। ভদ্রতা ও স্পষ্টতা গুরুত্ব দিন।',
    contentHint: 'প্রাপক, বিষয় ও বিনীত উপসংহার আছে কি না দেখুন।'
  },
  marketing: {
    label: 'মার্কেটিং কপি',
    description: 'বিজ্ঞাপন, সেলস পেজ',
    defaultTone: 'persuasive',
    mainHint: 'এটি মার্কেটিং লেখা। আকর্ষণীয় ও স্পষ্ট বার্তা দিন।',
    contentHint: 'পণ্য/সেবা, উপকারিতা ও কল-টু-অ্যাকশন (CTA) আছে কি না দেখুন।'
  },
  social: {
    label: 'সোশ্যাল মিডিয়া',
    description: 'ফেসবুক/ইনস্টাগ্রাম পোস্ট',
    defaultTone: 'informal',
    mainHint: 'এটি সোশ্যাল মিডিয়া পোস্ট। বন্ধুত্বপূর্ণ ভাষা গুরুত্ব দিন।',
    contentHint: 'পরিষ্কার বার্তা ও ইঙ্গেজমেন্ট উপাদান আছে কি না দেখুন।'
  }
};

export const getDocTypeLabel = (t: DocType): string => DOC_TYPE_CONFIG[t].label;

export const buildMainPrompt = (text: string, docType: DocType): string => {
  const docCfg = DOC_TYPE_CONFIG[docType];
  
  return `
আপনি একজন দক্ষ বাংলা প্রুফরিডার।
${docCfg.mainHint}

নিচের টেক্সটটি বিশ্লেষণ করুন:
"""${text}"""

⚠️ **OUTPUT FORMAT INSTRUCTIONS (TOON):**
Do NOT use JSON. Use the format below. 
Separate items with "---".
Use the headers exactly as shown (e.g., [[SPELLING]]).

1. **[[SPELLING]]**
   - কেবল নিশ্চিত ভুল বানান ধরুন।
   Structure:
   @wrong: [ভুল শব্দটি]
   @suggestions: [সঠিক১, সঠিক২]
   @position: [শব্দের 0-based index]
   ---

2. **[[PUNCTUATION]]**
   - বাক্যের শেষে দাঁড়ি না থাকলে বা ভুল যতিচিহ্ন থাকলে।
   Structure:
   @issue: [সমস্যার নাম]
   @currentSentence: [পুরো বাক্য]
   @correctedSentence: [সংশোধিত বাক্য]
   @explanation: [ব্যাখ্যা]
   @position: [বাক্যের প্রথম শব্দের index]
   ---

3. **[[MIXING_META]]** (সাধু/চলিত মিশ্রণ থাকলে)
   @detected: true/false
   @recommendedStyle: সাধু/চলিত
   @reason: কেন
   ---

4. **[[MIXING_ITEMS]]** (মিশ্রণ সংশোধনের তালিকা)
   Structure:
   @current: [শব্দ]
   @suggestion: [সংশোধন]
   @type: সাধু→চলিত
   @position: [index]
   ---

5. **[[EUPHONY]]** (শ্রুতিমধুরতা)
   Structure:
   @current: [শব্দ]
   @suggestions: [বিকল্প]
   @reason: কেন
   @position: [index]
   ---

Example Output:
[[SPELLING]]
@wrong: ভুল
@suggestions: সঠিক
@position: 5
---
@wrong: করচো
@suggestions: করছ
@position: 12

[[PUNCTUATION]]
@issue: Missing Period
@currentSentence: আমি বাড়ি যাই
@correctedSentence: আমি বাড়ি যাই।
@explanation: বাক্যের শেষে দাঁড়ি নেই।
@position: 0

[[MIXING_META]]
@detected: false
`;
};