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
2. `Authentication > Providers` で `Google` を有効化し、Google Cloud で作成した OAuth Client ID / Secret を設定
3. `Authentication > URL Configuration` で `Site URL` と `Redirect URLs` にローカルURL（例: `http://localhost:5174`）を追加
4. `SQL Editor` で `supabase/schema.sql` を実行
5. 続けて `supabase/rls.sql` を実行
6. `SQL Editor` で、ログインを許可する Google メールを `public.allowed_users` に登録（すべて小文字）

```sql
insert into public.allowed_users (email)
values
  ('alice@example.com'),
  ('bob@example.com')
on conflict (email) do nothing;
```

※ 未登録メールはログイン後すぐに弾かれ、データアクセスも RLS で拒否されます。
※ 既存プロジェクトを更新する場合も `supabase/schema.sql` を再実行してください（`threads` の追加カラム `has_episodes` / `episode_number_start` / `episode_labels`、`subitem_templates` / `subitem_tag_presets` テーブル、`speaker_profiles.speech_balloon_id` 列を作成します）。

## 3. アプリ起動

```bash
npm run dev
```

ブラウザで `http://localhost:5174` を開きます。  
Google ログイン後に、設定ページで `項目内項目（日付/タグ）` を事前登録し、通常ページではボタン選択だけで項目内項目を追加できます。項目内項目は並べ替え、削除ができます。

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
