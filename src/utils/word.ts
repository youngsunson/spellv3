// src/utils/word.ts

/**
 * Word ডকুমেন্ট থেকে টেক্সট পড়ার ফাংশন
 */
export const getTextFromWord = async (): Promise<string> => {
  try {
    return await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();

      if (selection.text && selection.text.trim().length > 0) {
        return selection.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      }

      const body = context.document.body;
      body.load('text');
      await context.sync();
      
      return body.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    });
  } catch (error) {
    console.error('Error reading Word:', error);
    return '';
  }
};

/**
 * একাধিক শব্দ একসাথে হাইলাইট করা (Batched)
 */
export const highlightMultipleInWord = async (
  items: Array<{ text: string; color: string; position?: number }>
): Promise<void> => {
  if (!items || items.length === 0) return;

  try {
    await Word.run(async (context) => {
      const body = context.document.body;

      for (const item of items) {
        const cleanText = item.text.trim();
        if (!cleanText) continue;

        const results = body.search(cleanText, {
          matchCase: false,
          matchWholeWord: !/\s/.test(cleanText)
        });
        results.load('items');
      }

      await context.sync();

      // এখন হাইলাইট করি
      for (const item of items) {
        const cleanText = item.text.trim();
        if (!cleanText) continue;

        const results = body.search(cleanText, {
          matchCase: false,
          matchWholeWord: !/\s/.test(cleanText)
        });

        for (let i = 0; i < results.items.length; i++) {
          results.items[i].font.highlightColor = item.color;
        }
      }

      await context.sync();
    });
  } catch (error) {
    console.error('Highlight error:', error);
  }
};

/**
 * একটি শব্দ হাইলাইট করা (Simple version)
 */
export const highlightInWord = async (
  text: string,
  color: string,
  _position?: number
): Promise<void> => {
  const cleanText = text.trim();
  if (!cleanText) return;

  try {
    await Word.run(async (context) => {
      const body = context.document.body;
      const results = body.search(cleanText, {
        matchCase: false,
        matchWholeWord: !/\s/.test(cleanText)
      });
      results.load('items');
      await context.sync();

      for (let i = 0; i < results.items.length; i++) {
        results.items[i].font.highlightColor = color;
      }
      await context.sync();
    });
  } catch (error) {
    console.error('Highlight error:', error);
  }
};

/**
 * Word ডকুমেন্টে টেক্সট প্রতিস্থাপন
 */
export const replaceInWord = async (
  oldText: string,
  newText: string,
  _position?: number
): Promise<boolean> => {
  const cleanOldText = oldText.trim();
  if (!cleanOldText) return false;

  try {
    return await Word.run(async (context) => {
      const body = context.document.body;
      const results = body.search(cleanOldText, {
        matchCase: false,
        matchWholeWord: !/\s/.test(cleanOldText)
      });
      results.load('items');
      await context.sync();

      if (results.items.length > 0) {
        // শুধু প্রথমটি replace করি
        results.items[0].insertText(newText, Word.InsertLocation.replace);
        results.items[0].font.highlightColor = 'None';
        await context.sync();
        return true;
      }
      return false;
    });
  } catch (error) {
    console.error('Replace error:', error);
    return false;
  }
};

/**
 * সব হাইলাইট মুছে ফেলা
 */
export const clearHighlights = async (): Promise<void> => {
  try {
    await Word.run(async (context) => {
      context.document.body.font.highlightColor = 'None';
      await context.sync();
    });
  } catch (error) {
    console.error('Clear highlights error:', error);
  }
};
