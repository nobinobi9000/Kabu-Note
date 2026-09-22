# Kabu Note — プロジェクト現状ドキュメント

最終更新: 2026-09-23

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
│   │   ├── Layout.jsx             # サイドナビ・ヘッダー
│   │   ├── BrokerFilterSelect.jsx # 証券会社絞り込みセレクト（ホーム・保有銘柄ページがローカルに使用）
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
│   └── lib/
│       ├── supabase.js            # Supabaseクライアント初期化
│       ├── annualSummary.js       # annual_summaryへの加算UPSERT（addToAnnualSummary関数）
│       └── format.js              # 表示フォーマット関数（yen/pnlYen/pct/diff）
├── scripts/
│   └── update_stocks.py           # 日次バッチ（GitHub Actions）。社名/業種/株価はstock_master_latestビュー、配当/分割のみyfinance→stocks/daily_history/dividend_recordsを更新
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
| 株価自動更新（日次バッチ） | ✅ 完了 | GitHub Actions 平日17時JST。update_stocks.py |
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
| broker | text | 【非推奨・2026-09-22】旧・証券会社名（自由入力）。新規書き込みは行わない。移行期間中のみ残置 |
| broker_id | uuid | `brokers`テーブルへのFK（証券会社。2026-09-22追加） |
| is_long_term | bool | 保有目的（長期保有）フラグ |
| take_profit_pct / stop_loss_pct | numeric | kabu-signal個別売買設定（空欄なら一括設定を使用） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `brokers` — 証券会社マスタ（2026-09-22新設）
| カラム | 型 | 備考 |
|--------|-----|------|
| id | uuid PK | |
| name | text unique | 証券会社名 |
| category | text | 大手／準大手／ネット証券／独立系／その他（`<optgroup>`表示用） |
| sort_order | int | 表示順 |

RLS: `authenticated`ロールに対しSELECTのみ全許可（`brokers_read_all`）。書き込みは想定していない（増減時は手動でINSERT）。

**初期データ（2026-09-22投入、国内主要20社＋その他）:** 大手5社（野村・大和・SMBC日興・みずほ・三菱UFJモルガン・スタンレー）、
準大手5社（岡三・東海東京・岩井コスモ・いちよし・丸三）、ネット証券7社（SBI・楽天・マネックス・auカブコム・松井・GMOクリック・DMM.com）、
独立系3社（PayPay・岡三オンライン・SBIネオトレード）、その他1。ユーザーは`brokers`マスタからの選択式のみで、自由入力は廃止
（[HoldingModal.jsx](../src/components/HoldingModal.jsx)・[BrokerFilterSelect.jsx](../src/components/BrokerFilterSelect.jsx)）。

**証券会社フィルタの設計（2026-09-23改訂）:** 以前は`BrokerContext`（全ページ共通、`Layout.jsx`のボタン式ヘッダー）で
一元管理していたが、セクター・配当ページでは機能しておらず（各ページが独自に`useHoldings()`していてフィルタ結果を
反映していなかった）、かつUI的にも不要だったため撤去。ホーム・保有銘柄ページのみ、それぞれ独立したローカルstateで
`BrokerFilterSelect`（選択式、デフォルト「全て」）による絞り込みを持つ。ページ間でフィルタ選択は共有しない。

#### `stocks` — 銘柄マスタ（バッチが更新）
| カラム | 型 | 備考 |
|--------|-----|------|
| code | text PK | 証券コード |
| name_ja | text | 日本語社名。**2026-09-22〜:** `stock_master_latest`ビュー（japan-stock-screener由来）から取得。翻訳は行わない |
| name_en | text | 英語社名（yfinanceのlongName、参考情報のみ） |
| sector | text | 業種。**2026-09-22〜:** `stock_master_latest`ビュー由来（TSE33業種分類。旧GICS系分類から変更） |
| price | numeric | 終値。**2026-09-22〜:** `stock_master_latest`ビュー（screenerのclose_price）由来 |
| price_change | numeric | 前日差（yfinance fast_infoのprevious_closeとマスタのpriceの差分。ここのみyfinance依存） |
| dividend_rate | numeric | 1株配当額（yfinance dividendRate） |
| dividend_month | text | 直近権利確定年月 "YYYY/MM"（yfinanceのlast ex-dividend date） |
| currency | text | 通貨（通常JPY） |
| updated_at | timestamptz | バッチ実行時に更新 |

> **⚠️ 2026-09-22 重大不具合修正:** それ以前は`name_ja`をGoogle翻訳(`deep-translator`)で生成していたが、
> GitHub ActionsのCI環境からのアクセスが頻繁にブロックされ、直近の実行では保有銘柄48件中45件(94%)が
> 「英語社名＋株式会社」のまま保存されていた。翻訳を廃止し、japan-stock-screenerが日次生成する
> 正確な日本語名（`stock_master_latest`ビュー経由）を参照する方式に変更。詳細は6節参照。

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
| is_screener_premium | bool | 日本株スクリーナー有償相当データの閲覧可否（2026-09-17追加） |
| broker_order | jsonb | 証券会社セレクトのユーザーごとの表示順（brokers.idのuuid配列、null=デフォルト順。2026-09-23追加） |
| hidden_brokers | jsonb | ユーザーごとに非表示にした証券会社（brokers.idのuuid配列。口座を持っていない証券会社を選択肢から隠す用途。2026-09-23追加） |
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
  → raw.githubusercontent.com: https://raw.githubusercontent.com/nobinobi9000/japan-stock-screener/main/docs/latest.json
      → useScreenerData.js がfetch（1日1回 localStorageキャッシュ）
          → ScreenerWidget.jsx（ダッシュボード）
          → Market.jsx（市場マップ）
```

> **[修正済み 2026-09-02]** 以前は GitHub Pages URL（`nobinobi9000.github.io/...`）を使用していたが、
> 301リダイレクト先がCORSに非対応のためfetchが失敗していた。
> `raw.githubusercontent.com` 経由（CORS `*` を返す）に変更して解決。

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

**⚠️ 絶対原則（2026-09-22改訂）:** Kabu Note側で銘柄の社名・業種・株価を独自生成しない。
`stock_master_latest`ビュー（japan-stock-screenerの`screener_stock_snapshots`が唯一の情報源）を参照する。
`update_stocks.py`は配当・株式分割・前日差の取得のみ、例外的にyfinanceを直接呼ぶ。

### 5-1b. 共有銘柄マスタ `stock_master_latest`（全アプリ共通、2026-09-22新設）

Supabaseのビュー。`screener_stock_snapshots`から銘柄コードごとの最新行（`code, name, sector, close_price`）を返す。
japan-stock-screenerが毎日書き込む正確な日本語社名（JPX公式リスト由来）・TSE33業種分類・終値を、
Kabu-Note・kabu-signal含む全アプリが参照できる唯一の情報源とする。

> **RLS注意:** `screener_stock_snapshots`自体はプレミアム会員のみ読める行レベルセキュリティが設定されているが、
> このビューはテーブル所有者(postgres)権限で実行されるためRLSをバイパスし、`code/name/sector/close_price`のみを
> 全認証ユーザーに公開する意図的な設計（JVQMスコア等の分析系カラムは含まないため、プレミアム価値を損なわない）。
> `security_invoker`を付けて「RLSを効かせる」修正をしないこと（そうすると非プレミアム会員が空配列しか取得できなくなり、
> 保有銘柄の社名表示ができなくなる）。

### 5-2. update_stocks.py（日次バッチ）

**実行タイミング:** GitHub Actions、平日17時JST（東証休場日はスキップ、`FORCE_RUN=true` で強制実行可）。
2026-09-22に16時→17時へ変更（japan-stock-screenerの完了(〜16:30 JST)を待つ必要があるため）。

**処理フロー:**
1. `holdings` テーブルから全ユーザーの証券コードを取得
2. `stock_master_latest`ビューから社名・業種・終値を取得（銘柄マスタに無いコードは前回の`stocks`保存値を維持）
3. yfinanceでバッチ取得（配当・株式分割・前日差のみ）
4. `stocks` テーブルを UPSERT
5. `daily_history` を UPSERT（ユーザーごとの評価額・損益率）
6. **配当スナップショット:** 権利確定月の翌月1日以降かつ `dividend_records` 未存在の銘柄を自動INSERT

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

**現状:** kabu-signal のバッチ（`screener/user_matcher.py`）が Supabase の service_role key を使い、
Kabu Note の以下のテーブルを直接読み取っている（Kabu Note のアプリコードを経由しないサーバー間連携）。

| テーブル | 参照カラム | 用途 |
|---------|----------|------|
| `watchlist` | `user_id`, `code` | ウォッチリスト銘柄とシグナルを突合 |
| `holdings` | `user_id`, `code`, `cost_price` | 保有銘柄の突合・損益アラート計算 |

- 実行タイミング: 平日 21:00 JST（kabu-signal バッチ起動時）
- アクセス権限: service_role（RLS をバイパスして全ユーザー分を一括取得）
- **注意:** `watchlist`・`holdings` のカラム名を変更すると kabu-signal のバッチが即座に失敗するため、
  変更時は必ず `kabu-signal/screener/user_matcher.py` を同時に修正すること

**将来:** `pnl_alert_settings` テーブルへの書き込み UI が Kabu Note 側で未実装。
kabu-signal 側は読み取り実装済みのため、UI を追加すれば損益アラート閾値の設定が可能になる。

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

### kabu-signal → Kabu-Note 通知ロジック移行計画（2026-09-19開始、進行中）

kabu-signalはPush通知(PWA)のためだけに存在させる価値が薄いと判断し、通知ロジック
自体をKabu-Noteに移行し、将来的にkabu-signalを廃止する方針で作業中。段階的に実施し、
既存のkabu-signal通知は各フェーズが本番で安定するまで止めない。

| フェーズ | 内容 | 状況 |
|---|---|---|
| 1 | Kabu-NoteにPWA基盤を追加（manifest・Service Worker・VAPID鍵はkabu-signalと同じものを流用） | 完了(2026-09-19) |
| 2 | `/api/push/subscribe`・`/api/push/send` をVercel serverless functionとして新設 | 完了(2026-09-19、送信APIは疎通確認済み。実機での購読・受信確認は未) |
| 3 | 実機でKabu-Noteから通知が届くことを検証 | 未着手 |
| 4 | Python通知ロジック（jvqm_screener.py等）とGitHub ActionsワークフローをKabu-Note側に移植 | 未着手 |
| 5 | 本番でKabu-Note経由の通知が数日安定稼働するのを確認 | 未着手 |
| 6 | kabu-signalのワークフローを停止し、kabu-signal自体をアーカイブ | 未着手 |

**フェーズ4の必須要件（2026-09-22追記）:** kabu-signalの`morning-scan.yml`は
GitHub純正の`schedule`トリガーのみに依存しており、2026-09-21に設定
（月〜金12:00 UTC）と全く一致しない曜日・時刻（日曜18:00 UTC）で誤発火する
現象を確認した（原因未特定、GitHub Actions側の既知の信頼性問題の一種と推測）。
japan-stock-screenerは同種の問題を`cloudflare-watchdog/`という外部cron監視で
解決済み。**移行先のワークフロー（Kabu-Note側）を新設する際は、最初から
同様の外部watchdogによる起動保証を組み込むこと。** kabu-signal自体は廃止予定
のため、kabu-signal側にwatchdogを新設する対応はしない。

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
| yfinance | 配当・株式分割データ取得のみ（社名・業種・株価はstock_master_latestビュー、2026-09-22〜） |
| supabase | Supabase Python クライアント |
| jpholiday | 東証休場日判定 |
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

---

## INTEGRATION_MAP.mdへの反映待ち

- **kabu-signal → Kabu-Note 通知ロジック移行計画の開始（2026-09-19〜、進行中）**

  kabu-signalはPush通知(PWA)専用アプリとして存在価値が薄くなったため、通知
  ロジック自体をKabu-Noteに移行し、将来的にkabu-signalを廃止する方針が
  決まった。詳細な6段階の計画は本ファイル6節「kabu-signal → Kabu-Note
  通知ロジック移行計画」を参照。現時点でフェーズ1・2（PWA基盤・Push API）を
  Kabu-Note側に実装済み。

  **INTEGRATION_MAP.mdへの反映内容**:
  1. 3アプリの役割分担の記述に、「kabu-signalは段階的に廃止予定、通知
     ロジックはKabu-Noteに統合中」という現状を追記してほしい
  2. §3に新規ルールとして「kabu-signalの通知系ファイル(push_sender.py等)を
     変更する場合、同じ変更をKabu-Note側の移植済みコードにも適用が必要か
     確認すること」を追加してほしい（移行完了までの間、二重管理になる期間が
     あるため）
  3. 今回発見した「GitHub純正scheduleトリガーが設定と異なる曜日・時刻で
     誤発火することがある(2026-09-21に実例確認)」という既知の問題を、
     3アプリ共通の注意事項として記録してほしい。移行先ワークフロー新設時は
     cloudflare-watchdog相当の外部監視を最初から組み込むこと

- **共有銘柄マスタ `stock_master_latest` ビュー新設（2026-09-22）**

  Kabu-Noteの`stocks.name_ja`がGoogle翻訳(`deep-translator`)依存で不安定
  （直近実行では保有銘柄48件中45件が英語名のまま保存される重大不具合）
  だったため、japan-stock-screenerの`screener_stock_snapshots`から最新行を
  返す共有ビュー`stock_master_latest`(code, name, sector, close_price)を
  Supabase側に新設。Kabu-Noteの`update_stocks.py`はこれを参照するだけに
  変更し、yfinance+Google翻訳での独自生成をやめた（詳細は本ファイル5-1b節）。
  証券会社も`holdings.broker`(自由入力text)から`brokers`マスタテーブル＋
  `holdings.broker_id`(FK)に変更。

  **INTEGRATION_MAP.mdへの反映内容**:
  1. 「銘柄データ取得はscreenerのバッチのみ」という既存原則の実装例外
     として記載されていた`update_stocks.py`の扱いを更新：社名・業種・株価は
     `stock_master_latest`ビュー経由で原則通りscreenerが唯一の情報源になった。
     yfinance直接呼び出しは配当・株式分割・前日差の取得のみに縮小、と修正
  2. `stock_master_latest`ビューを、全アプリが参照できる共有インフラとして
     新たに記載してほしい。RLSは`screener_stock_snapshots`側でプレミアム会員
     限定だが、このビューはテーブル所有者権限でRLSをバイパスし
     code/name/sector/close_priceのみ全ユーザーに公開する意図的設計である旨、
     誤って「RLSが効いていないセキュリティ不具合」と判断されないよう明記
  3. `brokers`マスタテーブルの存在と、`holdings.broker`(旧・非推奨)から
     `holdings.broker_id`への移行が進行中であることを記録してほしい
