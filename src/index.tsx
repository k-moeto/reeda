import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import auth from './routes/auth';
import documents from './routes/documents';

const app = new Hono<Env>();

app.use('/api/*', cors());

// API routes
app.route('/api/auth', auth);
app.route('/api/documents', documents);

// Serve the SPA for all non-API routes
app.get('*', (c) => {
  return c.html(renderHTML());
});

function renderHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>reeda - リー打</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Inter"', '"Noto Sans JP"', 'sans-serif'],
            mono: ['"JetBrains Mono"', '"Noto Sans JP"', 'monospace'],
          },
          colors: {
            ink: { 50: '#f8f8f8', 100: '#f0f0f0', 200: '#e4e4e4', 300: '#d1d1d1', 400: '#a8a8a8', 500: '#737373', 600: '#525252', 700: '#404040', 800: '#262626', 900: '#171717' },
          }
        }
      }
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Noto+Sans+JP:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', 'Noto Sans JP', sans-serif; background: #fafafa; color: #171717; }
    .mono { font-family: 'JetBrains Mono', 'Noto Sans JP', monospace; }

    /* Typing display */
    .char-correct { color: #171717; }
    .char-current { background: #171717; color: #fafafa; padding: 0 1px; border-radius: 2px; }
    .char-upcoming { color: #a8a8a8; }
    .char-miss { color: #ef4444; text-decoration: underline; }

    /* Romaji input display */
    .roma-correct { color: #171717; }
    .roma-current { color: #171717; font-weight: 600; }
    .roma-upcoming { color: #d1d1d1; }

    /* Drop zone */
    .drop-zone { border: 2px dashed #d1d1d1; transition: all 0.2s ease; }
    .drop-zone.active { border-color: #171717; background: #f0f0f0; }

    /* Smooth transitions */
    .fade-in { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    /* Progress bar */
    .progress-fill { transition: width 0.3s ease; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 2px; }

    /* Focus ring removal on typing */
    .typing-active *:focus { outline: none; }
  </style>
</head>
<body class="min-h-screen">
  <div id="app"></div>

  <!-- PDF.js for PDF parsing -->
  <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs" type="module"></script>
  <!-- Mammoth.js for Word parsing -->
  <script src="https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js"></script>

  <script type="module">
// ============================================================
// reeda - Main Application
// ============================================================

// --- PDF.js setup ---
let pdfjsLib = null;
async function initPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
  return pdfjsLib;
}

// ============================================================
// Romaji Mapping Engine
// ============================================================
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
  '　':' ',
};

// Alternative romaji inputs accepted
const ROMAJI_ALTS = {
  'し': ['shi','ci'],
  'ち': ['chi'],
  'つ': ['tsu'],
  'ふ': ['fu'],
  'じ': ['ji'],
  'しゃ': ['sha'],
  'しゅ': ['shu'],
  'しょ': ['sho'],
  'ちゃ': ['cha'],
  'ちゅ': ['chu'],
  'ちょ': ['cho'],
  'じゃ': ['ja','jya'],
  'じゅ': ['ju','jyu'],
  'じょ': ['jo','jyo'],
};

// Katakana to Hiragana converter
function kataToHira(str) {
  return str.replace(/[\\u30A1-\\u30F6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));
}

// Convert text to typing segments
// Each segment = { display: original char(s), readings: [possible romaji inputs] }
function textToSegments(text) {
  const segments = [];
  const hira = kataToHira(text);
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    const hch = hira[i];

    // ASCII passthrough (letters, numbers, punctuation, space)
    if (/[a-zA-Z0-9 !?.,;:'"\\\`~@#$%^&*()\\[\\]{}<>\\/|+=_\\-]/.test(ch)) {
      segments.push({ display: ch, readings: [ch.toLowerCase()] });
      i++;
      continue;
    }

    // Newline
    if (ch === '\\n') {
      segments.push({ display: '↵', readings: ['\\n'] });
      i++;
      continue;
    }

    // っ (double consonant) - look ahead
    if (hch === 'っ' && i + 1 < text.length) {
      const nextHira = kataToHira(text[i + 1]);
      // Check for two-char combo after っ
      let found = false;
      if (i + 2 < text.length) {
        const twoAfter = kataToHira(text.substring(i + 1, i + 3));
        if (ROMAJI_MAP[twoAfter]) {
          const base = ROMAJI_MAP[twoAfter];
          const readings = [base[0] + base];
          const altKey = twoAfter;
          if (ROMAJI_ALTS[altKey]) {
            for (const alt of ROMAJI_ALTS[altKey]) {
              readings.push(alt[0] + alt);
            }
          }
          segments.push({ display: text.substring(i, i + 3), readings });
          i += 3;
          found = true;
        }
      }
      if (!found) {
        const afterMap = ROMAJI_MAP[nextHira];
        if (afterMap) {
          const readings = [afterMap[0] + afterMap];
          const altKey = nextHira;
          if (ROMAJI_ALTS[altKey]) {
            for (const alt of ROMAJI_ALTS[altKey]) {
              readings.push(alt[0] + alt);
            }
          }
          segments.push({ display: text.substring(i, i + 2), readings });
          i += 2;
        } else {
          segments.push({ display: ch, readings: ['xtu', 'xtsu', 'ltu', 'ltsu'] });
          i++;
        }
      }
      continue;
    }

    // Two-char kana combos (きゃ, しゅ, etc.)
    if (i + 1 < text.length) {
      const twoChar = hira.substring(i, i + 2);
      if (ROMAJI_MAP[twoChar]) {
        const readings = [ROMAJI_MAP[twoChar]];
        if (ROMAJI_ALTS[twoChar]) readings.push(...ROMAJI_ALTS[twoChar]);
        segments.push({ display: text.substring(i, i + 2), readings });
        i += 2;
        continue;
      }
    }

    // Single kana
    if (ROMAJI_MAP[hch]) {
      const readings = [ROMAJI_MAP[hch]];
      if (ROMAJI_ALTS[hch]) readings.push(...ROMAJI_ALTS[hch]);
      // ん special: allow single 'n' if next char is not a vowel/ya/yu/yo/na-row
      if (hch === 'ん' && i + 1 < text.length) {
        const nextH = kataToHira(text[i + 1]);
        if (!/[あいうえおやゆよなにぬねの]/.test(nextH) && !/^[aiueoy]/.test(ROMAJI_MAP[nextH] || '')) {
          readings.unshift('n');
        }
      }
      segments.push({ display: ch, readings });
      i++;
      continue;
    }

    // Unknown character - passthrough
    segments.push({ display: ch, readings: [ch] });
    i++;
  }

  return segments;
}


// ============================================================
// State Management
// ============================================================
const state = {
  user: null,
  view: 'loading', // loading, auth, dashboard, typing
  documents: [],
  currentDoc: null,
  currentProgress: null,
  currentBookmarks: [],
  // Typing state
  segments: [],
  segmentIndex: 0,
  charIndex: 0,       // position within current segment's active reading
  activeReading: null, // which reading pattern is being matched
  missCount: 0,
  correctCount: 0,
  totalTyped: 0,
  startTime: null,
  elapsedSec: 0,
  timerInterval: null,
  lastMiss: false,
  // File parsing
  parsing: false,
};

// ============================================================
// API Helpers
// ============================================================
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  return res.json();
}

// ============================================================
// Router / Render
// ============================================================
function render() {
  const app = document.getElementById('app');
  switch (state.view) {
    case 'loading': app.innerHTML = renderLoading(); break;
    case 'auth': app.innerHTML = renderAuth(); bindAuth(); break;
    case 'dashboard': app.innerHTML = renderDashboard(); bindDashboard(); break;
    case 'typing': app.innerHTML = renderTyping(); bindTyping(); break;
  }
}

// ============================================================
// Loading View
// ============================================================
function renderLoading() {
  return '<div class="flex items-center justify-center min-h-screen"><p class="text-ink-400 text-sm">読み込み中...</p></div>';
}

// ============================================================
// Auth View
// ============================================================
function renderAuth() {
  return \`
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-sm fade-in">
      <div class="text-center mb-10">
        <h1 class="text-2xl font-semibold tracking-tight">reeda</h1>
        <p class="text-ink-400 text-sm mt-1">タイピングで、読む。</p>
      </div>

      <div id="auth-tabs" class="flex border-b border-ink-200 mb-6">
        <button id="tab-login" class="flex-1 pb-2 text-sm font-medium border-b-2 border-ink-900">ログイン</button>
        <button id="tab-register" class="flex-1 pb-2 text-sm text-ink-400 border-b-2 border-transparent">新規登録</button>
      </div>

      <form id="auth-form" class="space-y-4">
        <div id="name-field" class="hidden">
          <input type="text" id="auth-name" placeholder="表示名"
            class="w-full px-3 py-2.5 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 transition bg-white" />
        </div>
        <div>
          <input type="email" id="auth-email" placeholder="メールアドレス" autocomplete="email"
            class="w-full px-3 py-2.5 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 transition bg-white" />
        </div>
        <div>
          <input type="password" id="auth-password" placeholder="パスワード（8文字以上）" autocomplete="current-password"
            class="w-full px-3 py-2.5 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 transition bg-white" />
        </div>
        <div id="auth-error" class="text-red-500 text-xs hidden"></div>
        <button type="submit" class="w-full py-2.5 bg-ink-900 text-white text-sm font-medium rounded-lg hover:bg-ink-800 transition">
          ログイン
        </button>
      </form>
    </div>
  </div>\`;
}

function bindAuth() {
  let mode = 'login';
  const tabLogin = document.getElementById('tab-login');
  const tabReg = document.getElementById('tab-register');
  const nameField = document.getElementById('name-field');
  const form = document.getElementById('auth-form');
  const errEl = document.getElementById('auth-error');
  const submitBtn = form.querySelector('button[type="submit"]');

  function setMode(m) {
    mode = m;
    if (m === 'login') {
      tabLogin.classList.add('border-ink-900', 'font-medium'); tabLogin.classList.remove('text-ink-400', 'border-transparent');
      tabReg.classList.remove('border-ink-900', 'font-medium'); tabReg.classList.add('text-ink-400', 'border-transparent');
      nameField.classList.add('hidden');
      submitBtn.textContent = 'ログイン';
    } else {
      tabReg.classList.add('border-ink-900', 'font-medium'); tabReg.classList.remove('text-ink-400', 'border-transparent');
      tabLogin.classList.remove('border-ink-900', 'font-medium'); tabLogin.classList.add('text-ink-400', 'border-transparent');
      nameField.classList.remove('hidden');
      submitBtn.textContent = '新規登録';
    }
    errEl.classList.add('hidden');
  }

  tabLogin.onclick = () => setMode('login');
  tabReg.onclick = () => setMode('register');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const displayName = document.getElementById('auth-name').value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = '処理中...';

    try {
      let data;
      if (mode === 'login') {
        data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      } else {
        data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
      }
      if (data.error) {
        errEl.textContent = data.error;
        errEl.classList.remove('hidden');
      } else {
        state.user = data.user;
        state.view = 'dashboard';
        await loadDocuments();
        render();
      }
    } catch (err) {
      errEl.textContent = 'エラーが発生しました';
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'ログイン' : '新規登録';
    }
  };
}

// ============================================================
// Dashboard View
// ============================================================
async function loadDocuments() {
  const data = await api('/documents');
  state.documents = data.documents || [];
}

function renderDashboard() {
  const docs = state.documents;
  const docList = docs.length === 0
    ? '<p class="text-ink-400 text-sm text-center py-8">まだドキュメントがありません</p>'
    : docs.map(d => {
        const pct = d.total_chars > 0 ? Math.round((d.current_position || 0) / d.total_chars * 100) : 0;
        const isComplete = d.completed === 1;
        return \`
        <div class="group flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-ink-50 cursor-pointer transition" data-doc-id="\${d.id}">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">\${escHtml(d.title)}</p>
            <div class="flex items-center gap-3 mt-1">
              <div class="flex-1 h-1 bg-ink-100 rounded-full overflow-hidden max-w-[120px]">
                <div class="h-full bg-ink-900 rounded-full progress-fill" style="width:\${pct}%"></div>
              </div>
              <span class="text-xs text-ink-400">\${pct}%</span>
              <span class="text-xs text-ink-300">\${d.total_chars.toLocaleString()}字</span>
            </div>
          </div>
          <button class="delete-doc opacity-0 group-hover:opacity-100 text-ink-300 hover:text-red-500 text-xs transition p-1" data-del-id="\${d.id}">✕</button>
        </div>\`;
      }).join('');

  return \`
  <div class="max-w-2xl mx-auto px-4 py-8 min-h-screen">
    <header class="flex items-center justify-between mb-10">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">reeda</h1>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-ink-400">\${escHtml(state.user?.displayName || '')}</span>
        <button id="logout-btn" class="text-xs text-ink-400 hover:text-ink-700 transition">ログアウト</button>
      </div>
    </header>

    <!-- Drop Zone -->
    <div id="drop-zone" class="drop-zone rounded-xl p-10 text-center mb-8 cursor-pointer">
      <div class="pointer-events-none">
        <p class="text-ink-400 text-sm">ファイルをドロップ、またはクリックして選択</p>
        <p class="text-ink-300 text-xs mt-1">.txt .pdf .docx に対応</p>
      </div>
      <input type="file" id="file-input" accept=".txt,.pdf,.docx" class="hidden" />
    </div>

    <!-- Paste text -->
    <details class="mb-8">
      <summary class="text-xs text-ink-400 cursor-pointer hover:text-ink-600 transition">テキストを直接入力</summary>
      <div class="mt-3 space-y-2">
        <input type="text" id="paste-title" placeholder="タイトル" class="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 bg-white" />
        <textarea id="paste-content" placeholder="テキストを貼り付け..." rows="4" class="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 bg-white resize-none"></textarea>
        <button id="paste-submit" class="px-4 py-2 text-sm bg-ink-900 text-white rounded-lg hover:bg-ink-800 transition">追加</button>
      </div>
    </details>

    <div id="parsing-indicator" class="hidden text-center py-4">
      <p class="text-ink-400 text-sm">ファイルを解析中...</p>
    </div>

    <!-- Document list -->
    <div>
      <h2 class="text-xs text-ink-400 uppercase tracking-wider mb-3">ドキュメント</h2>
      <div id="doc-list">\${docList}</div>
    </div>
  </div>\`;
}

function bindDashboard() {
  // Logout
  document.getElementById('logout-btn').onclick = async () => {
    await api('/auth/logout', { method: 'POST' });
    state.user = null;
    state.view = 'auth';
    render();
  };

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('active'); };
  dropZone.ondragleave = () => dropZone.classList.remove('active');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  };
  fileInput.onchange = (e) => { if (e.target.files.length) handleFile(e.target.files[0]); };

  // Paste text
  document.getElementById('paste-submit').onclick = async () => {
    const title = document.getElementById('paste-title').value.trim() || '無題';
    const content = document.getElementById('paste-content').value.trim();
    if (!content) return;
    await saveAndOpen(title, content, 'paste');
  };

  // Document click
  document.getElementById('doc-list').onclick = async (e) => {
    const delBtn = e.target.closest('.delete-doc');
    if (delBtn) {
      e.stopPropagation();
      if (confirm('このドキュメントを削除しますか？')) {
        await api('/documents/' + delBtn.dataset.delId, { method: 'DELETE' });
        await loadDocuments();
        render();
      }
      return;
    }
    const row = e.target.closest('[data-doc-id]');
    if (row) openDocument(row.dataset.docId);
  };
}

// ============================================================
// File Parsing
// ============================================================
async function handleFile(file) {
  const indicator = document.getElementById('parsing-indicator');
  indicator?.classList.remove('hidden');

  try {
    const name = file.name;
    const ext = name.split('.').pop().toLowerCase();
    let text = '';

    if (ext === 'txt') {
      text = await file.text();
    } else if (ext === 'pdf') {
      text = await parsePdf(file);
    } else if (ext === 'docx') {
      text = await parseDocx(file);
    } else {
      alert('対応していないファイル形式です（.txt .pdf .docx）');
      return;
    }

    text = text.trim();
    if (!text) { alert('テキストを抽出できませんでした'); return; }

    const title = name.replace(/\\.[^.]+$/, '');
    await saveAndOpen(title, text, ext);
  } catch (err) {
    console.error(err);
    alert('ファイルの読み取りに失敗しました: ' + err.message);
  } finally {
    indicator?.classList.add('hidden');
  }
}

async function parsePdf(file) {
  const lib = await initPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join('') + '\\n';
  }
  return text;
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function saveAndOpen(title, content, sourceType) {
  // Clean up content: normalize whitespace, remove excessive line breaks
  content = content.replace(/\\r\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim();

  const data = await api('/documents', {
    method: 'POST',
    body: JSON.stringify({ title, content, sourceType }),
  });

  if (data.error) {
    alert(data.error);
    return;
  }

  await openDocument(data.document.id);
}

// ============================================================
// Open Document & Start Typing
// ============================================================
async function openDocument(docId) {
  const data = await api('/documents/' + docId);
  if (data.error) { alert(data.error); return; }

  state.currentDoc = data.document;
  state.currentProgress = data.progress;
  state.currentBookmarks = data.bookmarks || [];

  // Build segments from content
  const content = data.document.content;
  state.segments = textToSegments(content);
  state.segmentIndex = data.progress?.current_position || 0;
  state.charIndex = 0;
  state.activeReading = null;
  state.missCount = data.progress?.miss_count || 0;
  state.correctCount = data.progress?.correct_count || 0;
  state.totalTyped = data.progress?.total_typed || 0;
  state.elapsedSec = data.progress?.reading_time_sec || 0;
  state.startTime = null;
  state.lastMiss = false;

  state.view = 'typing';
  render();
}

// ============================================================
// Typing View
// ============================================================
function renderTyping() {
  const doc = state.currentDoc;
  const totalSegs = state.segments.length;
  const pct = totalSegs > 0 ? Math.round(state.segmentIndex / totalSegs * 100) : 0;

  return \`
  <div class="max-w-3xl mx-auto px-4 py-6 min-h-screen flex flex-col typing-active" id="typing-container">
    <!-- Header -->
    <header class="flex items-center justify-between mb-6 flex-shrink-0">
      <button id="back-btn" class="text-ink-400 hover:text-ink-700 text-sm transition">← 戻る</button>
      <h2 class="text-sm font-medium truncate max-w-[50%]">\${escHtml(doc.title)}</h2>
      <button id="bookmark-btn" class="text-ink-400 hover:text-ink-700 text-sm transition" title="ブックマーク">🔖</button>
    </header>

    <!-- Main typing area -->
    <div class="flex-1 flex flex-col justify-center mb-6">
      <!-- Original text display -->
      <div id="text-display" class="text-xl leading-relaxed mb-8 min-h-[120px]">
      </div>

      <!-- Romaji guide -->
      <div id="romaji-display" class="mono text-lg text-center py-4 border-t border-ink-100">
      </div>
    </div>

    <!-- Status bar -->
    <footer class="flex-shrink-0 border-t border-ink-100 pt-4 pb-2">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
          <div id="progress-bar" class="h-full bg-ink-900 rounded-full progress-fill" style="width:\${pct}%"></div>
        </div>
        <span id="progress-pct" class="text-xs text-ink-400 w-10 text-right">\${pct}%</span>
      </div>
      <div class="flex items-center justify-between text-xs text-ink-400">
        <span id="stat-wpm">WPM: 0</span>
        <span id="stat-acc">正確率: 100%</span>
        <span id="stat-time">経過: 0:00</span>
        <span id="stat-pos">\${state.segmentIndex} / \${totalSegs}</span>
      </div>
    </footer>
  </div>\`;
}

function bindTyping() {
  updateTypingDisplay();

  // Back button
  document.getElementById('back-btn').onclick = async () => {
    await saveProgress();
    clearInterval(state.timerInterval);
    state.view = 'dashboard';
    await loadDocuments();
    render();
  };

  // Bookmark
  document.getElementById('bookmark-btn').onclick = async () => {
    const pos = state.segmentIndex;
    const note = prompt('メモ（任意）:') || '';
    await api('/documents/' + state.currentDoc.id + '/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ position: pos, note }),
    });
    alert('ブックマークしました');
  };

  // Keyboard input
  document.addEventListener('keydown', handleKeyDown);

  // Start timer
  state.startTime = Date.now();
  state.timerInterval = setInterval(() => {
    const extra = Math.floor((Date.now() - state.startTime) / 1000);
    const total = state.elapsedSec + extra;
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const el = document.getElementById('stat-time');
    if (el) el.textContent = '経過: ' + mins + ':' + String(secs).padStart(2, '0');
  }, 1000);

  // Auto-save every 30s
  state.autoSaveInterval = setInterval(() => saveProgress(), 30000);
}

function handleKeyDown(e) {
  if (state.view !== 'typing') {
    document.removeEventListener('keydown', handleKeyDown);
    return;
  }

  // Ignore modifier keys alone, and allow ctrl/cmd shortcuts
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return;

  e.preventDefault();

  if (state.segmentIndex >= state.segments.length) return; // Already finished

  const seg = state.segments[state.segmentIndex];

  // Determine active reading if not set
  if (state.activeReading === null) {
    state.charIndex = 0;
    state.activeReading = null; // Will be determined by first keypress
  }

  const typed = e.key === 'Enter' ? '\\n' : e.key;

  // If no active reading chosen yet, find which reading matches the first char
  if (state.activeReading === null) {
    const matching = seg.readings.filter(r => r[0] === typed);
    if (matching.length > 0) {
      // Pick the first matching reading
      state.activeReading = matching[0];
      state.charIndex = 1;
      state.correctCount++;
      state.totalTyped++;
      state.lastMiss = false;

      // If single-char reading, move to next segment
      if (state.activeReading.length === 1) {
        advanceSegment();
      }
    } else {
      // Miss
      state.missCount++;
      state.totalTyped++;
      state.lastMiss = true;
    }
  } else {
    // Continue matching active reading
    const expected = state.activeReading[state.charIndex];
    if (typed === expected) {
      state.charIndex++;
      state.correctCount++;
      state.totalTyped++;
      state.lastMiss = false;

      if (state.charIndex >= state.activeReading.length) {
        advanceSegment();
      }
    } else {
      // Check if switching to alternative reading is possible
      const typedSoFar = state.activeReading.substring(0, state.charIndex) + typed;
      const alt = seg.readings.find(r => r.startsWith(typedSoFar) && r !== state.activeReading);
      if (alt) {
        state.activeReading = alt;
        state.charIndex = typedSoFar.length;
        state.correctCount++;
        state.totalTyped++;
        state.lastMiss = false;
        if (state.charIndex >= state.activeReading.length) {
          advanceSegment();
        }
      } else {
        state.missCount++;
        state.totalTyped++;
        state.lastMiss = true;
      }
    }
  }

  updateTypingDisplay();
  updateStats();
}

function advanceSegment() {
  state.segmentIndex++;
  state.charIndex = 0;
  state.activeReading = null;

  if (state.segmentIndex >= state.segments.length) {
    // Finished!
    clearInterval(state.timerInterval);
    clearInterval(state.autoSaveInterval);
    saveProgress(true);
    setTimeout(() => {
      alert('読了おめでとうございます！🎉');
    }, 100);
  }
}

function updateTypingDisplay() {
  const textEl = document.getElementById('text-display');
  const romaEl = document.getElementById('romaji-display');
  if (!textEl || !romaEl) return;

  const segs = state.segments;
  const idx = state.segmentIndex;

  // Show context: a window of segments around current position
  const CONTEXT_BEFORE = 20;
  const CONTEXT_AFTER = 40;
  const start = Math.max(0, idx - CONTEXT_BEFORE);
  const end = Math.min(segs.length, idx + CONTEXT_AFTER);

  let html = '';
  for (let i = start; i < end; i++) {
    const s = segs[i];
    const display = escHtml(s.display === '\\n' ? '↵ ' : s.display);
    if (i < idx) {
      html += '<span class="char-correct">' + display + '</span>';
    } else if (i === idx) {
      html += '<span class="char-current">' + display + '</span>';
    } else {
      html += '<span class="char-upcoming">' + display + '</span>';
    }
  }
  textEl.innerHTML = html;

  // Romaji display for current segment
  if (idx < segs.length) {
    const seg = segs[idx];
    const reading = state.activeReading || seg.readings[0];
    let romaHtml = '';
    for (let i = 0; i < reading.length; i++) {
      const ch = reading[i] === '\\n' ? '⏎' : reading[i];
      if (i < state.charIndex) {
        romaHtml += '<span class="roma-correct">' + escHtml(ch) + '</span>';
      } else if (i === state.charIndex) {
        romaHtml += '<span class="roma-current' + (state.lastMiss ? ' text-red-500' : '') + '">' + escHtml(ch) + '</span>';
      } else {
        romaHtml += '<span class="roma-upcoming">' + escHtml(ch) + '</span>';
      }
    }
    romaEl.innerHTML = romaHtml;
  } else {
    romaEl.innerHTML = '<span class="text-ink-400">完了！</span>';
  }
}

function updateStats() {
  const total = state.correctCount + state.missCount;
  const acc = total > 0 ? Math.round(state.correctCount / total * 100 * 10) / 10 : 100;
  const elapsed = state.elapsedSec + (state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0);
  const wpm = elapsed > 0 ? Math.round(state.correctCount / (elapsed / 60)) : 0;
  const pct = state.segments.length > 0 ? Math.round(state.segmentIndex / state.segments.length * 100) : 0;

  const accEl = document.getElementById('stat-acc');
  const wpmEl = document.getElementById('stat-wpm');
  const posEl = document.getElementById('stat-pos');
  const barEl = document.getElementById('progress-bar');
  const pctEl = document.getElementById('progress-pct');

  if (accEl) accEl.textContent = '正確率: ' + acc + '%';
  if (wpmEl) wpmEl.textContent = 'WPM: ' + wpm;
  if (posEl) posEl.textContent = state.segmentIndex + ' / ' + state.segments.length;
  if (barEl) barEl.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
}

async function saveProgress(completed = false) {
  if (!state.currentDoc) return;
  const elapsed = state.elapsedSec + (state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0);
  await api('/documents/' + state.currentDoc.id + '/progress', {
    method: 'PUT',
    body: JSON.stringify({
      currentPosition: state.segmentIndex,
      totalTyped: state.totalTyped,
      correctCount: state.correctCount,
      missCount: state.missCount,
      readingTimeSec: elapsed,
      completed: completed || state.segmentIndex >= state.segments.length,
    }),
  });
}

// ============================================================
// Utilities
// ============================================================
function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// Init
// ============================================================
async function init() {
  const data = await api('/auth/me');
  if (data.user) {
    state.user = data.user;
    state.view = 'dashboard';
    await loadDocuments();
  } else {
    state.view = 'auth';
  }
  render();
}

init();
  </script>
</body>
</html>`;
}

export default app;
