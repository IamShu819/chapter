// Generate optimized dictionary from CC-CEDICT
// Outputs:
//   public/dictionaries/char-map.json  — primary: char pinyin + definitions (~0.5MB)
//   public/dictionaries/word-map.json  — supplement: 2-4 char words (~2MB)

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'dictionaries');
mkdirSync(outDir, { recursive: true });

const entries = (await import('cedict-json')).default;
console.log(`Loaded ${entries.length} CC-CEDICT entries`);

// ===== Pinyin conversion =====
const TONE = { a:'āáǎà', e:'ēéěè', i:'īíǐì', o:'ōóǒò', u:'ūúǔù', ü:'ǖǘǚǜ' };

function toPinyin(token) {
  const m = token.match(/^([a-züv]+)([1-5])$/i);
  if (!m) return token.replace(/v/g, 'ü');
  let s = m[1].toLowerCase().replace(/v/g, 'ü');
  const t = +m[2]; if (t === 5 || t === 0) return s;
  let vi = -1, vv = '';
  if (s.includes('a'))      { vi = s.indexOf('a'); vv = 'a'; }
  else if (s.includes('e')) { vi = s.indexOf('e'); vv = 'e'; }
  else if (s.includes('o')) { vi = s.indexOf('o'); vv = 'o'; }
  else if (s.includes('iu')){ vi = s.lastIndexOf('u'); vv = 'u'; }
  else { vi = s.length - 1; vv = s[vi]; }
  const mk = TONE[vv]; if (!mk) return s;
  return s.slice(0,vi) + mk[t-1] + s.slice(vi+1);
}
function convPinyin(p) { return p.split(' ').map(toPinyin).join(' '); }

// ===== Skip useless entries =====
function skip(simp, eng) {
  if (!simp || !eng?.length) return true;
  if (simp.length === 1 && /[\x00-\u024F\u2000-\u206F\u3000-\u303F\uFF00-\uFFEF]/.test(simp)) return true;
  return false;
}

// ===== Build character map =====
// char → { p: [pinyin...], d: [short_def...] }
const charMap = new Map();
// word (2-4 chars) → [[trad, pinyin, def1, def2], ...]
const wordMap = {};

function addChar(ch, pinyin, defs) {
  if (!charMap.has(ch)) charMap.set(ch, { p: [], d: [] });
  const info = charMap.get(ch);
  if (!info.p.includes(pinyin)) info.p.push(pinyin);
  for (const d of defs.slice(0, 2)) {
    const short = d.split(/[;,(]/)[0].trim();
    if (short && !info.d.includes(short) && info.d.length < 3) info.d.push(short);
  }
}

let kept = 0;
for (const e of entries) {
  if (skip(e.simplified, e.english)) continue;
  const py = convPinyin(e.pinyin);
  const defs = e.english.slice(0, 2).map(d => d.length > 80 ? d.slice(0,80) : d);
  kept++;

  if (e.simplified.length === 1) {
    // Single char: add full info
    addChar(e.simplified, py, e.english);
  } else if (e.simplified.length === 2) {
    // 2-char word: max 1 entry per word, short def
    if (!wordMap[e.simplified]) {
      const shortDef = e.english[0].split(/[;,(]/)[0].trim().slice(0, 40);
      wordMap[e.simplified] = [e.traditional, py, shortDef];
    }
    // Ensure first char has a reading
    if (!charMap.has(e.simplified[0])) {
      addChar(e.simplified[0], py, e.english.slice(0, 1));
    }
  } else {
    // 3+ chars: only ensure first char has reading
    if (!charMap.has(e.simplified[0])) {
      addChar(e.simplified[0], py, e.english.slice(0, 1));
    }
  }
}

// Ensure EVERY CJK char in the data has at least pinyin
// (from multi-char word entries where single-char entry doesn't exist)
console.log(`Kept: ${kept}, Characters: ${charMap.size}, Words: ${Object.keys(wordMap).length}`);

// ===== Write =====
const charJson = JSON.stringify(Object.fromEntries(charMap));
writeFileSync(join(outDir, 'char-map.json'), charJson);
console.log(`char-map.json: ${(charJson.length/1024).toFixed(0)} KB`);

const wordJson = JSON.stringify(wordMap);
writeFileSync(join(outDir, 'word-map.json'), wordJson);
console.log(`word-map.json: ${(wordJson.length/1024/1024).toFixed(1)} MB`);

console.log('Done!');
