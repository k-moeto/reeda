import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import auth from './routes/auth';
import documents from './routes/documents';
import statsRoutes from './routes/stats';

const app = new Hono<Env>();

app.use('/api/*', cors());

// API routes
app.route('/api/auth', auth);
app.route('/api/documents', documents);
app.route('/api/stats', statsRoutes);

// Serve the SPA for all non-API, non-static routes
app.get('*', (c) => {
  return c.html(HTML_SHELL);
});

const HTML_SHELL = `<!DOCTYPE html>
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
    :root {
      --bg-primary: #fafafa;
      --bg-secondary: #ffffff;
      --bg-hover: #f8f8f8;
      --text-primary: #171717;
      --text-secondary: #737373;
      --text-muted: #a8a8a8;
      --text-light: #d1d1d1;
      --border-color: #e4e4e4;
      --border-light: #f0f0f0;
      --accent: #171717;
      --accent-hover: #262626;
      --font-size-base: 14px;
      --font-size-typing: 24px;
      --font-size-romaji: 30px;
    }
    [data-theme="dark"] {
      --bg-primary: #0a0a0a;
      --bg-secondary: #171717;
      --bg-hover: #1e1e1e;
      --text-primary: #f0f0f0;
      --text-secondary: #a8a8a8;
      --text-muted: #737373;
      --text-light: #404040;
      --border-color: #2a2a2a;
      --border-light: #1e1e1e;
      --accent: #f0f0f0;
      --accent-hover: #d1d1d1;
    }
    * { box-sizing: border-box; }
    body { font-family: 'Inter', 'Noto Sans JP', sans-serif; background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-base); transition: background 0.3s ease, color 0.3s ease; }
    .mono { font-family: 'JetBrains Mono', 'Noto Sans JP', monospace; }
    .char-correct { color: var(--text-primary); }
    .char-current { background: var(--accent); color: var(--bg-primary); padding: 0 1px; border-radius: 2px; }
    .char-upcoming { color: var(--text-muted); }
    .char-miss { color: #ef4444; text-decoration: underline; }
    .roma-correct { color: var(--text-primary); }
    .roma-current { color: var(--text-primary); font-weight: 600; }
    .roma-upcoming { color: var(--text-light); }
    .drop-zone { border: 2px dashed var(--text-light); transition: all 0.2s ease; }
    .drop-zone.active { border-color: var(--accent); background: var(--bg-hover); }
    .fade-in { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .progress-fill { transition: width 0.3s ease; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--text-light); border-radius: 2px; }
    .typing-active *:focus { outline: none; }
    #text-display { font-size: var(--font-size-typing); }
    #romaji-display { font-size: var(--font-size-romaji); }
    /* Dark mode overrides for Tailwind utility classes */
    [data-theme="dark"] .bg-white { background: var(--bg-secondary) !important; }
    [data-theme="dark"] .bg-ink-50 { background: var(--bg-hover) !important; }
    [data-theme="dark"] .bg-ink-900 { background: var(--accent) !important; color: var(--bg-primary) !important; }
    [data-theme="dark"] .hover\\:bg-ink-800:hover { background: var(--accent-hover) !important; }
    [data-theme="dark"] .hover\\:bg-ink-50:hover { background: var(--bg-hover) !important; }
    [data-theme="dark"] .text-ink-900 { color: var(--text-primary) !important; }
    [data-theme="dark"] .text-ink-700 { color: var(--text-primary) !important; }
    [data-theme="dark"] .text-ink-600 { color: var(--text-secondary) !important; }
    [data-theme="dark"] .text-ink-400 { color: var(--text-muted) !important; }
    [data-theme="dark"] .text-ink-300 { color: var(--text-light) !important; }
    [data-theme="dark"] .border-ink-200 { border-color: var(--border-color) !important; }
    [data-theme="dark"] .border-ink-100 { border-color: var(--border-light) !important; }
    [data-theme="dark"] .bg-ink-100 { background: var(--border-color) !important; }
    [data-theme="dark"] input, [data-theme="dark"] textarea { background: var(--bg-secondary) !important; color: var(--text-primary) !important; border-color: var(--border-color) !important; }
    [data-theme="dark"] .bg-ink-900.text-white { color: var(--bg-primary) !important; }
    .theme-toggle { cursor: pointer; font-size: 18px; background: none; border: none; padding: 4px; transition: transform 0.2s ease; }
    .theme-toggle:hover { transform: scale(1.2); }
    .font-size-btn { cursor: pointer; background: none; border: 1px solid var(--border-color); padding: 2px 8px; border-radius: 6px; font-size: 12px; color: var(--text-secondary); transition: all 0.2s ease; }
    .font-size-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  </style>
</head>
<body class="min-h-screen">
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js"></script>
  <script type="module" src="/static/app.js"></script>
</body>
</html>`;

export default app;
