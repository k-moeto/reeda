// ============================================================
// Morphological Analysis Micro-server (Node.js)
// Runs on port 3001, called by the Hono API to analyze Japanese text
// Uses kuromoji.js with native Node.js file system access for dictionary loading
// ============================================================

import http from 'http';
import kuromoji from 'kuromoji';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 3001;

// --- Tokenizer singleton ---
let tokenizer = null;
let tokenizerPromise = null;

function getTokenizer() {
  if (tokenizer) return Promise.resolve(tokenizer);
  if (tokenizerPromise) return tokenizerPromise;
  
  const dicPath = path.resolve('node_modules/kuromoji/dict/');
  console.log('[analyzer] Loading kuromoji dictionary from:', dicPath);
  
  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, t) => {
      if (err) {
        console.error('[analyzer] Dictionary load failed:', err);
        tokenizerPromise = null;
        reject(err);
        return;
      }
      console.log('[analyzer] Dictionary loaded successfully');
      tokenizer = t;
      resolve(t);
    });
  });
  
  return tokenizerPromise;
}

// --- Romaji Mapping ---
const ROMAJI_MAP = {
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
  // Additional brackets & quotes
  '【':'[','】':']','『':'[','』':']',
  '〈':'<','〉':'>','《':'<','》':'>',
  '〔':'(','〕':')',
  '\u201C':'"','\u201D':'"','\u2018':"'",'\u2019':"'",  // curly quotes
  '\uFF08':'(','\uFF09':')',  // fullwidth parens
  '\uFF3B':'[','\uFF3D':']',  // fullwidth brackets
  '\uFF5B':'{','\uFF5D':'}',  // fullwidth braces
  // Fullwidth alphanumeric & symbols
  '\uFF01':'!','\uFF02':'"','\uFF03':'#','\uFF04':'$','\uFF05':'%',
  '\uFF06':'&','\uFF07':"'",'\uFF0A':'*','\uFF0B':'+','\uFF0C':',',
  '\uFF0D':'-','\uFF0E':'.','\uFF0F':'/',
  '\uFF10':'0','\uFF11':'1','\uFF12':'2','\uFF13':'3','\uFF14':'4',
  '\uFF15':'5','\uFF16':'6','\uFF17':'7','\uFF18':'8','\uFF19':'9',
  '\uFF1A':':','\uFF1B':';','\uFF1C':'<','\uFF1D':'=','\uFF1E':'>','\uFF1F':'?','\uFF20':'@',
  '\uFF21':'a','\uFF22':'b','\uFF23':'c','\uFF24':'d','\uFF25':'e','\uFF26':'f','\uFF27':'g',
  '\uFF28':'h','\uFF29':'i','\uFF2A':'j','\uFF2B':'k','\uFF2C':'l','\uFF2D':'m','\uFF2E':'n',
  '\uFF2F':'o','\uFF30':'p','\uFF31':'q','\uFF32':'r','\uFF33':'s','\uFF34':'t','\uFF35':'u',
  '\uFF36':'v','\uFF37':'w','\uFF38':'x','\uFF39':'y','\uFF3A':'z',
  '\uFF41':'a','\uFF42':'b','\uFF43':'c','\uFF44':'d','\uFF45':'e','\uFF46':'f','\uFF47':'g',
  '\uFF48':'h','\uFF49':'i','\uFF4A':'j','\uFF4B':'k','\uFF4C':'l','\uFF4D':'m','\uFF4E':'n',
  '\uFF4F':'o','\uFF50':'p','\uFF51':'q','\uFF52':'r','\uFF53':'s','\uFF54':'t','\uFF55':'u',
  '\uFF56':'v','\uFF57':'w','\uFF58':'x','\uFF59':'y','\uFF5A':'z',
  // Other common symbols
  '…':'.','‥':'..','―':'-','─':'-','—':'-','~':'-',
  '〜':'-','∼':'-','※':'*','†':'+','‡':'+',
  '°':'o','′':"'",'″':'"',
  '×':'x','÷':'/',
};

const ROMAJI_ALTS = {
  'し': ['shi','ci'],
  'ち': ['chi'],
  'つ': ['tsu'],
  'ふ': ['fu'],
  'じ': ['ji'],
  'しゃ': ['sha'], 'しゅ': ['shu'], 'しょ': ['sho'],
  'ちゃ': ['cha'], 'ちゅ': ['chu'], 'ちょ': ['cho'],
  'じゃ': ['ja','jya'], 'じゅ': ['ju','jyu'], 'じょ': ['jo','jyo'],
};

function kataToHira(str) {
  return str.replace(/[\u30A1-\u30F6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
}

function hiraToRomajiParts(hira) {
  const parts = [];
  let i = 0;
  while (i < hira.length) {
    const ch = hira[i];

    // っ (double consonant)
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
      // ん: allow single 'n' when next is not vowel/ya/yu/yo/na-row
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

function mergeReadings(parts) {
  if (parts.length === 0) return [''];
  if (parts.length === 1) return parts[0].readings;
  let combos = parts[0].readings.map(r => [r]);
  for (let i = 1; i < parts.length; i++) {
    const nc = [];
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

// --- Main analysis function ---
function analyzeText(text) {
  const tokens = tokenizer.tokenize(text);
  const segments = [];

  for (const token of tokens) {
    const surface = token.surface_form;

    // Newlines
    if (surface === '\n' || surface === '\r\n') {
      segments.push({ display: '\u21B5', readings: ['\n'] });
      continue;
    }

    // Whitespace-only
    if (/^\s+$/.test(surface)) {
      for (const ch of surface) {
        if (ch === '\n') segments.push({ display: '\u21B5', readings: ['\n'] });
        else segments.push({ display: ' ', readings: [' '] });
      }
      continue;
    }

    // ASCII passthrough
    if (/^[a-zA-Z0-9 !?.,;:'"`~@#$%^&*()\[\]{}<>\/|+=_\-]+$/.test(surface)) {
      for (const ch of surface) {
        segments.push({ display: ch, readings: [ch.toLowerCase()] });
      }
      continue;
    }

    // Symbols & punctuation (Japanese fullwidth, CJK symbols, etc.)
    // Check if every char in the surface is a non-kana, non-kanji symbol
    if (/^[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBFa-zA-Z0-9]+$/.test(surface)) {
      for (const ch of surface) {
        if (ROMAJI_MAP[ch]) {
          segments.push({ display: ch, readings: [ROMAJI_MAP[ch]] });
        } else {
          const h = kataToHira(ch);
          if (ROMAJI_MAP[h]) {
            segments.push({ display: ch, readings: [ROMAJI_MAP[h]] });
          }
          // Unmapped symbols are silently skipped (auto-advance)
        }
      }
      continue;
    }

    // Get reading from kuromoji
    const reading = token.reading || token.pronunciation || '';
    const hira = kataToHira(reading);

    if (hira && /^[\u3040-\u309F\u30A0-\u30FF]+$/.test(reading)) {
      const parts = hiraToRomajiParts(hira);
      segments.push({ display: surface, readings: mergeReadings(parts) });
      continue;
    }

    // Fallback: surface is kana
    const surfaceHira = kataToHira(surface);
    if (/^[\u3040-\u309F]+$/.test(surfaceHira)) {
      const parts = hiraToRomajiParts(surfaceHira);
      segments.push({ display: surface, readings: mergeReadings(parts) });
      continue;
    }

    // Last resort: per-character with symbol mapping
    for (const ch of surface) {
      if (ROMAJI_MAP[ch]) {
        segments.push({ display: ch, readings: [ROMAJI_MAP[ch]] });
      } else {
        const chH = kataToHira(ch);
        if (ROMAJI_MAP[chH]) segments.push({ display: ch, readings: [ROMAJI_MAP[chH]] });
        // Unmapped chars silently skipped
      }
    }
  }

  return segments.filter(s => s.readings.length > 0 && s.readings[0] !== '');
}

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', tokenizer: !!tokenizer }));
    return;
  }

  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body);
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text is required' }));
          return;
        }

        // Ensure tokenizer is ready
        await getTokenizer();

        const start = Date.now();
        const segments = analyzeText(text);
        const elapsed = Date.now() - start;
        console.log(`[analyzer] Analyzed ${text.length} chars -> ${segments.length} segments in ${elapsed}ms`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ segments }));
      } catch (err) {
        console.error('[analyzer] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Pre-load dictionary on startup
getTokenizer().then(() => {
  console.log('[analyzer] Ready!');
}).catch(err => {
  console.error('[analyzer] Failed to pre-load dictionary:', err);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[analyzer] Morphological analysis server running on http://127.0.0.1:${PORT}`);
});
