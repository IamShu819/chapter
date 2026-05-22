import type { DictEntry, LookupResult } from '../types/dictionary';

// ===== Data =====
// Chinese definitions (文言文) — primary source
let classicalMap: Record<string, Record<string, string[]>> | null = null;
// English definitions (CC-CEDICT) — fallback
let charMap: Record<string, { p: string[]; d: string[] }> | null = null;
// 2-char word definitions — supplementary
let wordMap: Record<string, [string, string, string]> | null = null;
let wordMapLoading = false;
let dictLoaded = false;

// ===== Load =====
export async function loadDictionary(): Promise<void> {
  if (dictLoaded) return;

  let anyLoaded = false;

  // Load classical Chinese definitions (3727 chars, Chinese definitions with examples)
  try {
    const resp = await fetch('/dictionaries/classical-chinese.json');
    if (resp.ok) { classicalMap = await resp.json(); anyLoaded = true; }
  } catch {}

  // Load char-map (44K+ chars, pinyin + English definitions as fallback)
  try {
    const resp = await fetch('/dictionaries/char-map.json');
    if (resp.ok) { charMap = await resp.json(); anyLoaded = true; }
  } catch {}

  // Only mark as loaded if at least one dictionary succeeded
  if (anyLoaded) dictLoaded = true;
}

async function ensureWordMap(): Promise<void> {
  if (wordMap || wordMapLoading) return;
  wordMapLoading = true;
  try {
    const resp = await fetch('/dictionaries/word-map.json');
    if (resp.ok) wordMap = await resp.json();
  } catch {}
}

// ===== Lookup =====
export function lookup(text: string, charOffset: number): LookupResult {
  const char = text[charOffset] || '';
  const entries: DictEntry[] = [];

  // 1. Classical Chinese definitions (优先)
  if (classicalMap && classicalMap[char]) {
    const charData = classicalMap[char];
    for (const [pinyin, defs] of Object.entries(charData)) {
      entries.push({
        traditional: char,
        simplified: char,
        pinyin,
        definitions: defs,
        isClassical: true,
      });
    }
  }

  // 2. Word-map for 2-char word at tap position
  const word2 = text.slice(charOffset, charOffset + 2);
  if (wordMap && wordMap[word2]) {
    const w = wordMap[word2];
    entries.push({
      traditional: w[0],
      simplified: word2,
      pinyin: w[1],
      definitions: [w[2]],
    });
  } else if (!wordMap && !wordMapLoading) {
    void ensureWordMap();
  }

  // 3. Char-map fallback (English definitions + pinyin from Unihan)
  if (charMap && charMap[char]) {
    const info = charMap[char];
    // Only add if we don't already have pinyin from classical
    const hasClassicalPinyin = entries.some(e => e.isClassical);
    if (!hasClassicalPinyin && info.p.length > 0) {
      entries.push({
        traditional: char,
        simplified: char,
        pinyin: info.p.join(' / '),
        definitions: info.d.length > 0 ? info.d : [],
      });
    } else if (hasClassicalPinyin && info.d.length > 0) {
      // Add English definitions as supplement
      entries.push({
        traditional: char,
        simplified: char,
        pinyin: info.p.join(' / '),
        definitions: info.d,
      });
    }
  }

  // 4. Ultimate fallback
  if (entries.length === 0) {
    entries.push({
      traditional: char,
      simplified: char,
      pinyin: '',
      definitions: ['未收录此字'],
    });
  }

  const source: LookupResult['source'] =
    entries.some(e => e.isClassical) ? 'classical' :
    entries.some(e => e.definitions.length > 0) ? 'cedict' : 'unknown';

  return { query: char, entries, source, segmentationContext: [char], segmentIndex: 0 };
}
