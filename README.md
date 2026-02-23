# PJ Sekai Story DB

Vite + React + TypeScript + Supabase Auth で作った、ストーリー構造管理用の小さなアプリです。  
新しい `Supabase` / `GitHub` アカウントで作り直す前提の手順をまとめています。

## 1. ローカル準備

```bash
npm install
cp .env.local.example .env.local
```

`.env.local` を編集して、新しい Supabase プロジェクトの値を入れてください。

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 2. Supabase 新規プロジェクト作成

1. Supabase で新しい Project を作る
2. `Authentication > Providers` で `Email` を有効化
3. `SQL Editor` で `supabase/schema.sql` を実行
4. 続けて `supabase/rls.sql` を実行
5. `Authentication > Users` でログイン用ユーザーを作る

## 3. アプリ起動

```bash
npm run dev
```

ブラウザで `http://localhost:5174` を開きます。  
ログイン後に `Node -> Thread -> Entry` の順で登録できます。

WSL で監視が不安定な場合:

```bash
set CHOKIDAR_USEPOLLING=1
npm run dev
```

## 4. GitHub 新アカウントに接続し直す

このディレクトリにまだ `.git` が無ければ:

```bash
git init
git add .
git commit -m "Initial commit"
```

新しい GitHub リポジトリを作った後:

```bash
git branch -M main
git remote add origin <NEW_REPO_URL>
git push -u origin main
```

既存で remote を差し替える場合:

```bash
git remote set-url origin <NEW_REPO_URL>
```

## 5. 追加メモ

- `.env.local` はコミットしないでください
- Supabase 側の権限モデルを厳密化するなら `supabase/rls.sql` を拡張してください
