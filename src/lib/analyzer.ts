// Server-side morphological analysis for kanji -> reading conversion
// This runs in the wrangler dev local environment (Node.js compatible)

import kuromoji from 'kuromoji';
import path from 'path';
import { fileURLToPath } from 'url';

let tokenizer: any = null;
let tokenizerPromise: Promise<any> | null = null;

function getTokenizer(): Promise<any> {
  if (tokenizer) return Promise.resolve(tokenizer);
  if (tokenizerPromise) return tokenizerPromise;

  tokenizerPromise = new Promise((resolve, reject) => {
    // Resolve dict path relative to node_modules
    const dicPath = path.resolve('node_modules/kuromoji/dict/');
    kuromoji.builder({ dicPath }).build((err: any, t: any) => {
      if (err) { reject(err); return; }
      tokenizer = t;
      resolve(t);
    });
  });

  return tokenizerPromise;
}

// Romaji mapping (same as frontend but used server-side for pre-processing)
const ROMAJI_MAP: Record<string, string> = {
  'あ':'a','い':'i','う':'u','え':'e','お':'o',
  'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
  'さ':'sa','し':'si','す':'su','せ':'se','そ':'so',
  'た':'ta','ち':'ti','つ':'tu','て':'te','と':'to',
  'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
  'は':'ha','ひ':'hi','ふ':'hu','へ':'he','ほ':'ho',
  'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
  'や':'ya','ゆ':'yu','よ':'yo',
  'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
  'わ':'wa','ゐ':'wi','ゑ':'we','を':'wo','ん':'nn',
  'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
  'ざ':'za','じ':'zi','ず':'zu','ぜ':'ze','ぞ':'zo',
  'だ':'da','ぢ':'di','づ':'du','で':'de','ど':'do',
  'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
  'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
  'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
  'しゃ':'sya','しゅ':'syu','しょ':'syo',
  'ちゃ':'tya','ちゅ':'tyu','ちょ':'tyo',
  'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
  'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
  'みゃ':'mya','みゅ':'myu','みょ':'myo',
  'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
  'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
  'じゃ':'zya','じゅ':'zyu','じょ':'zyo',
  'びゃ':'bya','びゅ':'byu','びょ':'byo',
  'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
  'ふぁ':'fa','ふぃ':'fi','ふぇ':'fe','ふぉ':'fo',
  'てぃ':'thi','でぃ':'dhi',
  'ー':'-','。':'.','、':',','！':'!','？':'?',
  '「':'[','」':']','（':'(','）':')','・':'/',
  '\u3000':' ',
};

const ROMAJI_ALTS: Record<string, string[]> = {
  'し': ['shi','ci'],
  'ち': ['chi'],
  'つ': ['tsu'],
  'ふ': ['fu'],
  'じ': ['ji'],
  'しゃ': ['sha'], 'しゅ': ['shu'], 'しょ': ['sho'],
  'ちゃ': ['cha'], 'ちゅ': ['chu'], 'ちょ': ['cho'],
  'じゃ': ['ja','jya'], 'じゅ': ['ju','jyu'], 'じょ': ['jo','jyo'],
};

function kataToHira(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
}

// Convert hiragana to sub-romaji segments
function hiraToRomajiParts(hira: string): { readings: string[] }[] {
  const parts: { readings: string[] }[] = [];
  let i = 0;
  while (i < hira.length) {
    const ch = hira[i];

    // っ
    if (ch === '\u3063' && i + 1 < hira.length) {
      let found = false;
      if (i + 2 < hira.length) {
        const two = hira.substring(i + 1, i + 3);
        if (ROMAJI_MAP[two]) {
          const base = ROMAJI_MAP[two];
          const r = [base[0] + base];
          if (ROMAJI_ALTS[two]) for (const a of ROMAJI_ALTS[two]) r.push(a[0] + a);
          parts.push({ readings: r }); i += 3; found = true;
        }
      }
      if (!found) {
        const next = hira[i + 1];
        const m = ROMAJI_MAP[next];
        if (m) {
          const r = [m[0] + m];
          if (ROMAJI_ALTS[next]) for (const a of ROMAJI_ALTS[next]) r.push(a[0] + a);
          parts.push({ readings: r }); i += 2;
        } else {
          parts.push({ readings: ['xtu', 'xtsu', 'ltu', 'ltsu'] }); i++;
        }
      }
      continue;
    }

    // Two-char combo
    if (i + 1 < hira.length) {
      const two = hira.substring(i, i + 2);
      if (ROMAJI_MAP[two]) {
        const r = [ROMAJI_MAP[two]];
        if (ROMAJI_ALTS[two]) r.push(...ROMAJI_ALTS[two]);
        parts.push({ readings: r }); i += 2; continue;
      }
    }

    // Single kana
    if (ROMAJI_MAP[ch]) {
      const r = [ROMAJI_MAP[ch]];
      if (ROMAJI_ALTS[ch]) r.push(...ROMAJI_ALTS[ch]);
      if (ch === '\u3093' && i + 1 < hira.length) {
        const next = hira[i + 1];
        const nextR = ROMAJI_MAP[next] || '';
        if (!/[\u3042\u3044\u3046\u3048\u304A\u3084\u3086\u3088\u306A\u306B\u306C\u306D\u306E]/.test(next) && !/^[aiueoy]/.test(nextR)) {
          r.unshift('n');
        }
      }
      parts.push({ readings: r }); i++; continue;
    }

    parts.push({ readings: [ch] }); i++;
  }
  return parts;
}

function mergeReadings(parts: { readings: string[] }[]): string[] {
  if (parts.length === 0) return [''];
  if (parts.length === 1) return parts[0].readings;
  let combos = parts[0].readings.map(r => [r]);
  for (let i = 1; i < parts.length; i++) {
    const nc: string[][] = [];
    for (const c of combos) {
      for (const r of parts[i].readings) {
        nc.push([...c, r]);
        if (nc.length > 20) break;
      }
      if (nc.length > 20) break;
    }
    combos = nc;
  }
  return combos.map(c => c.join(''));
}

export type Segment = { display: string; readings: string[] };

export async function analyzeText(text: string): Promise<Segment[]> {
  const tk = await getTokenizer();
  const tokens = tk.tokenize(text);
  const segments: Segment[] = [];

  for (const token of tokens) {
    const surface: string = token.surface_form;

    if (surface === '\n' || surface === '\r\n') {
      segments.push({ display: '\u21B5', readings: ['\n'] });
      continue;
    }
    if (/^\s+$/.test(surface)) {
      for (const ch of surface) {
        if (ch === '\n') segments.push({ display: '\u21B5', readings: ['\n'] });
        else segments.push({ display: ' ', readings: [' '] });
      }
      continue;
    }
    if (/^[a-zA-Z0-9 !?.,;:'"`~@#$%^&*()\[\]{}<>\/|+=_\-]+$/.test(surface)) {
      for (const ch of surface) segments.push({ display: ch, readings: [ch.toLowerCase()] });
      continue;
    }
    if (/^[\u3000-\u3004\u3006-\u303F\uFF01-\uFF60]+$/.test(surface)) {
      for (const ch of surface) {
        const h = kataToHira(ch);
        if (ROMAJI_MAP[ch]) segments.push({ display: ch, readings: [ROMAJI_MAP[ch]] });
        else if (ROMAJI_MAP[h]) segments.push({ display: ch, readings: [ROMAJI_MAP[h]] });
        else segments.push({ display: ch, readings: [ch] });
      }
      continue;
    }

    const reading: string = token.reading || token.pronunciation || '';
    const hira = kataToHira(reading);

    if (hira && /^[\u3040-\u309F\u30A0-\u30FF]+$/.test(reading)) {
      const parts = hiraToRomajiParts(hira);
      segments.push({ display: surface, readings: mergeReadings(parts) });
      continue;
    }

    const surfaceHira = kataToHira(surface);
    if (/^[\u3040-\u309F]+$/.test(surfaceHira)) {
      const parts = hiraToRomajiParts(surfaceHira);
      segments.push({ display: surface, readings: mergeReadings(parts) });
      continue;
    }

    for (const ch of surface) {
      const chH = kataToHira(ch);
      if (ROMAJI_MAP[chH]) segments.push({ display: ch, readings: [ROMAJI_MAP[chH]] });
    }
  }

  return segments.filter(s => s.readings.length > 0 && s.readings[0] !== '');
}
