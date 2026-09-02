# Kabu Note — プロジェクト現状ドキュメント

最終更新: 2026-09-02

このファイルは別セッション・別AIが読んで「現時点のKabu Noteの全体像」を正確に再現するための引き継ぎ資料です。

---

## 1. プロジェクトの目的・概要

**Kabu Note（株ノート）**は、個人投資家が保有日本株を管理するPWA（Progressive Web App）。

- 保有銘柄・取得単価・損益をリアルタイムで確認
- 配当金の管理（予定・確定・スナップショット方式で金額固定）
- 株主優待の記録
- 日本株スクリーナー（japan-stock-screener）のデータを読み込んでウィジェット・ヒートマップ表示

**絶対原則（CLAUDE.mdに記載）:**
- 投資助言に該当する要素を一切作らない
- 銘柄データの取得はスクリーナーのバッチのみ（Kabu Note独自取得禁止）
- ユーザーデータはRLSで完全分離

**公開URL:** https://kabu.nobi-labo.com（Vercel）

---

## 2. ディレクトリ構成

```
Kabu-Note/
├── src/
│   ├── App.jsx                    # ルーティング定義（BrowserRouter）
│   ├── main.jsx                   # エントリーポイント
│   ├── index.css                  # Tailwind ディレクティブ + カスタム変数
│   ├── pages/
│   │   ├── Login.jsx              # ログイン（既ログイン済みなら/dashboardへリダイレクト）
│   │   ├── Register.jsx           # ユーザー登録
│   │   ├── ResetPassword.jsx      # パスワードリセット要求
│   │   ├── UpdatePassword.jsx     # パスワード再設定（メールリンク遷移先）
│   │   ├── Dashboard.jsx          # トップ。KPI/資産推移/スクリーナーウィジェット/年間サマリー
│   │   ├── Stocks.jsx             # 個別銘柄一覧・追加・編集・売却
│   │   ├── Watchlist.jsx          # ウォッチリスト
│   │   ├── Sector.jsx             # 業種別集計
│   │   ├── Dividend.jsx           # 配当管理（カレンダー・テーブル・スナップショット確定・修正）
│   │   ├── Market.jsx             # 市場マップ（スクリーナーのsector_heatmapを表示）
│   │   └── Settings.jsx           # メール変更・パスワード変更・アプリ更新・アカウント削除
│   ├── components/
│   │   ├── Layout.jsx             # サイドナビ・ヘッダー・証券会社フィルター
│   │   ├── ProtectedRoute.jsx     # 未認証ならログインページへリダイレクト
│   │   ├── HoldingModal.jsx       # 銘柄追加・編集モーダル
│   │   ├── SellModal.jsx          # 売却モーダル（数量・単価・日付・現金追加）
│   │   ├── DividendAmountModal.jsx # 配当金額手動修正モーダル（✏️ボタンから開く）
│   │   ├── WatchlistModal.jsx     # ウォッチリスト追加・編集モーダル
│   │   ├── YutaiModal.jsx         # 株主優待登録・編集モーダル
│   │   ├── ConfirmDialog.jsx      # 削除確認ダイアログ
│   │   ├── ScreenerWidget.jsx     # ダッシュボード内のスクリーナーウィジェット（top3表示）
│   │   └── SplitEventBanner.jsx   # 株式分割・併合の確認バナー
│   ├── hooks/
│   │   ├── useAuth.js             # Supabase認証状態管理
│   │   ├── useHoldings.js         # 保有銘柄CRUD + 売却 + 損益計算
│   │   ├── useWatchlist.js        # ウォッチリストCRUD
│   │   ├── useDividendRecords.js  # 配当確定記録（autoConfirm/manualConfirm/updateAmount）
│   │   ├── useYutai.js            # 株主優待CRUD
│   │   ├── useEntitlement.js      # プラン判定（free/basic/premium）
│   │   ├── useAnnualSummary.js    # 年間損益サマリー取得
│   │   ├── useDailyHistory.js     # 資産推移履歴取得
│   │   ├── useTransactions.js     # 売却トランザクション取得
│   │   ├── useScreenerData.js     # スクリーナーlatesst.jsonをfetch（localStorageキャッシュ）
│   │   ├── useSplitEvents.js      # 株式分割・併合イベント取得
│   │   └── useScreenerData.js     # スクリーナーデータ取得
│   ├── context/
│   │   └── BrokerContext.jsx      # 証券会社フィルター状態をコンテキストで共有
│   └── lib/
│       ├── supabase.js            # Supabaseクライアント初期化
│       ├── annualSummary.js       # annual_summaryへの加算UPSERT（addToAnnualSummary関数）
│       └── format.js              # 表示フォーマット関数（yen/pnlYen/pct/diff）
├── scripts/
│   └── update_stocks.py           # 日次バッチ（GitHub Actions）。yfinanceで株価取得→stocks/daily_history/dividend_recordsを更新
├── public/
│   ├── manifest.json              # PWAマニフェスト（start_url: "/dashboard"）
│   ├── favicon.svg
│   ├── icon-192.png / icon-512.png
│   └── apple-touch-icon.png
├── docs/
│   └── PROJECT_STATE.md           # 本ファイル
├── vercel.json                    # SPA用リライトルール（全パスを/index.htmlへ）
├── package.json
├── requirements.txt               # Pythonスクリプト依存: yfinance/supabase/jpholiday/deep-translator/pytz
├── vite.config.js
└── tailwind.config.js
```

---

## 3. 主要機能の一覧と実装状況

| 機能 | 状態 | 備考 |
|------|------|------|
| メール/パスワード認証 | ✅ 完了 | Supabase Auth。既ログイン時はLogin.jsxが/dashboardへリダイレクト |
| パスワードリセット | ✅ 完了 | ResetPassword → メール → UpdatePassword |
| 保有銘柄管理（CRUD） | ✅ 完了 | 無料プランは3件まで（FREE_HOLDINGS_LIMIT = 3） |
| 売却記録・損益計算 | ✅ 完了 | transactions + annual_summary に記録。現金残高追加オプションあり |
| 株価自動更新（日次バッチ） | ✅ 完了 | GitHub Actions 平日16時JST。update_stocks.py |
| 資産推移グラフ | ✅ 完了 | daily_history テーブル。30日/90日/1年 切替 |
| ウォッチリスト | ✅ 完了 | 無料プランは5件まで（FREE_WATCHLIST_LIMIT = 5） |
| 業種別集計（Sector） | ✅ 完了 | holdings × sector でグループ化 |
| 配当管理（予定・確定） | ✅ 完了 | スナップショット方式（下記詳述） |
| 株主優待管理 | ✅ 完了 | yutai_records テーブル。満足度★5段階 |
| スクリーナーウィジェット | ✅ 完了 | latest.json を fetch。1日1回 localStorage キャッシュ |
| 市場マップ（ヒートマップ） | ✅ 完了 | sector_heatmap をスクリーナーから取得 |
| PWA対応 | ✅ 完了 | manifest.json / ServiceWorker |
| アプリ更新ボタン | ✅ 完了 | Settings.jsx の AppUpdateSection でキャッシュクリア + SW更新 |
| プラン管理（有料/無料） | ✅ 完了 | account_entitlements テーブル（plan: free/basic/premium） |
| アカウント削除 | ✅ 完了 | Edge Function delete-account 経由 |
| 株式分割・併合バナー | ✅ 完了 | split_events テーブル。確認済みフラグあり |
| 年間損益サマリー | ✅ 完了 | annual_summary テーブル（売却損益 + 受取配当の合計） |
| 現金残高管理 | ✅ 完了 | profiles.cash_balance |

---

## 4. データ構造・スキーマ（Supabase / kabu-note プロジェクト）

**Supabase Project ID:** `nhkgyipjeithytqqfuda`  
**Region:** ap-northeast-1

### テーブル一覧

#### `holdings` — 保有銘柄
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| user_id | uuid | RLS: auth.uid() |
| code | text | 証券コード（4桁） |
| quantity | numeric | 保有株数 |
| cost_price | numeric | 取得単価（1株あたり） |
| broker | text | 証券会社名（任意） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `stocks` — 銘柄マスタ（バッチが更新）
| カラム | 型 | 備考 |
|--------|-----|------|
| code | text PK | 証券コード |
| name_ja | text | 日本語社名（deep-translatorで翻訳、失敗時は英語名） |
| name_en | text | 英語社名（yfinanceのlongName） |
| sector | text | 業種（SECTOR_MAPで英語→日本語変換。翻訳API不使用） |
| price | numeric | 終値 |
| price_change | numeric | 前日差 |
| dividend_rate | numeric | 1株配当額（yfinance dividendRate） |
| dividend_month | text | 直近権利確定年月 "YYYY/MM"（yfinanceのlast ex-dividend date） |
| currency | text | 通貨（通常JPY） |
| updated_at | timestamptz | バッチ実行時に更新 |

**⚠️ 注意:** `dividend_rate` と `dividend_month` はyfinanceが返す最新値（次年度予想に切り替わることがある）。確定後の金額は `dividend_records` にスナップショットされる。

#### `dividend_records` — 配当確定記録（スナップショット）
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| user_id | uuid | RLS |
| code | text | 証券コード |
| year | int | 権利確定年 |
| month | int | 権利確定月 |
| amount | numeric | 受取額（税引き前、rate×quantity） |
| quantity | int | 確定時の保有株数 |
| auto_confirmed | bool | バッチによる自動確定か否か |
| manually_adjusted | bool | ユーザーが✏️で手動修正したか否か |
| confirmed_at | timestamptz | |

**ユニーク制約:** `(user_id, code, year, month)`

**支払年ロジック:** `paymentYear = month >= 10 ? year + 1 : year`（10〜12月権利確定は翌年収入）

#### `annual_summary` — 年間損益サマリー
| カラム | 型 | 備考 |
|--------|-----|------|
| user_id | uuid | |
| year | int | |
| realized_pnl | numeric | 売却確定損益の累計 |
| received_dividends | numeric | 受取配当の累計（支払年ベース） |
| updated_at | timestamptz | |

**ユニーク制約:** `(user_id, year)`  
**更新:** `addToAnnualSummary()` (src/lib/annualSummary.js) で差分加算UPSERT

#### `daily_history` — 日次資産推移
| カラム | 型 | 備考 |
|--------|-----|------|
| user_id | uuid | |
| date | date | |
| total_market_value | numeric | 全保有銘柄の評価額合計 |
| total_pnl_rate | numeric | 損益率（%） |

**ユニーク制約:** `(user_id, date)`

#### `transactions` — 売却トランザクション
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| user_id | uuid | |
| code | text | |
| type | text | 現在は 'sell' のみ |
| date | date | 売却日 |
| quantity | numeric | 売却株数 |
| price | numeric | 売却単価 |
| cost_price | numeric | 取得単価（スナップショット） |
| realized_pnl | numeric | 実現損益 |
| add_to_cash | bool | 売却代金を現金残高に加算するか |

#### `yutai_records` — 株主優待記録
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| user_id | uuid | |
| code | text | 証券コード |
| month | int | 優待月 |
| content | text | 優待内容テキスト |
| value_yen | numeric | 優待相当額（円） |
| satisfaction | int | 満足度 1〜5 |

#### `watchlist` — ウォッチリスト
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| user_id | uuid | |
| code | text | |
| name | text | 銘柄名 |
| sector | text | 業種 |
| note | text | メモ |

#### `profiles` — ユーザープロフィール
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | auth.users.id と同一 |
| cash_balance | numeric | 現金残高（売却代金加算オプション用） |
| updated_at | timestamptz | |

#### `account_entitlements` — プラン管理
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | auth.users.id と同一 |
| plan | text | 'free' / 'basic' / 'premium' |

#### `split_events` — 株式分割・併合イベント
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| user_id | uuid | |
| code | text | |
| event_date | date | |
| ratio | numeric | 分割比率 |
| acknowledged | bool | ユーザーが確認済みか |

---

## 5. 外部とのインターフェース

### 5-1. japan-stock-screener との連携

**データフロー（読み取り専用）:**

```
japan-stock-screener バッチ
  → GitHub Pages: https://nobinobi9000.github.io/japan-stock-screener/latest.json
      → useScreenerData.js がfetch（1日1回 localStorageキャッシュ）
          → ScreenerWidget.jsx（ダッシュボード）
          → Market.jsx（市場マップ）
```

**latest.json の形式:**
```json
{
  "date": "2026-09-02",
  "top3": [
    {
      "code": "1234",
      "name": "銘柄名",
      "sector": "テクノロジー",
      "score": 78,
      "risk_tag": "安定"
    }
  ],
  "sector_heatmap": [
    {
      "name": "テクノロジー",
      "avg_score": 65,
      "stock_count": 42
    }
  ]
}
```

**⚠️ 絶対原則:** Kabu Note 側で独自に yfinance を呼ぶコードは書かない（`update_stocks.py` のみ例外）。

### 5-2. update_stocks.py（日次バッチ）

**実行タイミング:** GitHub Actions、平日16時JST（東証休場日はスキップ、`FORCE_RUN=true` で強制実行可）

**処理フロー:**
1. `holdings` テーブルから全ユーザーの証券コードを取得
2. yfinance でバッチ取得（企業名・株価・配当など）
3. `stocks` テーブルを UPSERT
   - `sector` は `SECTOR_MAP` 辞書で英語→日本語変換（翻訳API不使用）
   - `name_ja` は `deep-translator` (GoogleTranslator) で翻訳（不安定なため失敗時は英語名+株式会社）
4. `daily_history` を UPSERT（ユーザーごとの評価額・損益率）
5. **配当スナップショット:** 権利確定月の翌月1日以降かつ `dividend_records` 未存在の銘柄を自動INSERT

**配当スナップショットのトリガー条件:**
```python
trigger = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
if today >= trigger and not existing_record:
    # スナップショット作成
```

**環境変数:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FORCE_RUN`（任意、"true"/"1"/"yes" で休場日チェックをスキップ）

### 5-3. Supabase Edge Function

- `delete-account`: アカウント削除処理（Settings.jsx から POST）
  - エンドポイント: `{SUPABASE_URL}/functions/v1/delete-account`
  - 認証: `Authorization: Bearer {access_token}`

### 5-4. kabu-signal との連携

**現状:** 直接の連携なし。将来的に holdings データを参照する可能性があるが未実装。

---

## 6. 既知の不具合・技術的負債・保留中のTODO

### 不具合・技術的負債

| # | 内容 | 優先度 |
|---|------|--------|
| 1 | `name_ja` の翻訳が不安定（deep-translatorがHTTP 500を返すことがある）。翻訳失敗時は英語名+「株式会社」になる。 | 低 |
| 2 | `dividend_month` が yfinance の「最後の権利確定日」に依存しているため、yfinance が翌年に更新した後の空白期間にスナップショットが取れない可能性がある（スクリプトが毎日実行されているので実際の被害は限定的） | 中 |
| 3 | `autoConfirm`（フロントエンド）と `update_stocks.py` のスナップショット（バッチ）が二重で動作。バッチが先に実行されれば問題ないが、順序保証なし | 低 |
| 4 | `annual_summary` の `received_dividends` は差分加算方式のため、dividend_records の金額を修正した際に差分のみ反映（updateAmount 内で実装済み） | — |

### 保留中のTODO

- Notion作業ログページ（誤って Private HOME に作成したページ `34f9ace3-04c1-81f7-8037-f7f46306d98f`）の手動削除（503エラーで自動削除不可）
- `name_ja` 翻訳のより安定した実装（Google翻訳以外の手段、または手動マスタ管理）
- sector と同様に `name_ja` もマスタテーブル管理への移行検討

---

## 7. 使用技術・主要ライブラリとバージョン

### フロントエンド

| ライブラリ | バージョン | 用途 |
|------------|-----------|------|
| React | 19.2.0 | UIフレームワーク |
| react-dom | 19.2.0 | |
| react-router-dom | 7.6.2 | SPAルーティング |
| @supabase/supabase-js | 2.49.4 | Supabaseクライアント |
| recharts | 3.7.0 | グラフ（LineChart/BarChart） |
| Tailwind CSS | 3.4.19 | スタイリング |
| Vite | 6.3.5 | ビルドツール |

### バッチスクリプト（Python）

| ライブラリ | 用途 |
|------------|------|
| yfinance | 株価・配当データ取得 |
| supabase | Supabase Python クライアント |
| jpholiday | 東証休場日判定 |
| deep-translator | 社名の日本語翻訳（GoogleTranslator） |
| pytz | タイムゾーン処理（JST） |

---

## 8. 起動方法・デプロイ・環境変数

### ローカル開発

```bash
cd Kabu-Note
npm install
npm run dev          # http://localhost:5173
```

**必要な環境変数（`.env.local`）:**
```
VITE_SUPABASE_URL=https://nhkgyipjeithytqqfuda.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...（Supabase anon key）
```

### デプロイ

```bash
vercel deploy --prod --yes --cwd "C:\Users\tkouno\Desktop\Claude\Kabu-Note"
```

または GitHub push → Vercel 自動デプロイ（main ブランチ）

**本番URL:** https://kabu.nobi-labo.com

**Vercel プロジェクト設定:** `.vercel/project.json` 参照

### バッチ手動実行

GitHub Actions から手動トリガー（`FORCE_RUN=true` を設定）で休場日でも実行可能。

---

## 9. 認証・プランフロー

```
未認証
  → /（Login.jsx）
      ├─ 既ログイン済み → /dashboard（useEffect でリダイレクト）
      └─ ログイン成功 → /dashboard

ProtectedRoute
  → 未認証なら / へリダイレクト

account_entitlements.plan
  ├─ 'free'    → holdings 3件まで、watchlist 5件まで
  ├─ 'basic'   → 無制限
  └─ 'premium' → 無制限
```

---

## 10. RLS（Row Level Security）パフォーマンス注意

**重要:** RLS ポリシーは `(select auth.uid())` 形式（サブクエリ）で記述すること。`auth.uid()` をそのまま使うと行ごとに評価されてパフォーマンスが低下する。

マイグレーション `fix_rls_performance_and_indexes` で以下を適用済み：
- holdings, transactions, dividend_records, yutai_records, watchlist, daily_history, annual_summary の7テーブル
- holdings.user_id, transactions.user_id にインデックス追加
