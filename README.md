# reeda（リー打）

タイピングで、読む。

## 概要

reeda は、タイピングを通じて文章を深く理解しながら読むサービスです。PDF、Word、テキストファイルをドラッグ＆ドロップするだけで、タイピングゲームのようなUIが立ち上がり、一文字ずつ確実に文章を読み進めることができます。

kuromoji.js による形態素解析で漢字の読みを正確に取得し、複数のローマ字入力パターンに対応したタイピング体験を提供します。

## 機能

### ファイルインポート
- **.txt / .pdf / .docx** をドラッグ＆ドロップ、またはクリックで選択して読み込み
- **テキスト直接入力** — コピペで文章を追加
- **URL入力インポート** — URLを入力して記事を直接インポート（HTML→テキスト自動抽出）
- **PDF 解析** — PDF.js によるクライアントサイド抽出（座標ベースレイアウト解析・ヘッダー/フッター自動除去・段落復元）
- **Word 解析** — Mammoth.js によるクライアントサイド抽出

### テキストクリーニング
ファイル取り込み時、クライアントサイドで自動的にノイズを除去します。
- ナビゲーション・パンくずリスト・ページ番号の除去
- 著作権表示・広告ラベル・SNS共有ボタンの除去
- URL・メールアドレスの除去
- 写真クレジット・著者メタデータの除去
- ※注釈・装飾セパレーターの除去
- ヘッダー/フッターのメタデータを自動検出してスキップ

### テキスト確認・編集（プレビュー画面）
取り込み後、タイピング開始前にテキストを確認・編集できます。
- クリーニング済みテキストのプレビュー表示
- タイトル・本文の手動編集
- 文字数・行数のリアルタイム表示

### 形態素解析（kuromoji.js）
- **サーバーサイド形態素解析** — kuromoji.js を使用した正確な漢字→読み変換
- 専用マイクロサーバー（`analyzer-server.mjs`、ポート 3001）で辞書をロードし解析を実行
- ドキュメント作成時にサーバーサイドで事前解析し、セグメントデータとして DB に保存
- 再解析エンドポイントにより、解析失敗時のリトライが可能

### タイピング画面
- **原文表示** — 打ち終わった文字・現在の文字・未入力の文字を色分け表示
- **ローマ字ガイド** — 現在のセグメントのローマ字入力を大きく表示
- **複数ローマ字入力パターン対応** — si/shi/ci、tu/tsu、hu/fu、chi/ti、ja/zya/jya 等
- **代替入力への自動切替** — 入力途中で別の有効パターンに切り替え可能
- **ミスタイプ** — 赤色ハイライト、正しいキーを打つまで進めない
- **改行自動スキップ** — 改行セグメントは Enter 不要で自動的に進行
- **全角文字・記号の広範なマッピング** — 全角英数字、全角括弧、CJK記号、カーリー引用符等
- **促音（っ）対応** — 子音の重ね打ちで正しく処理
- **「ん」の判定** — 後続文字に応じて n / nn を自動判定
- **リアルタイム統計** — WPM・正確率・経過時間・進捗率をリアルタイム表示
- **フォントサイズ調整** — 5段階（A-/A+ ボタン、設定は localStorage に保存）

### 理解度チェックモード
読了後に内容理解を確認できます。
- テキスト中の漢字語・カタカナ語から穴埋め4択クイズを自動生成（最大5問）
- 回答フィードバック（正誤ハイライト）と正答率のサマリー表示

### 読了結果画面
タイピング完了時に成績サマリーを表示します。
- WPM（1分あたりの正打数）
- 正確率
- 読書時間
- セグメント数
- 正打数・誤打数・合計タイプ数

### アカウント機能
- メール + パスワード（8文字以上）でユーザー登録・ログイン
- JWT（HttpOnly Cookie）によるセッション管理（有効期限 7 日）
- PBKDF2（Web Crypto API）によるパスワードハッシュ化

### 進捗保存
- **自動保存** — 30 秒ごとにサーバーへ進捗を送信
- **途中再開** — 前回の位置からタイピングを再開
- **完了判定** — 全セグメント完了時に自動的に completed フラグを設定

### ブックマーク
- 任意の位置にメモ付きブックマークを追加
- ブックマークの削除

### ダッシュボード
- ドキュメント一覧（最終閲覧日時順にソート）
- 進捗率バー表示
- WPM・正確率・読書時間の概要表示
- ドキュメント削除（ホバー時に削除ボタン表示）

### ダークモード
- 🌙/☀️ テーマ切替トグル
- CSS 変数ベースのテーマシステム（ライト/ダーク）
- 設定は localStorage に自動保存

### 読書統計グラフ
- 日別・週別のタイピング統計を SVG 棒グラフで表示
- サマリーカード（🔥連続読書日数・合計タイプ数・平均正確率・合計読書時間）
- タブ切替で日別/週別グラフを切り替え
- 進捗保存時に `reading_sessions` テーブルへ日別統計を自動記録

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | [Hono](https://hono.dev/) (TypeScript) on Cloudflare Workers |
| データベース | Cloudflare D1 (SQLite) |
| フロントエンド | Vanilla JS + Tailwind CSS (CDN) |
| ファイル解析 | PDF.js (PDF), Mammoth.js (Word) — クライアントサイド |
| 形態素解析 | kuromoji.js — Node.js マイクロサーバー |
| 認証 | JWT (HttpOnly Cookie) + PBKDF2 (Web Crypto API) |
| ビルド | Vite + @hono/vite-build |
| デプロイ | Cloudflare Pages |

## アーキテクチャ

```
┌────────────────────────────────────┐
│          ブラウザ (SPA)              │
│  Vanilla JS + Tailwind CSS (CDN)   │
│  PDF.js / Mammoth.js               │
└────────────┬───────────────────────┘
             │ HTTP
┌────────────▼───────────────────────┐
│     Cloudflare Pages / Wrangler    │
│     Hono API (port 3000)           │
│     ├─ /api/auth/*                 │
│     ├─ /api/documents/*            │
│     ├─ /api/stats/*                │
│     └─ SPA HTML Shell              │
├────────────────────────────────────┤
│     Cloudflare D1 (SQLite)         │
└────────────┬───────────────────────┘
             │ HTTP (localhost)
┌────────────▼───────────────────────┐
│   形態素解析マイクロサーバー          │
│   analyzer-server.mjs (port 3001)  │
│   kuromoji.js + Node.js HTTP       │
└────────────────────────────────────┘
```

ローカル開発時は PM2 で 2 プロセス（Wrangler + analyzer）を同時に起動します。

## API エンドポイント

### 認証

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/register` | ユーザー登録 |
| POST | `/api/auth/login` | ログイン |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | 現在のユーザー取得 |

### ドキュメント（要認証）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/documents` | ドキュメント一覧（進捗情報付き） |
| POST | `/api/documents` | ドキュメント作成（形態素解析を実行） |
| POST | `/api/documents/import-url` | URLから記事をインポート |
| GET | `/api/documents/:id` | ドキュメント詳細（セグメント・進捗・ブックマーク付き） |
| DELETE | `/api/documents/:id` | ドキュメント削除 |
| POST | `/api/documents/:id/analyze` | ドキュメント再解析（セグメント再生成） |
| PUT | `/api/documents/:id/progress` | 進捗更新（日別統計も自動記録） |
| POST | `/api/documents/:id/bookmarks` | ブックマーク追加 |
| DELETE | `/api/documents/:id/bookmarks/:bid` | ブックマーク削除 |

### 統計（要認証）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/stats/daily?days=30` | 日別統計（デフォルト30日） |
| GET | `/api/stats/weekly?weeks=12` | 週別統計（デフォルト12週） |
| GET | `/api/stats/summary` | 全期間サマリー + 連続日数 |

## データモデル

### users
| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT (PK) | UUID |
| email | TEXT (UNIQUE) | メールアドレス |
| password_hash | TEXT | PBKDF2 ハッシュ（salt:hash 形式） |
| display_name | TEXT | 表示名 |
| created_at / updated_at | TEXT | タイムスタンプ |

### documents
| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT (PK) | UUID |
| user_id | TEXT (FK) | ユーザー ID |
| title | TEXT | タイトル |
| content | TEXT | 原文テキスト |
| source_type | TEXT | ファイル種別（txt / pdf / docx / paste / url） |
| total_chars | INTEGER | 原文の文字数 |
| segments | TEXT | 形態素解析結果の JSON（`[{display, readings}]`） |
| created_at / updated_at | TEXT | タイムスタンプ |

### reading_progress
| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT (PK) | UUID |
| document_id | TEXT (FK) | ドキュメント ID |
| user_id | TEXT (FK) | ユーザー ID |
| current_position | INTEGER | 現在のセグメント位置 |
| total_typed | INTEGER | 合計タイプ数 |
| correct_count | INTEGER | 正打数 |
| miss_count | INTEGER | 誤打数 |
| reading_time_sec | INTEGER | 累計読書時間（秒） |
| completed | INTEGER | 読了フラグ（0/1） |
| last_read_at / updated_at | TEXT | タイムスタンプ |

### bookmarks
| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT (PK) | UUID |
| document_id | TEXT (FK) | ドキュメント ID |
| user_id | TEXT (FK) | ユーザー ID |
| position | INTEGER | セグメント位置 |
| note | TEXT | メモ |
| created_at | TEXT | タイムスタンプ |

### reading_sessions
| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT (PK) | UUID |
| user_id | TEXT (FK) | ユーザー ID |
| date | TEXT (UNIQUE w/ user_id) | 日付（YYYY-MM-DD） |
| chars_typed | INTEGER | その日のタイプ数 |
| correct_count | INTEGER | 正打数 |
| miss_count | INTEGER | 誤打数 |
| reading_time_sec | INTEGER | 読書時間（秒） |
| sessions_count | INTEGER | セッション回数 |
| created_at / updated_at | TEXT | タイムスタンプ |

## プロジェクト構成

```
reeda/
├── src/
│   ├── index.tsx              # Hono アプリ エントリ + HTML Shell + CSS テーマ
│   ├── types.ts               # 型定義（Env バインディング）
│   ├── routes/
│   │   ├── auth.ts            # 認証 API（register / login / logout / me）
│   │   ├── documents.ts       # ドキュメント API（CRUD / 進捗 / ブックマーク / URL インポート）
│   │   └── stats.ts           # 統計 API（daily / weekly / summary）
│   └── lib/
│       ├── analyzer.ts        # テキスト解析ユーティリティ
│       ├── auth-middleware.ts  # JWT 認証ミドルウェア
│       └── crypto.ts          # パスワードハッシュ / JWT / UUID
├── public/
│   ├── static/
│   │   ├── app.js             # フロントエンド SPA（全画面ロジック）
│   │   └── style.css          # 追加スタイル
│   └── dict/                  # kuromoji 辞書ファイル（gzip）
├── migrations/
│   ├── 0001_initial_schema.sql  # 初期テーブル定義
│   ├── 0002_add_segments.sql    # segments カラム追加
│   └── 0003_add_reading_sessions.sql  # reading_sessions テーブル追加
├── analyzer-server.mjs        # 形態素解析マイクロサーバー（Node.js, port 3001）
├── ecosystem.config.cjs       # PM2 設定（analyzer + wrangler）
├── vite.config.ts             # Vite ビルド設定
├── wrangler.jsonc             # Cloudflare Workers / Pages 設定
├── seed.sql                   # 開発用シードデータ
├── package.json               # 依存関係・スクリプト
└── tsconfig.json              # TypeScript 設定
```

## ローカル開発

### 前提条件

- Node.js 18+
- npm

### セットアップ

```bash
# 依存関係のインストール
npm install

# PM2 をグローバルインストール（初回のみ）
npm install -g pm2

# アプリをビルド
npm run build

# D1 データベースのマイグレーション
npm run db:migrate:local

# （オプション）テスト用シードデータ投入
npm run db:seed
```

### 起動

```bash
# PM2 で analyzer-server + wrangler を同時に起動
pm2 start ecosystem.config.cjs

# → http://localhost:3000
```

PM2 で起動される 2 つのプロセス:

| プロセス | 説明 | ポート |
|---------|------|-------|
| `analyzer` | kuromoji 形態素解析サーバー | 3001 |
| `reeda` | Wrangler Pages Dev サーバー | 3000 |

### 開発サーバー（Vite HMR）

```bash
# Vite 開発サーバー（HMR 対応）
npm run dev

# 別ターミナルで解析サーバー
node analyzer-server.mjs

# → http://localhost:5173
```

### 便利なコマンド

```bash
# PM2 ステータス確認
pm2 status

# ログ確認
pm2 logs

# 再起動
pm2 restart all

# 停止
pm2 stop all

# DB リセット（データ全削除 → マイグレーション → シード）
npm run db:reset
```

### npm scripts

| スクリプト | 説明 |
|-----------|------|
| `npm run dev` | Vite 開発サーバー起動（HMR） |
| `npm run build` | Vite ビルド + `_routes.json` の静的アセット除外設定 |
| `npm run preview` | Wrangler Pages Dev でビルド成果物をプレビュー |
| `npm run deploy` | ビルド + Cloudflare Pages にデプロイ |
| `npm run db:migrate:local` | D1 ローカルマイグレーション実行 |
| `npm run db:seed` | テスト用シードデータ投入 |
| `npm run db:reset` | DB 全削除 → マイグレーション → シード |

## デプロイ

```bash
npm run deploy
```

Cloudflare Pages にデプロイされます。本番環境では以下の設定が必要です:

- **D1 データベース**: `reeda-production` を作成し、`wrangler.jsonc` の `database_id` を更新
- **環境変数**: `JWT_SECRET` を安全な値に設定（未設定時はデフォルトのフォールバック値を使用）
- **形態素解析**: 本番環境では analyzer-server は不要（ドキュメント作成時にローカル開発環境で事前解析済みのセグメントデータを使用）

## 今後の開発候補

- ブックマーク一覧表示・ジャンプ機能
- キーボードショートカット
- ドキュメントのフォルダ分類
- 複数デバイス間の同期
- タイピング速度のリアルタイムグラフ

## ライセンス

Private
