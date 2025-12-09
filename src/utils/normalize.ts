/* -------------------------------------------------------------------------- */
/*                        TEXT NORMALIZATION                                  */
/* -------------------------------------------------------------------------- */

/**
 * Normalize text for comparison
 * - Trims whitespace
 * - Converts multiple spaces/newlines to single space
 * - Converts to lowercase
 */
export const normalize = (str: string): string => {
  if (!str) return '';
  return str
    .trim()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

/**
 * Clean text from Word document
 * - Normalizes line breaks
 */
export const cleanWordText = (text: string): string => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

/**
 * Helper for Rate Limiting (Delay)
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};