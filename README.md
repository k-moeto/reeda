# reeda（リー打）

タイピングで、読む。

## 概要

reeda は、タイピングを通じて文章を深く理解しながら読むサービスです。PDF、Word、テキストファイルをドラッグ＆ドロップするだけで、タイピングゲームのようなUIが立ち上がり、一文字ずつ確実に文章を読み進めることができます。

## 機能

### 実装済み（MVP）
- **ファイルインポート** — .txt / .pdf / .docx をドラッグ＆ドロップで読み込み
- **テキスト直接入力** — コピペで文章を追加
- **タイピング画面** — 日本語ローマ字入力対応のタイピングUI
  - 原文表示 + ローマ字ガイド
  - 複数ローマ字入力パターン対応（si/shi、tu/tsu、hu/fu 等）
  - ミスタイプ時は赤色ハイライト、正しいキーを打つまで進めない
  - リアルタイムWPM・正確率・経過時間表示
- **アカウント機能** — メール＋パスワードでユーザー登録・ログイン
- **進捗保存** — 読書位置の自動保存（30秒ごと）、途中再開可能
- **ブックマーク** — 任意の位置にメモ付きブックマーク
- **ダッシュボード** — ドキュメント一覧、進捗率バー表示

### 未実装（今後の開発候補）
- URL入力で記事を直接インポート
- 理解度チェックモード（読了後の内容確認）
- ダークモード
- フォントサイズ調整
- 読書統計グラフ（日別・週別）
- kuromoji.js による正確な形態素解析（現在は文字単位変換）

## 技術スタック

- **バックエンド**: Hono (TypeScript) on Cloudflare Workers
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: Vanilla JS + Tailwind CSS (CDN)
- **ファイル解析**: PDF.js (PDF), Mammoth.js (Word) — クライアントサイド
- **認証**: JWT (HttpOnly Cookie) + PBKDF2 (Web Crypto API)

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/register` | ユーザー登録 |
| POST | `/api/auth/login` | ログイン |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | 現在のユーザー取得 |
| GET | `/api/documents` | ドキュメント一覧 |
| POST | `/api/documents` | ドキュメント作成 |
| GET | `/api/documents/:id` | ドキュメント詳細 |
| DELETE | `/api/documents/:id` | ドキュメント削除 |
| PUT | `/api/documents/:id/progress` | 進捗更新 |
| POST | `/api/documents/:id/bookmarks` | ブックマーク追加 |
| DELETE | `/api/documents/:id/bookmarks/:bid` | ブックマーク削除 |

## データモデル

- **users** — ユーザー（email, password_hash, display_name）
- **documents** — ドキュメント（title, content, source_type, total_chars）
- **reading_progress** — 読書進捗（current_position, correct_count, miss_count, reading_time_sec）
- **bookmarks** — ブックマーク（position, note）

## ローカル開発

```bash
npm install
npm run build
npm run db:migrate:local
pm2 start ecosystem.config.cjs
# → http://localhost:3000
```

## デプロイ

```bash
npm run deploy
```

## ライセンス

Private
