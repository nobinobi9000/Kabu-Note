# Kabu Note 📒

> 日本株ポートフォリオを一元管理するWebダッシュボード

複数の証券会社に口座を持つ投資家が、各社アプリをまたいで資産全体をひとつの画面で把握できるWebアプリです。
証券コード・保有株数・取得単価を登録するだけで、株価の取得から損益計算・グラフ表示までを自動で行います。

![ダークモード / ライトモード対応]()

---

## 機能

- **サマリー** — 総評価額・トータル損益・損益率をひと目で確認
- **資産推移グラフ** — 日次の資産推移を折れ線グラフで可視化（30日 / 90日 / 1年）
- **個別銘柄** — 保有銘柄ごとの現在株価・前日差・損益を一覧表示
- **セクター構成** — ドーナツグラフでポートフォリオのセクター分散を確認
- **配当カレンダー** — 月別の配当受取額と年間配当予測を表示
- **証券会社フィルタ** — 証券会社ごとに表示を絞り込み（任意入力）
- **ダーク / ライトモード** — テーマ切替対応（OS設定に自動追従）
- **レスポンシブ対応** — PC・タブレット・スマホで動作

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 19 + Vite + Tailwind CSS + Recharts |
| ホスティング | Vercel |
| データベース / 認証 | Supabase（PostgreSQL + Supabase Auth） |
| 株価データ取得 | Python + yfinance（GitHub Actions で平日自動実行） |

## 注意事項

- 対応市場は**日本株（東証）のみ**です
- 株価データは**平日16時頃**に自動更新されます（リアルタイムではありません）
- 証券口座との連携・口座情報の登録には**対応していません**
- 氏名・住所などの個人情報は**一切収集しません**

---

## ローカル開発のセットアップ

### 必要なもの

- Node.js 20+
- Python 3.10+
- Supabase アカウント（無料）

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/nobinobi9000/Kabu-Note.git
cd Kabu-Note

# 2. フロントエンドの依存関係をインストール
npm install

# 3. Pythonの依存関係をインストール
pip install -r requirements.txt

# 4. 環境変数を設定（次のセクション参照）
cp .env.example .env.local

# 5. 開発サーバーを起動
npm run dev
```

## 環境変数

### フロントエンド（`.env.local`）

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### GitHub Actions シークレット

| シークレット名 | 内容 |
|-------------|------|
| `SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー（RLS バイパス用） |

> Supabase のキーは [プロジェクト設定 > API] から取得できます。

## デプロイ

Vercel と GitHub を連携することで、`main` ブランチへの push 時に自動デプロイされます。

```bash
# Vercel CLI でのデプロイ
vercel deploy --prod
```

株価の自動更新は GitHub Actions（`.github/workflows/daily_update.yml`）が平日16時（JST）に実行します。

---

## ライセンス

MIT
