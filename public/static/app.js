// ============================================================
// reeda - Main Application (app.js)
// Typing-based reading app for Japanese text
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
// Text Cleaning Engine (client-side, applied before sending to server)
// Removes metadata, headers, navigation, URLs, credits, and other
// non-content text from articles, leaving only the main body.
// ============================================================
const NOISE_PATTERNS = [
  // UI / Navigation labels
  /^\s*(HOME|MENU|TOP|BACK|NEXT|PREV|INDEX|CONTACT|ABOUT|FAQ|SEARCH|LOGIN|LOGOUT|SIGN\s*(?:IN|UP|OUT)|REGISTER|CART|CLOSE|OPEN|SHARE|PRINT|DOWNLOAD|MORE|LESS|SHOW|HIDE|TOGGLE|EXPAND|COLLAPSE)\s*$/gim,
  // Breadcrumbs
  /^\s*(?:HOME|TOP|トップ|ホーム)\s*[>›»→▶\|／/].*$/gm,
  // Nav bars (short items separated by delimiters)
  /^\s*(?:[\w\u3000-\u9FFF]{1,8}\s*[|│｜/／>›»·・▸▶■□●○◆◇★☆]\s*){2,}[\w\u3000-\u9FFF]{1,8}\s*$/gm,
  // Page numbers
  /^\s*(?:(?:p|P|ページ|page)?\.?\s*\d{1,5}\s*(?:\/\s*\d{1,5})?)\s*$/gm,
  // Copyright / legal
  /^.*(?:©|Copyright|All\s*Rights\s*Reserved|無断転載禁止|無断複製|転載禁止).*$/gim,
  // Social share buttons
  /^\s*(?:(?:Share|シェア|共有|Tweet|ツイート|いいね|Like|Follow|フォロー|Subscribe|RSS|LINE|Facebook|Twitter|Instagram|YouTube|TikTok)\s*[\s|/・]*){2,}.*$/gim,
  // Cookie/privacy banners
  /^.*(?:Cookie|クッキー|プライバシー|Privacy\s*Policy).*(?:同意|承諾|Accept|OK|閉じる|Close).*$/gim,
  // Ad labels
  /^\s*(?:広告|PR|AD|Sponsored|スポンサー|\[PR\]|【PR】|【広告】|ADVERTISEMENT)\s*$/gim,
  // Lines that are only brackets/parens
  /^\s*[\[\]()（）「」『』【】{}<>〈〉《》〔〕\u3014\u3015]+\s*$/gm,
  // Decorative separator lines
  /^\s*[=\-─━═▬◆◇■□●○★☆♦♠♣♥►▶◄◀▲▼△▽※†‡§¶→←↑↓↔⇒⇐⇑⇓…‥・]{3,}\s*$/gm,
  // "Read more" links
  /^\s*(?:続きを読む|もっと見る|もっと読む|Read\s*more|See\s*more|View\s*all|Show\s*more|詳しくはこちら|Click\s*here|こちら|詳細を見る|全文を読む)\s*[→>›»]?\s*$/gim,
  // Category/tag labels alone
  /^\s*(?:カテゴリ[ー:]?|タグ[:]?|Category[:]?|Tags?[:]?)\s*$/gim,
  // Dates alone on a line
  /^\s*\d{4}[\/\-\.年]\d{1,2}[\/\-\.月]\d{1,2}日?\s*$/gm,
  // URLs anywhere (inline or standalone)
  /https?:\/\/[^\s)\]>」』】]+/gm,
  // Email addresses alone
  /^\s*[\w.+-]+@[\w-]+\.[\w.]+\s*$/gm,
  // Subscription / newsletter prompts
  /^\s*(?:メールマガジン|ニュースレター|Newsletter|メルマガ|購読|配信登録|登録はこちら).*$/gim,
  // Comment section headers
  /^\s*(?:コメント|Comments?|コメントを(?:書く|残す|投稿)|Leave\s*a?\s*(?:comment|reply)|返信).*$/gim,
  // Related articles headers
  /^\s*(?:関連(?:記事|ニュース|リンク)|おすすめ記事|人気記事|新着記事|Related\s*(?:Articles?|Posts?|Links?)|Recommended|Popular|Recent).*$/gim,
  // Author/publish metadata lines (short, with labels)
  /^\s*(?:著者|執筆者|ライター|Author|Writer|By)\s*[:：]\s*.{0,30}\s*$/gim,
  /^\s*(?:公開日|更新日|投稿日|掲載日|Published|Updated|Posted)\s*[:：]?\s*\d{4}.*$/gim,
  // "Back to top" / pagination
  /^\s*(?:ページの先頭へ|トップに戻る|Back\s*to\s*top|前へ|次へ|前のページ|次のページ)\s*$/gim,
  // Pure number sequences (like page counts)
  /^\s*\d+\s*$/gm,
  // Photo credits / caption metadata
  /^\s*(?:聞き手|写真|撮影|取材|構成|イラスト|編集|文|TEXT|PHOTO|Photo|Text)\s*[:：].*$/gim,
  // Lines combining multiple credit roles (e.g. "聞き手・文: X 写真: Y")
  /^\s*(?:(?:聞き手|写真|撮影|取材|構成|イラスト|編集|文|TEXT|PHOTO)\s*[:：・]?\s*[^\n]{0,30}\s*){2,}$/gim,
  // ※ annotations
  /^\s*※.{0,120}$/gm,
  // Title-like lines with separator: "text | site" or "text - label" (only short ones)
  /^\s*.{1,30}\s*[|｜]\s*.{1,30}\s*$/gm,
  // Staff/role labels alone
  /^\s*(?:[A-Za-z]+\s+Staff|Staff|STAFF|スタッフ|編集部|ライター|記者|EDITOR|Editor)\s*$/gim,
  // Person with title/affiliation in parentheses: "名前 (肩書)"
  /^\s*.{1,20}\s*[\(（].{1,30}[\)）]\s*$/gm,
  // Bullet-point list items (very short, likely navigation)
  /^\s*[・\-\*]\s*.{1,15}\s*$/gm,
  // "Previous / Next" article navigation
  /^\s*(?:前の記事|次の記事|前の(?:ページ|投稿)|次の(?:ページ|投稿)|Previous|Next)\s*.{0,30}\s*$/gim,
];

const EDGE_NOISE_PATTERNS = [
  /^.{1,3}$/,
  /^[A-Z\s]{2,30}$/,
  /^[\u30A0-\u30FF\s]{2,10}$/,
];

// Detect if a line is actual body content (readable text)
function _isBodyLine(line) {
  if (!line || line.trim() === '') return false;
  const t = line.trim();
  // Dialogue: "名前: セリフ"
  if (/^.{1,10}[:：]\s*.{5,}/.test(t)) return true;
  // Sentence with ending punctuation and contains Japanese
  if (/[。！？!?」』\)）]\s*$/.test(t) && /[\u3040-\u9FFF]/.test(t)) return true;
  // Long paragraph with Japanese
  if (t.length >= 40 && /[\u3040-\u9FFF]/.test(t)) return true;
  return false;
}

// Find the index where body content starts, skipping header metadata
function _findBodyStart(lines) {
  // If the first non-empty line is already body, return it immediately
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') continue;
    if (_isBodyLine(t)) return i;
    break; // first non-empty line is not body; continue scanning
  }
  // Scan forward for the first body line
  for (let i = 0; i < lines.length; i++) {
    if (_isBodyLine(lines[i])) return i;
  }
  return 0;
}

function cleanText(raw) {
  let text = raw;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[^\S\n]+/g, ' ');

  // Apply noise patterns
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  let lines = text.split('\n');

  // Trim leading noise
  while (lines.length > 0) {
    const line = lines[0].trim();
    if (line === '') { lines.shift(); continue; }
    const isNoise = EDGE_NOISE_PATTERNS.some(p => p.test(line));
    const isNavLike = line.length < 50 && !line.match(/[。、.!?！？]/) && (line.split(/[\s|/・│｜]/).filter(w => w.trim()).length >= 3);
    if (isNoise || isNavLike) { lines.shift(); } else { break; }
  }

  // Skip header/metadata: find where body content actually starts
  const bodyIdx = _findBodyStart(lines);
  if (bodyIdx > 0) {
    lines = lines.slice(bodyIdx);
  }

  // Trim trailing noise
  while (lines.length > 0) {
    const line = lines[lines.length - 1].trim();
    if (line === '') { lines.pop(); continue; }
    const isNoise = EDGE_NOISE_PATTERNS.some(p => p.test(line));
    const isNavLike = line.length < 50 && !line.match(/[。、.!?！？]/) && (line.split(/[\s|/・│｜]/).filter(w => w.trim()).length >= 3);
    if (isNoise || isNavLike) { lines.pop(); } else { break; }
  }

  text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// ============================================================
// Theme & Font Size Initialization
// ============================================================
const FONT_SIZES = [
  { label: '小', typing: '18px', romaji: '22px', base: '13px' },
  { label: '標準', typing: '24px', romaji: '30px', base: '14px' },
  { label: '大', typing: '30px', romaji: '36px', base: '15px' },
  { label: '特大', typing: '36px', romaji: '42px', base: '16px' },
  { label: '最大', typing: '42px', romaji: '48px', base: '17px' },
];

function initTheme() {
  const saved = localStorage.getItem('reeda-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  if (next === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('reeda-theme', next);
}

function getThemeIcon() {
  return (document.documentElement.getAttribute('data-theme') === 'dark') ? '☀️' : '🌙';
}

function initFontSize() {
  const idx = parseInt(localStorage.getItem('reeda-fontsize') || '1');
  applyFontSize(idx);
}

function applyFontSize(idx) {
  const size = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, idx))];
  document.documentElement.style.setProperty('--font-size-typing', size.typing);
  document.documentElement.style.setProperty('--font-size-romaji', size.romaji);
  document.documentElement.style.setProperty('--font-size-base', size.base);
  localStorage.setItem('reeda-fontsize', String(idx));
}

function getCurrentFontSizeIndex() {
  return parseInt(localStorage.getItem('reeda-fontsize') || '1');
}

initTheme();
initFontSize();

// ============================================================
// State Management
// ============================================================
const state = {
  user: null,
  view: 'loading',
  documents: [],
  currentDoc: null,
  currentProgress: null,
  currentBookmarks: [],
  // Typing state - segments come from the server (pre-analyzed)
  segments: [],
  segmentIndex: 0,
  charIndex: 0,
  activeReading: null,
  missCount: 0,
  correctCount: 0,
  totalTyped: 0,
  startTime: null,
  elapsedSec: 0,
  timerInterval: null,
  autoSaveInterval: null,
  lastMiss: false,
  parsing: false,
  // Preview state
  previewTitle: '',
  previewContent: '',
  previewSourceType: '',
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
    case 'dashboard':
      app.innerHTML = renderDashboard();
      if (state.previewContent) {
        bindPreview();
      } else {
        bindDashboard();
      }
      break;
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
  return `
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
  </div>`;
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
      tabLogin.classList.add('border-ink-900', 'font-medium');
      tabLogin.classList.remove('text-ink-400', 'border-transparent');
      tabReg.classList.remove('border-ink-900', 'font-medium');
      tabReg.classList.add('text-ink-400', 'border-transparent');
      nameField.classList.add('hidden');
      submitBtn.textContent = 'ログイン';
    } else {
      tabReg.classList.add('border-ink-900', 'font-medium');
      tabReg.classList.remove('text-ink-400', 'border-transparent');
      tabLogin.classList.remove('border-ink-900', 'font-medium');
      tabLogin.classList.add('text-ink-400', 'border-transparent');
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
  if (state.view === 'dashboard' && state.previewContent) {
    return renderPreview();
  }
  const docs = state.documents;
  const docList = docs.length === 0
    ? '<p class="text-ink-400 text-sm text-center py-8">まだドキュメントがありません</p>'
    : docs.map(d => {
        const pos = d.current_position || 0;
        const total = d.total_chars || 1;
        const pct = d.completed ? 100 : Math.min(99, Math.round(pos / total * 100));
        const timeSec = d.reading_time_sec || 0;
        const timeStr = timeSec > 0 ? (timeSec >= 60 ? Math.floor(timeSec/60) + '分' + (timeSec%60 > 0 ? (timeSec%60)+'秒' : '') : timeSec + '秒') : '';
        const correct = d.correct_count || 0;
        const miss = d.miss_count || 0;
        const accPct = (correct + miss) > 0 ? Math.round(correct / (correct + miss) * 100) : 0;
        const wpm = timeSec > 0 ? Math.round(correct / (timeSec / 60)) : 0;
        const statsHtml = timeSec > 0
          ? `<span class="text-xs text-ink-300">${wpm} WPM</span><span class="text-xs text-ink-300">${accPct}%</span><span class="text-xs text-ink-300">${timeStr}</span>`
          : '';
        return `
        <div class="group flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-ink-50 cursor-pointer transition" data-doc-id="${d.id}">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${escHtml(d.title)}</p>
            <div class="flex items-center gap-3 mt-1">
              <div class="flex-1 h-1 bg-ink-100 rounded-full overflow-hidden max-w-[120px]">
                <div class="h-full bg-ink-900 rounded-full progress-fill" style="width:${pct}%"></div>
              </div>
              <span class="text-xs text-ink-400">${pct}%</span>
              <span class="text-xs text-ink-300">${d.total_chars.toLocaleString()}字</span>
              ${statsHtml}
            </div>
          </div>
          <button class="delete-doc opacity-0 group-hover:opacity-100 text-ink-300 hover:text-red-500 text-xs transition p-1" data-del-id="${d.id}">\u2715</button>
        </div>`;
      }).join('');

  return `
  <div class="max-w-2xl mx-auto px-4 py-8 min-h-screen">
    <header class="flex items-center justify-between mb-10">
      <div>
        <h1 class="text-lg font-semibold tracking-tight">reeda</h1>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-ink-400">${escHtml(state.user?.displayName || '')}</span>
        <button id="stats-btn" class="text-xs text-ink-400 hover:text-ink-700 transition" title="統計">📊</button>
        <button id="theme-toggle" class="theme-toggle" title="テーマ切替">${getThemeIcon()}</button>
        <button id="logout-btn" class="text-xs text-ink-400 hover:text-ink-700 transition">ログアウト</button>
      </div>
    </header>

    <div id="drop-zone" class="drop-zone rounded-xl p-10 text-center mb-8 cursor-pointer">
      <div class="pointer-events-none">
        <p class="text-ink-400 text-sm">ファイルをドロップ、またはクリックして選択</p>
        <p class="text-ink-300 text-xs mt-1">.txt .pdf .docx に対応</p>
      </div>
      <input type="file" id="file-input" accept=".txt,.pdf,.docx" class="hidden" />
    </div>

    <details class="mb-8">
      <summary class="text-xs text-ink-400 cursor-pointer hover:text-ink-600 transition">URLから記事をインポート</summary>
      <div class="mt-3 space-y-2">
        <div class="flex gap-2">
          <input type="url" id="url-input" placeholder="https://example.com/article"
            class="flex-1 px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 bg-white" />
          <button id="url-submit" class="px-4 py-2 text-sm bg-ink-900 text-white rounded-lg hover:bg-ink-800 transition whitespace-nowrap">取得</button>
        </div>
        <div id="url-error" class="text-red-500 text-xs hidden"></div>
      </div>
    </details>

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

    <div>
      <h2 class="text-xs text-ink-400 uppercase tracking-wider mb-3">ドキュメント</h2>
      <div id="doc-list">${docList}</div>
    </div>
  </div>`;
}

function bindDashboard() {
  document.getElementById('logout-btn').onclick = async () => {
    await api('/auth/logout', { method: 'POST' });
    state.user = null;
    state.view = 'auth';
    render();
  };

  document.getElementById('theme-toggle').onclick = () => {
    toggleTheme();
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = getThemeIcon();
  };

  document.getElementById('stats-btn').onclick = () => {
    showStats();
  };

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

  document.getElementById('paste-submit').onclick = async () => {
    const title = document.getElementById('paste-title').value.trim() || '無題';
    const content = document.getElementById('paste-content').value.trim();
    if (!content) return;
    const cleaned = cleanText(content);
    showPreview(title, cleaned, 'paste');
  };

  // URL import handler
  const urlSubmitBtn = document.getElementById('url-submit');
  if (urlSubmitBtn) {
    urlSubmitBtn.onclick = async () => {
      const urlInput = document.getElementById('url-input');
      const urlError = document.getElementById('url-error');
      const url = urlInput.value.trim();
      if (!url) return;

      urlError.classList.add('hidden');
      urlSubmitBtn.disabled = true;
      urlSubmitBtn.textContent = '取得中...';

      try {
        const data = await api('/documents/import-url', {
          method: 'POST',
          body: JSON.stringify({ url }),
        });

        if (data.error) {
          urlError.textContent = data.error;
          urlError.classList.remove('hidden');
        } else {
          const cleaned = cleanText(data.content);
          showPreview(data.title || '無題', cleaned, data.sourceType || 'url');
        }
      } catch (err) {
        urlError.textContent = 'URLの取得に失敗しました';
        urlError.classList.remove('hidden');
      } finally {
        urlSubmitBtn.disabled = false;
        urlSubmitBtn.textContent = '取得';
      }
    };
  }

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
// File Parsing (client-side)
// ============================================================
async function handleFile(file) {
  const indicator = document.getElementById('parsing-indicator');
  if (indicator) indicator.classList.remove('hidden');

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

    const cleaned = cleanText(text);
    const title = name.replace(/\.[^.]+$/, '');
    showPreview(title, cleaned, ext);
  } catch (err) {
    console.error(err);
    alert('ファイルの読み取りに失敗しました: ' + err.message);
  } finally {
    if (indicator) indicator.classList.add('hidden');
  }
}

async function parsePdf(file) {
  const lib = await initPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  const numPages = pdf.numPages;
  const allPageLines = []; // Array of { lines: [{text, y, x, fontSize, width}], pageHeight, pageWidth }

  // ── Pass 1: Extract text with position info from each page ──
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();

    // Group text items by Y coordinate (i.e., lines)
    const lineMap = new Map(); // y -> [{str, x, width, fontSize}]
    for (const item of content.items) {
      if (!item.str || item.str.trim() === '') continue;
      const tx = item.transform;
      const x = tx[4];
      const y = Math.round(tx[5] * 10) / 10; // Round Y to 0.1 precision
      const fontSize = Math.round(Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]) * 10) / 10;
      const width = item.width || 0;

      // Group items within ±2pt Y as same line
      let lineY = y;
      for (const [ky] of lineMap) {
        if (Math.abs(ky - y) < 2) { lineY = ky; break; }
      }
      if (!lineMap.has(lineY)) lineMap.set(lineY, []);
      lineMap.get(lineY).push({ str: item.str, x, width, fontSize });
    }

    // Sort lines by Y descending (PDF Y goes bottom-up, top of page = high Y)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const lines = sortedYs.map(y => {
      const items = lineMap.get(y).sort((a, b) => a.x - b.x);
      // Join items on the same line with appropriate spacing
      let lineText = '';
      let prevEnd = -1;
      let maxFontSize = 0;
      for (const item of items) {
        if (item.fontSize > maxFontSize) maxFontSize = item.fontSize;
        if (prevEnd >= 0) {
          const gap = item.x - prevEnd;
          // Insert space if there's a significant gap between items
          if (gap > item.fontSize * 0.3) {
            lineText += ' ';
          }
        }
        lineText += item.str;
        prevEnd = item.x + item.width;
      }
      return { text: lineText.trim(), y, fontSize: maxFontSize };
    });

    allPageLines.push({
      lines: lines.filter(l => l.text.length > 0),
      pageHeight: viewport.height,
      pageWidth: viewport.width,
    });
  }

  // ── Pass 2: Detect and remove repeating headers/footers ──
  if (numPages >= 3) {
    // Collect top lines (upper 12% of page) and bottom lines (lower 12%) from each page
    const topTexts = [];  // per page
    const bottomTexts = [];
    for (const pg of allPageLines) {
      const topThreshold = pg.pageHeight * 0.88; // PDF Y: top of page has high Y
      const bottomThreshold = pg.pageHeight * 0.12;
      const top = pg.lines.filter(l => l.y > topThreshold).map(l => l.text);
      const bottom = pg.lines.filter(l => l.y < bottomThreshold).map(l => l.text);
      topTexts.push(top.join(' ').trim());
      bottomTexts.push(bottom.join(' ').trim());
    }

    // Find repeating header pattern (appears in >50% of pages)
    const headerCandidates = findRepeatingPatterns(topTexts);
    const footerCandidates = findRepeatingPatterns(bottomTexts);

    // Remove matched header/footer lines
    for (const pg of allPageLines) {
      const topThreshold = pg.pageHeight * 0.88;
      const bottomThreshold = pg.pageHeight * 0.12;
      pg.lines = pg.lines.filter(l => {
        if (l.y > topThreshold && headerCandidates.some(h => _normalizeForCompare(l.text).includes(h))) return false;
        if (l.y < bottomThreshold && footerCandidates.some(f => _normalizeForCompare(l.text).includes(f))) return false;
        return true;
      });
    }
  }

  // ── Pass 3: Determine body font size (most common font size) ──
  const fontSizeCounts = {};
  let totalChars = 0;
  for (const pg of allPageLines) {
    for (const line of pg.lines) {
      const fs = Math.round(line.fontSize);
      const charCount = line.text.length;
      fontSizeCounts[fs] = (fontSizeCounts[fs] || 0) + charCount;
      totalChars += charCount;
    }
  }
  const bodyFontSize = Object.entries(fontSizeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  const bodyFS = parseInt(bodyFontSize);

  // ── Pass 4: Assemble text with proper line/paragraph breaks ──
  let resultLines = [];
  for (const pg of allPageLines) {
    let prevY = null;
    for (const line of pg.lines) {
      const fs = Math.round(line.fontSize);
      const text = line.text;

      // Skip likely page numbers
      if (/^\s*[-–—]?\s*\d{1,4}\s*[-–—]?\s*$/.test(text)) continue;
      // Skip very short non-Japanese lines (likely labels/metadata)
      if (text.length <= 3 && !/[\u3040-\u9FFF]/.test(text)) continue;

      if (prevY !== null) {
        const gap = prevY - line.y; // How far down (positive = down the page)
        const lineHeight = bodyFS * 1.5;

        if (gap > lineHeight * 1.8) {
          // Large gap → paragraph break
          resultLines.push('');
        }
      }

      // If font size is significantly larger than body, it's likely a heading
      if (fs > bodyFS * 1.3 && text.length < 100) {
        resultLines.push('');
        resultLines.push(text);
        resultLines.push('');
      } else {
        resultLines.push(text);
      }
      prevY = line.y;
    }
    // Page boundary
    if (pg.lines.length > 0) {
      resultLines.push('');
    }
  }

  // ── Pass 5: Join continuation lines (lines that are part of the same paragraph) ──
  const finalLines = [];
  for (let i = 0; i < resultLines.length; i++) {
    const line = resultLines[i];
    if (line === '') {
      // Don't duplicate empty lines
      if (finalLines.length === 0 || finalLines[finalLines.length - 1] !== '') {
        finalLines.push('');
      }
      continue;
    }

    // Check if this line should be joined with the previous one
    if (finalLines.length > 0 && finalLines[finalLines.length - 1] !== '') {
      const prev = finalLines[finalLines.length - 1];
      // Join if: previous line doesn't end with sentence-ending punctuation,
      // and current line doesn't start with a heading/special marker
      const prevEndsOpen = !/[。！？!?\n」』）\)\.…]$/.test(prev.trim());
      const currStartsContinuation = /^[\u3040-\u9FFF\uFF00-\uFFEFa-zA-Z（\(「『]/.test(line.trim());
      const prevIsShort = prev.trim().length < 60;

      if (prevEndsOpen && currStartsContinuation && !prevIsShort) {
        // Join with previous line (no separator needed for Japanese)
        finalLines[finalLines.length - 1] = prev + line;
        continue;
      }
    }
    finalLines.push(line);
  }

  let text = finalLines.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

// Helper: Normalize text for comparison (remove numbers that vary per page)
function _normalizeForCompare(text) {
  return text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Helper: Find text patterns that appear in >50% of pages
function findRepeatingPatterns(textsPerPage) {
  const total = textsPerPage.length;
  if (total < 3) return [];

  const normalized = textsPerPage.map(_normalizeForCompare).filter(t => t.length > 0);
  const counts = {};
  for (const t of normalized) {
    counts[t] = (counts[t] || 0) + 1;
  }

  return Object.entries(counts)
    .filter(([, count]) => count >= total * 0.5)
    .map(([text]) => text);
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// ============================================================
// Preview View
// ============================================================
function showPreview(title, content, sourceType) {
  state.previewTitle = title;
  state.previewContent = content;
  state.previewSourceType = sourceType;
  render();
}

function renderPreview() {
  const lineCount = state.previewContent.split('\n').length;
  const charCount = state.previewContent.length;
  return `
  <div class="max-w-2xl mx-auto px-4 py-8 min-h-screen fade-in">
    <header class="flex items-center justify-between mb-6">
      <button id="preview-cancel" class="text-ink-400 hover:text-ink-700 text-sm transition">\u2190 戻る</button>
      <h2 class="text-sm font-medium">テキスト確認</h2>
      <div></div>
    </header>

    <p class="text-xs text-ink-400 mb-4">余計な文字列は自動で除去されています。必要に応じて編集してください。</p>

    <div class="mb-4">
      <input type="text" id="preview-title" value="${escAttr(state.previewTitle)}"
        class="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 bg-white font-medium" />
    </div>

    <div class="mb-3">
      <textarea id="preview-content" rows="18"
        class="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:border-ink-900 bg-white font-mono leading-relaxed resize-y">${escHtml(state.previewContent)}</textarea>
    </div>

    <div class="flex items-center justify-between mb-6">
      <span class="text-xs text-ink-400">${charCount.toLocaleString()}文字 / ${lineCount}行</span>
      <div class="flex gap-2">
        <button id="preview-cancel-btn" class="px-4 py-2 text-sm border border-ink-200 rounded-lg hover:bg-ink-50 transition">キャンセル</button>
        <button id="preview-save" class="px-4 py-2 text-sm bg-ink-900 text-white rounded-lg hover:bg-ink-800 transition">読み始める</button>
      </div>
    </div>
  </div>`;
}

function bindPreview() {
  const cancelBtn = document.getElementById('preview-cancel');
  const cancelBtn2 = document.getElementById('preview-cancel-btn');
  const saveBtn = document.getElementById('preview-save');

  if (!cancelBtn) return;

  const doCancel = () => {
    state.previewTitle = '';
    state.previewContent = '';
    state.previewSourceType = '';
    render();
  };

  cancelBtn.onclick = doCancel;
  cancelBtn2.onclick = doCancel;

  saveBtn.onclick = async () => {
    const title = document.getElementById('preview-title').value.trim() || '無題';
    const content = document.getElementById('preview-content').value.trim();
    if (!content) { alert('テキストが空です'); return; }

    // Show loading state
    saveBtn.disabled = true;
    saveBtn.textContent = '解析中...';

    state.previewTitle = '';
    state.previewContent = '';
    await saveAndOpen(title, content, state.previewSourceType);
    state.previewSourceType = '';
  };
}

async function saveAndOpen(title, content, sourceType) {
  content = content.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  // Send to server - server will analyze text with kuromoji and store segments
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
  // Show loading
  state.view = 'typing';
  state.segments = [];
  render();

  const textEl = document.getElementById('text-display');
  const romaEl = document.getElementById('romaji-display');
  if (textEl) textEl.innerHTML = '<span class="text-ink-400">テキストを準備中...</span>';
  if (romaEl) romaEl.innerHTML = '';

  const data = await api('/documents/' + docId);
  if (data.error) { alert(data.error); state.view = 'dashboard'; render(); return; }

  state.currentDoc = data.document;
  state.currentProgress = data.progress;
  state.currentBookmarks = data.bookmarks || [];

  // Use pre-analyzed segments from server
  if (data.segments && data.segments.length > 0) {
    state.segments = data.segments;
  } else {
    // No segments yet - try re-analyzing
    if (textEl) textEl.innerHTML = '<span class="text-ink-400">テキストを解析中...</span>';
    const analyzeResult = await api('/documents/' + docId + '/analyze', { method: 'POST' });
    if (analyzeResult.ok) {
      // Refetch with segments
      const refetch = await api('/documents/' + docId);
      state.segments = refetch.segments || [];
    }
    if (!state.segments || state.segments.length === 0) {
      alert('テキストの解析に失敗しました。しばらくしてから再度お試しください。');
      state.view = 'dashboard';
      await loadDocuments();
      render();
      return;
    }
  }

  state.segmentIndex = data.progress?.current_position || 0;
  // Make sure segmentIndex doesn't exceed segments length
  if (state.segmentIndex >= state.segments.length) {
    state.segmentIndex = 0;
  }
  // Skip any leading newline segments at current position
  while (state.segmentIndex < state.segments.length) {
    const seg = state.segments[state.segmentIndex];
    if (seg.readings.length === 1 && seg.readings[0] === '\n') {
      state.segmentIndex++;
    } else {
      break;
    }
  }
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

  return `
  <div class="max-w-3xl mx-auto px-4 py-6 min-h-screen flex flex-col typing-active" id="typing-container">
    <header class="flex items-center justify-between mb-6 flex-shrink-0">
      <button id="back-btn" class="text-ink-400 hover:text-ink-700 text-sm transition">\u2190 戻る</button>
      <h2 class="text-sm font-medium truncate max-w-[40%]">${escHtml(doc?.title || '')}</h2>
      <div class="flex items-center gap-2">
        <button class="font-size-btn" id="font-decrease" title="文字を小さく">A-</button>
        <button class="font-size-btn" id="font-increase" title="文字を大きく">A+</button>
        <button id="bookmark-btn" class="text-ink-400 hover:text-ink-700 text-sm transition" title="ブックマーク">\uD83D\uDD16</button>
      </div>
    </header>

    <div class="flex-1 flex flex-col justify-center mb-6">
      <div id="text-display" class="text-2xl leading-loose mb-6 min-h-[200px]"></div>
      <div id="romaji-display" class="mono text-3xl tracking-wider text-center py-6 border-t border-ink-100"></div>
    </div>

    <footer class="flex-shrink-0 border-t border-ink-100 pt-4 pb-2">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
          <div id="progress-bar" class="h-full bg-ink-900 rounded-full progress-fill" style="width:${pct}%"></div>
        </div>
        <span id="progress-pct" class="text-xs text-ink-400 w-10 text-right">${pct}%</span>
      </div>
      <div class="flex items-center justify-between text-xs text-ink-400">
        <span id="stat-wpm">WPM: 0</span>
        <span id="stat-acc">正確率: 100%</span>
        <span id="stat-time">経過: 0:00</span>
        <span id="stat-pos">${state.segmentIndex} / ${totalSegs}</span>
      </div>
    </footer>
  </div>`;
}

let _keydownHandler = null;

function bindTyping() {
  if (state.segments.length === 0) return;

  updateTypingDisplay();

  document.getElementById('back-btn').onclick = async () => {
    await saveProgress();
    clearInterval(state.timerInterval);
    clearInterval(state.autoSaveInterval);
    if (_keydownHandler) {
      document.removeEventListener('keydown', _keydownHandler);
      _keydownHandler = null;
    }
    state.view = 'dashboard';
    await loadDocuments();
    render();
  };

  document.getElementById('bookmark-btn').onclick = async () => {
    const pos = state.segmentIndex;
    const note = prompt('メモ（任意）:') || '';
    await api('/documents/' + state.currentDoc.id + '/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ position: pos, note }),
    });
    alert('ブックマークしました');
  };

  document.getElementById('font-decrease').onclick = () => {
    const idx = Math.max(0, getCurrentFontSizeIndex() - 1);
    applyFontSize(idx);
  };

  document.getElementById('font-increase').onclick = () => {
    const idx = Math.min(FONT_SIZES.length - 1, getCurrentFontSizeIndex() + 1);
    applyFontSize(idx);
  };

  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
  }
  _keydownHandler = handleKeyDown;
  document.addEventListener('keydown', _keydownHandler);

  state.startTime = Date.now();
  state.timerInterval = setInterval(() => {
    const extra = Math.floor((Date.now() - state.startTime) / 1000);
    const total = state.elapsedSec + extra;
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const el = document.getElementById('stat-time');
    if (el) el.textContent = '\u7D4C\u904E: ' + mins + ':' + String(secs).padStart(2, '0');
  }, 1000);

  state.autoSaveInterval = setInterval(() => saveProgress(), 30000);
}

function handleKeyDown(e) {
  if (state.view !== 'typing') {
    document.removeEventListener('keydown', handleKeyDown);
    _keydownHandler = null;
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return;

  e.preventDefault();

  if (state.segmentIndex >= state.segments.length) return;

  const seg = state.segments[state.segmentIndex];
  const typed = e.key === 'Enter' ? '\n' : e.key;

  if (state.activeReading === null) {
    state.charIndex = 0;
    const matching = seg.readings.filter(r => r[0] === typed);
    if (matching.length > 0) {
      state.activeReading = matching[0];
      state.charIndex = 1;
      state.correctCount++;
      state.totalTyped++;
      state.lastMiss = false;

      if (state.activeReading.length === 1) {
        advanceSegment();
      }
    } else {
      state.missCount++;
      state.totalTyped++;
      state.lastMiss = true;
    }
  } else {
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
      // Check for alternative reading switch
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

  // Auto-skip newline segments (no need to press Enter)
  while (state.segmentIndex < state.segments.length) {
    const next = state.segments[state.segmentIndex];
    if (next.readings.length === 1 && next.readings[0] === '\n') {
      state.segmentIndex++;
    } else {
      break;
    }
  }

  if (state.segmentIndex >= state.segments.length) {
    clearInterval(state.timerInterval);
    clearInterval(state.autoSaveInterval);
    saveProgress(true);
    showResults();
  }
}

function showResults() {
  const elapsed = state.elapsedSec + (state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : 0);
  const total = state.correctCount + state.missCount;
  const acc = total > 0 ? Math.round(state.correctCount / total * 1000) / 10 : 100;
  const wpm = elapsed > 0 ? Math.round(state.correctCount / (elapsed / 60)) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }

  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="max-w-lg mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center fade-in">
    <div class="text-center mb-10">
      <p class="text-4xl mb-4">\uD83C\uDF89</p>
      <h2 class="text-xl font-semibold mb-2">読了おめでとうございます！</h2>
      <p class="text-ink-400 text-sm">${escHtml(state.currentDoc.title)}</p>
    </div>

    <div class="w-full bg-white border border-ink-100 rounded-xl p-6 mb-8">
      <div class="grid grid-cols-2 gap-6">
        <div class="text-center">
          <p class="text-3xl font-semibold">${wpm}</p>
          <p class="text-xs text-ink-400 mt-1">WPM</p>
        </div>
        <div class="text-center">
          <p class="text-3xl font-semibold">${acc}%</p>
          <p class="text-xs text-ink-400 mt-1">正確率</p>
        </div>
        <div class="text-center">
          <p class="text-3xl font-semibold">${timeStr}</p>
          <p class="text-xs text-ink-400 mt-1">読書時間</p>
        </div>
        <div class="text-center">
          <p class="text-3xl font-semibold">${state.segments.length}</p>
          <p class="text-xs text-ink-400 mt-1">セグメント</p>
        </div>
      </div>
      <div class="mt-6 pt-4 border-t border-ink-100 flex justify-between text-xs text-ink-400">
        <span>正打: ${state.correctCount}</span>
        <span>誤打: ${state.missCount}</span>
        <span>合計: ${state.totalTyped}</span>
      </div>
    </div>

    <div class="flex gap-3">
      <button id="quiz-start" class="px-6 py-2.5 bg-ink-900 text-white text-sm font-medium rounded-lg hover:bg-ink-800 transition">
        📝 理解度チェック
      </button>
      <button id="result-back" class="px-6 py-2.5 border border-ink-200 text-sm font-medium rounded-lg hover:bg-ink-50 transition">
        ダッシュボードに戻る
      </button>
    </div>
  </div>`;

  document.getElementById('result-back').onclick = async () => {
    state.view = 'dashboard';
    await loadDocuments();
    render();
  };

  document.getElementById('quiz-start').onclick = () => {
    startQuiz();
  };
}

// ============================================================
// Comprehension Quiz (理解度チェック)
// ============================================================
function extractKeywords(text) {
  // Extract meaningful keywords (kanji words 2+ chars, katakana words 3+ chars)
  const kanjiWords = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]{2,6}/g) || [];
  const katakanaWords = text.match(/[\u30A0-\u30FF]{3,10}/g) || [];
  // Deduplicate and filter out very common words
  const commonWords = new Set(['これ', 'それ', 'あれ', 'ここ', 'そこ', 'あそこ', 'こと', 'もの', 'ため', 'よう', 'ところ']);
  const all = [...new Set([...kanjiWords, ...katakanaWords])]
    .filter(w => !commonWords.has(w) && w.length >= 2);
  return all;
}

function generateQuiz() {
  const content = state.currentDoc.content || '';
  const sentences = content.split(/[。！？\n]+/).filter(s => s.trim().length > 10);
  const allKeywords = extractKeywords(content);

  if (allKeywords.length < 4 || sentences.length < 3) {
    return null; // Not enough content for quiz
  }

  const questions = [];
  const usedKeywords = new Set();
  const usedSentences = new Set();
  const maxQuestions = Math.min(5, Math.floor(allKeywords.length / 2));

  // Shuffle sentences
  const shuffledSentences = [...sentences].sort(() => Math.random() - 0.5);

  for (const sentence of shuffledSentences) {
    if (questions.length >= maxQuestions) break;

    // Find keywords in this sentence
    const sentenceKeywords = allKeywords.filter(kw =>
      sentence.includes(kw) && !usedKeywords.has(kw)
    );

    if (sentenceKeywords.length === 0) continue;

    // Pick a random keyword from this sentence
    const keyword = sentenceKeywords[Math.floor(Math.random() * sentenceKeywords.length)];
    if (usedSentences.has(sentence)) continue;

    // Generate wrong answers from other keywords
    const wrongOptions = allKeywords
      .filter(kw => kw !== keyword && !usedKeywords.has(kw) && kw.length >= keyword.length - 2 && kw.length <= keyword.length + 2)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    if (wrongOptions.length < 3) {
      // Pad with more random keywords if needed
      const extras = allKeywords.filter(kw => kw !== keyword && !wrongOptions.includes(kw)).sort(() => Math.random() - 0.5);
      while (wrongOptions.length < 3 && extras.length > 0) {
        wrongOptions.push(extras.pop());
      }
    }
    if (wrongOptions.length < 3) continue;

    // Create masked sentence (show context around keyword)
    const idx = sentence.indexOf(keyword);
    const contextStart = Math.max(0, idx - 30);
    const contextEnd = Math.min(sentence.length, idx + keyword.length + 30);
    let context = sentence.substring(contextStart, contextEnd);
    if (contextStart > 0) context = '...' + context;
    if (contextEnd < sentence.length) context = context + '...';
    const maskedContext = context.replace(keyword, '●'.repeat(keyword.length));

    const options = [keyword, ...wrongOptions].sort(() => Math.random() - 0.5);

    questions.push({
      context: maskedContext,
      answer: keyword,
      options,
    });

    usedKeywords.add(keyword);
    usedSentences.add(sentence);
  }

  return questions.length > 0 ? questions : null;
}

function startQuiz() {
  const questions = generateQuiz();
  if (!questions) {
    alert('この文書はクイズを生成するのに十分なテキストがありません。');
    return;
  }

  let currentQ = 0;
  let correctAnswers = 0;
  const userAnswers = [];

  function renderQuestion() {
    const q = questions[currentQ];
    const app = document.getElementById('app');
    app.innerHTML = `
    <div class="max-w-lg mx-auto px-4 py-12 min-h-screen flex flex-col fade-in">
      <header class="flex items-center justify-between mb-8">
        <h2 class="text-sm font-medium">📝 理解度チェック</h2>
        <span class="text-xs text-ink-400">${currentQ + 1} / ${questions.length}</span>
      </header>

      <div class="flex-1 flex flex-col justify-center">
        <div class="bg-ink-50 rounded-xl p-6 mb-8">
          <p class="text-sm leading-relaxed text-ink-700">${escHtml(q.context)}</p>
        </div>

        <p class="text-xs text-ink-400 mb-4">●に入る言葉を選んでください：</p>

        <div class="space-y-3" id="quiz-options">
          ${q.options.map((opt, i) => `
            <button class="quiz-option w-full text-left px-4 py-3 text-sm border border-ink-200 rounded-lg hover:bg-ink-50 hover:border-ink-400 transition" data-option="${i}">
              ${escHtml(opt)}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="flex-shrink-0 mt-6">
        <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden">
          <div class="h-full bg-ink-900 rounded-full progress-fill" style="width:${Math.round((currentQ) / questions.length * 100)}%"></div>
        </div>
      </div>
    </div>`;

    document.getElementById('quiz-options').onclick = (e) => {
      const btn = e.target.closest('.quiz-option');
      if (!btn) return;
      const selected = q.options[parseInt(btn.dataset.option)];
      const isCorrect = selected === q.answer;
      if (isCorrect) correctAnswers++;
      userAnswers.push({ question: q, selected, isCorrect });

      // Show feedback
      const allBtns = document.querySelectorAll('.quiz-option');
      allBtns.forEach(b => {
        b.disabled = true;
        b.classList.remove('hover:bg-ink-50', 'hover:border-ink-400');
        const optText = q.options[parseInt(b.dataset.option)];
        if (optText === q.answer) {
          b.classList.add('border-green-500', 'bg-green-50', 'text-green-700');
        } else if (optText === selected && !isCorrect) {
          b.classList.add('border-red-500', 'bg-red-50', 'text-red-700');
        }
      });

      setTimeout(() => {
        currentQ++;
        if (currentQ < questions.length) {
          renderQuestion();
        } else {
          showQuizResults(questions, correctAnswers, userAnswers);
        }
      }, 1000);
    };
  }

  renderQuestion();
}

function showQuizResults(questions, correctAnswers, userAnswers) {
  const pct = Math.round(correctAnswers / questions.length * 100);
  const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : pct >= 40 ? '📖' : '💪';
  const message = pct >= 80 ? '素晴らしい理解度です！' : pct >= 60 ? 'よく理解できています！' : pct >= 40 ? 'もう一度読み返してみましょう' : '繰り返し読むことで理解が深まります';

  const detailsHtml = userAnswers.map((a, i) => `
    <div class="py-3 ${i > 0 ? 'border-t border-ink-100' : ''}">
      <p class="text-xs text-ink-400 mb-1">問題 ${i + 1}</p>
      <p class="text-sm text-ink-600 mb-2">${escHtml(a.question.context)}</p>
      <div class="flex items-center gap-2 text-sm">
        <span class="${a.isCorrect ? 'text-green-600' : 'text-red-500'}">${a.isCorrect ? '✓' : '✗'}</span>
        ${a.isCorrect
          ? `<span class="text-green-600">${escHtml(a.selected)}</span>`
          : `<span class="text-red-500 line-through">${escHtml(a.selected)}</span> → <span class="text-green-600">${escHtml(a.question.answer)}</span>`
        }
      </div>
    </div>
  `).join('');

  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="max-w-lg mx-auto px-4 py-12 min-h-screen flex flex-col items-center justify-center fade-in">
    <div class="text-center mb-8">
      <p class="text-4xl mb-4">${emoji}</p>
      <h2 class="text-xl font-semibold mb-2">理解度チェック結果</h2>
      <p class="text-ink-400 text-sm">${message}</p>
    </div>

    <div class="w-full bg-white border border-ink-100 rounded-xl p-6 mb-6">
      <div class="flex items-center justify-center gap-8 mb-4">
        <div class="text-center">
          <p class="text-3xl font-semibold">${correctAnswers}/${questions.length}</p>
          <p class="text-xs text-ink-400 mt-1">正解数</p>
        </div>
        <div class="text-center">
          <p class="text-3xl font-semibold">${pct}%</p>
          <p class="text-xs text-ink-400 mt-1">正答率</p>
        </div>
      </div>
    </div>

    <details class="w-full mb-6">
      <summary class="text-xs text-ink-400 cursor-pointer hover:text-ink-600 transition">回答の詳細を見る</summary>
      <div class="mt-3 bg-white border border-ink-100 rounded-xl p-4">
        ${detailsHtml}
      </div>
    </details>

    <button id="quiz-back" class="px-6 py-2.5 bg-ink-900 text-white text-sm font-medium rounded-lg hover:bg-ink-800 transition">
      ダッシュボードに戻る
    </button>
  </div>`;

  document.getElementById('quiz-back').onclick = async () => {
    state.view = 'dashboard';
    await loadDocuments();
    render();
  };
}

function updateTypingDisplay() {
  const textEl = document.getElementById('text-display');
  const romaEl = document.getElementById('romaji-display');
  if (!textEl || !romaEl) return;

  const segs = state.segments;
  const idx = state.segmentIndex;

  const CONTEXT_BEFORE = 40;
  const CONTEXT_AFTER = 80;
  const start = Math.max(0, idx - CONTEXT_BEFORE);
  const end = Math.min(segs.length, idx + CONTEXT_AFTER);

  let html = '';
  for (let i = start; i < end; i++) {
    const s = segs[i];
    const display = escHtml(s.display === '\n' ? '\u21B5 ' : s.display);
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
      const ch = reading[i] === '\n' ? '\u23CE' : reading[i];
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
  const acc = total > 0 ? Math.round(state.correctCount / total * 1000) / 10 : 100;
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

function escAttr(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================
// Reading Statistics View
// ============================================================
async function showStats() {
  const app = document.getElementById('app');
  app.innerHTML = `
  <div class="max-w-2xl mx-auto px-4 py-8 min-h-screen fade-in">
    <header class="flex items-center justify-between mb-8">
      <button id="stats-back" class="text-ink-400 hover:text-ink-700 text-sm transition">\u2190 戻る</button>
      <h2 class="text-sm font-medium">📊 読書統計</h2>
      <div></div>
    </header>
    <div id="stats-content" class="text-center py-8">
      <p class="text-ink-400 text-sm">統計を読み込み中...</p>
    </div>
  </div>`;

  document.getElementById('stats-back').onclick = () => {
    state.view = 'dashboard';
    render();
  };

  try {
    const [summaryData, dailyData, weeklyData] = await Promise.all([
      api('/stats/summary'),
      api('/stats/daily?days=30'),
      api('/stats/weekly?weeks=12'),
    ]);

    renderStatsContent(summaryData.summary, dailyData.stats, weeklyData.stats);
  } catch (err) {
    document.getElementById('stats-content').innerHTML = '<p class="text-red-500 text-sm">統計の読み込みに失敗しました</p>';
  }
}

function renderStatsContent(summary, dailyStats, weeklyStats) {
  const el = document.getElementById('stats-content');
  if (!el) return;

  const totalAcc = (summary.total_correct + summary.total_miss) > 0
    ? Math.round(summary.total_correct / (summary.total_correct + summary.total_miss) * 100) : 0;
  const totalTimeMin = Math.floor(summary.total_time_sec / 60);
  const totalTimeStr = totalTimeMin >= 60
    ? Math.floor(totalTimeMin / 60) + '時間' + (totalTimeMin % 60) + '分'
    : totalTimeMin + '分';

  el.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <div class="bg-white border border-ink-100 rounded-xl p-4 text-center">
        <p class="text-2xl font-semibold">${summary.streak || 0}</p>
        <p class="text-xs text-ink-400 mt-1">🔥 連続日数</p>
      </div>
      <div class="bg-white border border-ink-100 rounded-xl p-4 text-center">
        <p class="text-2xl font-semibold">${(summary.total_chars || 0).toLocaleString()}</p>
        <p class="text-xs text-ink-400 mt-1">合計タイプ数</p>
      </div>
      <div class="bg-white border border-ink-100 rounded-xl p-4 text-center">
        <p class="text-2xl font-semibold">${totalAcc}%</p>
        <p class="text-xs text-ink-400 mt-1">平均正確率</p>
      </div>
      <div class="bg-white border border-ink-100 rounded-xl p-4 text-center">
        <p class="text-2xl font-semibold">${totalTimeStr}</p>
        <p class="text-xs text-ink-400 mt-1">合計読書時間</p>
      </div>
    </div>

    <div class="mb-4 flex items-center gap-2">
      <button id="tab-daily" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink-900 text-white transition">日別</button>
      <button id="tab-weekly" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-200 text-ink-400 hover:bg-ink-50 transition">週別</button>
    </div>

    <div class="bg-white border border-ink-100 rounded-xl p-4 mb-4">
      <div id="chart-container"></div>
    </div>

    <p class="text-xs text-ink-400 text-center">${summary.active_days || 0}日間のアクティブ日 / ${summary.total_sessions || 0}回のセッション</p>
  `;

  let currentTab = 'daily';

  function renderChart() {
    const data = currentTab === 'daily' ? dailyStats : weeklyStats;
    const container = document.getElementById('chart-container');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-ink-400 text-sm text-center py-8">まだ統計データがありません</p>';
      return;
    }

    const chartData = data.map(d => ({
      label: currentTab === 'daily' 
        ? (d.date || '').substring(5).replace('-', '/')  // MM/DD
        : (d.week_start || d.week || '').substring(5).replace('-', '/'),
      value: d.chars_typed || 0,
      time: d.reading_time_sec || 0,
    }));

    container.innerHTML = renderSvgBarChart(chartData, currentTab === 'daily' ? 'タイプ数' : 'タイプ数（週計）');
  }

  document.getElementById('tab-daily').onclick = () => {
    currentTab = 'daily';
    document.getElementById('tab-daily').className = 'px-3 py-1.5 text-xs font-medium rounded-lg bg-ink-900 text-white transition';
    document.getElementById('tab-weekly').className = 'px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-200 text-ink-400 hover:bg-ink-50 transition';
    renderChart();
  };

  document.getElementById('tab-weekly').onclick = () => {
    currentTab = 'weekly';
    document.getElementById('tab-weekly').className = 'px-3 py-1.5 text-xs font-medium rounded-lg bg-ink-900 text-white transition';
    document.getElementById('tab-daily').className = 'px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-200 text-ink-400 hover:bg-ink-50 transition';
    renderChart();
  };

  renderChart();
}

function renderSvgBarChart(data, title) {
  if (data.length === 0) return '<p class="text-ink-400 text-sm text-center py-8">データなし</p>';

  const width = 560;
  const height = 220;
  const padding = { top: 30, right: 10, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(4, Math.min(20, (chartW / data.length) - 4));
  const gap = (chartW - barWidth * data.length) / Math.max(1, data.length);

  // Y-axis grid lines
  const gridCount = 4;
  let gridLines = '';
  let yLabels = '';
  for (let i = 0; i <= gridCount; i++) {
    const y = padding.top + chartH - (chartH * i / gridCount);
    const val = Math.round(maxVal * i / gridCount);
    gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border-light)" stroke-width="1"/>`;
    yLabels += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${val >= 1000 ? Math.round(val / 1000) + 'k' : val}</text>`;
  }

  // Bars
  let bars = '';
  let xLabels = '';
  const showEveryN = data.length > 14 ? Math.ceil(data.length / 7) : 1;

  data.forEach((d, i) => {
    const x = padding.left + i * (barWidth + gap) + gap / 2;
    const barH = maxVal > 0 ? (d.value / maxVal) * chartH : 0;
    const y = padding.top + chartH - barH;
    const timeMin = Math.floor(d.time / 60);

    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="2" fill="var(--accent)" opacity="0.8">
      <title>${d.label}: ${d.value.toLocaleString()}字 (${timeMin}分)</title>
    </rect>`;

    if (i % showEveryN === 0 || i === data.length - 1) {
      xLabels += `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 16}" text-anchor="middle" fill="var(--text-muted)" font-size="9">${d.label}</text>`;
    }
  });

  // Title
  const titleText = `<text x="${padding.left}" y="${padding.top - 10}" fill="var(--text-secondary)" font-size="12" font-weight="500">${title}</text>`;

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;height:auto;">
    ${gridLines}
    ${yLabels}
    ${bars}
    ${xLabels}
    ${titleText}
  </svg>`;
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
