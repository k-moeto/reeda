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
  // URLs alone
  /^\s*https?:\/\/[^\s]+\s*$/gm,
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
];

const EDGE_NOISE_PATTERNS = [
  /^.{1,4}$/,
  /^[A-Z\s]{2,30}$/,
  /^[\u30A0-\u30FF\s]{2,10}$/,
];

function cleanText(raw) {
  let text = raw;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[^\S\n]+/g, ' ');

  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  let lines = text.split('\n');

  while (lines.length > 0) {
    const line = lines[0].trim();
    if (line === '') { lines.shift(); continue; }
    const isNoise = EDGE_NOISE_PATTERNS.some(p => p.test(line));
    const isNavLike = line.length < 50 && !line.match(/[。、.!?！？]/) && (line.split(/[\s|/・│｜]/).filter(w => w.trim()).length >= 3);
    if (isNoise || isNavLike) { lines.shift(); } else { break; }
  }

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
        const pct = d.total_chars > 0 ? Math.round((d.current_position || 0) / d.total_chars * 100) : 0;
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
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join('') + '\n';
  }
  return text;
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
      <h2 class="text-sm font-medium truncate max-w-[50%]">${escHtml(doc?.title || '')}</h2>
      <button id="bookmark-btn" class="text-ink-400 hover:text-ink-700 text-sm transition" title="ブックマーク">\uD83D\uDD16</button>
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

  if (state.segmentIndex >= state.segments.length) {
    clearInterval(state.timerInterval);
    clearInterval(state.autoSaveInterval);
    saveProgress(true);
    setTimeout(() => {
      alert('読了おめでとうございます！');
    }, 100);
  }
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
