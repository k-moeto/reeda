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
    * { box-sizing: border-box; }
    body { font-family: 'Inter', 'Noto Sans JP', sans-serif; background: #fafafa; color: #171717; }
    .mono { font-family: 'JetBrains Mono', 'Noto Sans JP', monospace; }
    .char-correct { color: #171717; }
    .char-current { background: #171717; color: #fafafa; padding: 0 1px; border-radius: 2px; }
    .char-upcoming { color: #a8a8a8; }
    .char-miss { color: #ef4444; text-decoration: underline; }
    .roma-correct { color: #171717; }
    .roma-current { color: #171717; font-weight: 600; }
    .roma-upcoming { color: #d1d1d1; }
    .drop-zone { border: 2px dashed #d1d1d1; transition: all 0.2s ease; }
    .drop-zone.active { border-color: #171717; background: #f0f0f0; }
    .fade-in { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .progress-fill { transition: width 0.3s ease; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 2px; }
    .typing-active *:focus { outline: none; }
  </style>
</head>
<body class="min-h-screen">
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js"></script>
  <script type="module" src="/static/app.js"></script>
</body>
</html>`;

export default app;
