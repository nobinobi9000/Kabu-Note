# 3サービス連携ノート — Kabu Note / kabu-signal / japan-stock-screener

最終更新: 2026-09-02  
このファイルは Phase 3 の統合設計を行う際の元資料です。

---

## 全体アーキテクチャ図

```
┌──────────────────────────────────────────────────────────────────────┐
│  japan-stock-screener (バッチ)                                        │
│  stock_screener_v3_multiplan.py                                       │
│  実行タイミング: 平日 毎日（GitHub Actions, matrix sharding）          │
│                                                                       │
│  出力①  docs/latest.json          ← GitHub Pages（公開）             │
│          { date, top3[], sector_heatmap[] }                           │
│                                                                       │
│  出力②  screener_snapshots         ← Supabase DB（非公開）           │
│          screener_stock_snapshots   ← Supabase DB（非公開）           │
└────────────┬─────────────────────────────────────┬───────────────────┘
             │ fetch (HTTPS)                        │ REST API (service_role)
             ▼                                      ▼
┌────────────────────────┐         ┌──────────────────────────────────┐
│  Kabu Note (フロント)  │         │  kabu-signal (バッチ)             │
│  useScreenerData.js    │         │  jvqm_screener.py                │
│                        │         │  実行タイミング: 平日21:00 JST    │
│  ・ダッシュボード       │         │                                  │
│    ウィジェット表示     │         │  + user_matcher.py               │
│  ・市場マップ           │         │    Kabu NoteのSupabaseから         │
│                        │         │    watchlist/holdings を参照      │
└────────────────────────┘         └──────────────────────────────────┘
         │                                          │
         │ Supabase (RLS)                           │ 個別PWA Push通知
         ▼                                          ▼
┌────────────────────────────────────────────────────────────────────┐
│  Supabase (Kabu Note プロジェクト: nhkgyipjeithytqqfuda)           │
│  watchlist, holdings, pnl_alert_settings, ...                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 1. 現在共有しているデータ・ファイル・API

### 1-1. `docs/latest.json`（公開ファイル）

| 項目 | 内容 |
|------|------|
| **パス** | `japan-stock-screener/docs/latest.json` |
| **URL** | `https://raw.githubusercontent.com/nobinobi9000/japan-stock-screener/main/docs/latest.json` |
| **書き込み** | japan-stock-screener バッチ（stock_screener_v3_multiplan.py） |
| **読み込み** | Kabu Note の `src/hooks/useScreenerData.js` |
| **公開範囲** | 誰でもアクセス可能（GitHub Pages） |

**フォーマット:**
```json
{
  "date": "2026-08-28",
  "top3": [
    {
      "code": "6197",
      "name": "ソラスト",
      "score": 70.0,
      "price": 1118.0,
      "risk_tag": "🟡標準",
      "sector": "サービス業",
      "pattern": "⛩一目好転"
    }
  ],
  "sector_heatmap": [
    {
      "name": "鉄鋼",
      "avg_score": 48.3,
      "stock_count": 3
    }
  ]
}
```

**注意:** 原則3により、無料公開できるのは `top3`（厳選3銘柄）と `sector_heatmap` のみ。全銘柄データは非公開。

---

### 1-2. Supabase 非公開テーブル（screener → kabu-signal）

kabu-signal の `screener/jvqm_screener.py` が、japan-stock-screener バッチが書き込む以下のテーブルを service_role key で直接参照する。

| テーブル名 | 書き込み | 読み込み | 用途 |
|------------|---------|---------|------|
| `screener_snapshots` | japan-stock-screener | kabu-signal/jvqm_screener.py | スナップショットのメタ情報（日付・成功率など） |
| `screener_stock_snapshots` | japan-stock-screener | kabu-signal/jvqm_screener.py | 全銘柄のスコア・指標・fetch_success フラグ |

**アクセス方法（kabu-signal側）:**
```python
# screener/jvqm_screener.py
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

requests.get(f"{SUPABASE_URL}/rest/v1/screener_snapshots", ...)
requests.get(f"{SUPABASE_URL}/rest/v1/screener_stock_snapshots", ...)
```

---

### 1-3. Supabase 共有テーブル（Kabu Note → kabu-signal）

kabu-signal の `screener/user_matcher.py` が、Kabu Note の Supabase プロジェクトから以下のテーブルを service_role key で直接読む。

| テーブル名 | 書き込み | 読み込み | 用途 |
|------------|---------|---------|------|
| `watchlist` | Kabu Note ユーザー | kabu-signal/user_matcher.py | ウォッチリスト銘柄との突合 |
| `holdings` | Kabu Note ユーザー | kabu-signal/user_matcher.py | 保有銘柄との突合・損益アラート |
| `pnl_alert_settings` | （Kabu Note 側UI未実装） | kabu-signal/user_matcher.py | 損益アラート閾値の取得 |
| `screener_stock_snapshots` | japan-stock-screener | kabu-signal/user_matcher.py | 銘柄取得失敗の検知（原則5） |

**アクセス方法（kabu-signal側）:**
```python
# screener/user_matcher.py
w_resp = requests.get(f"{SUPABASE_URL}/rest/v1/watchlist", headers=_headers(), params={"select": "user_id,code"})
h_resp = requests.get(f"{SUPABASE_URL}/rest/v1/holdings", headers=_headers(), params={"select": "user_id,code"})
```

---

## 2. データの受け渡しの方向とタイミング

```
時刻（JST）

平日 市場中〜引け後
  japan-stock-screener バッチ実行
  ├─ docs/latest.json を更新（GitHub Pages）
  └─ screener_snapshots / screener_stock_snapshots を Supabase に UPSERT

Kabu Note ユーザーがアプリを開いたとき
  └─ useScreenerData.js が latest.json を fetch
       └─ 当日キャッシュ（localStorage）があればスキップ

平日 16:00
  Kabu Note update_stocks.py 実行
  └─ stocks / daily_history / dividend_records を Supabase に更新

平日 21:00
  kabu-signal バッチ実行
  ├─ jvqm_screener.py: screener_snapshots を読んでスコアリング
  ├─ user_matcher.py: Kabu Note の watchlist/holdings を参照
  └─ push_sender.py: ユーザー個別に PWA Push 通知送信
```

---

## 3. 現状は連携していないが、将来連携させたい・させる可能性がある箇所

### 3-1. `pnl_alert_settings` テーブル（優先度: 高）

- **現状:** kabu-signal の `user_matcher.py` は `pnl_alert_settings` テーブルを読む実装済み
- **不足:** Kabu Note 側に閾値を設定するUIが**未実装**
- **将来:** Settings.jsx または Dashboard.jsx に「損益アラート設定（±X%）」UIを追加し、`pnl_alert_settings` テーブルに書き込む
- **制約:** 閾値はユーザーが自分で設定するものに限る（原則1: システム側からデフォルト推奨値を提示しない）

```sql
-- pnl_alert_settings テーブルスキーマ（想定）
CREATE TABLE pnl_alert_settings (
  user_id UUID PRIMARY KEY,
  threshold_pct NUMERIC NOT NULL  -- 例: 10.0 = ±10%
);
```

### 3-2. kabu-signal のシグナルを Kabu Note で表示（優先度: 中）

- **現状:** kabu-signal は独自の Web UI（Next.js）で signals/latest.json を表示
- **将来:** Kabu Note のダッシュボードに「シグナルカード」を追加して、自分の保有銘柄に該当するシグナルを表示できるようにする
- **注意:** kabu-signal の `/api/signals` エンドポイントは認証済みユーザーのみ（原則3）。Kabu Note から呼ぶには cross-origin 認証の仕組みが必要

### 3-3. japan-stock-screener のスナップショットを Kabu Note で参照（優先度: 低）

- **現状:** Kabu Note は `stocks` テーブル（update_stocks.py が yfinance から取得）を独自に持っている
- **理想:** screener の `screener_stock_snapshots` から直接読むことで、yfinance の二重取得をなくす
- **制約:** 現状の Kabu Note バッチ（update_stocks.py）は screener とは独立して動作しており、完全統合は大きな設計変更が必要

### 3-4. Kabu Note の holdings を screener のウォッチリストに同期（優先度: 低）

- 保有銘柄が自動的にスクリーナーの監視対象に加わると、新規上場・分割イベント等の検知が可能になる

---

## 4. 連携処理を変更した際に他アプリに影響が出る条件

### Kabu Note 側の変更が kabu-signal に影響する条件

- **`holdings` テーブルのカラム構成を変更した場合**
  - `user_matcher.py` が `select=user_id,code,cost_price` で参照しているため、これらのカラム名変更・削除は即座にバッチ失敗を引き起こす
- **`watchlist` テーブルのカラム構成を変更した場合**
  - `user_matcher.py` が `select=user_id,code` で参照。同上
- **RLS ポリシーを変更した場合（service_role を制限する場合）**
  - service_role key でのアクセスが拒否されると kabu-signal が全ユーザーデータを読めなくなる
- **Supabase プロジェクトを移行した場合**
  - kabu-signal の `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` の更新が必要
- **`pnl_alert_settings` テーブルを追加・スキーマ変更した場合**
  - `user_matcher.py` の `fetch_pnl_alert_thresholds()` が対応するカラム名を期待している

### japan-stock-screener 側の変更が Kabu Note に影響する条件

- **`latest.json` のスキーマを変更した場合**
  - `useScreenerData.js` が `data.top3` / `data.sector_heatmap` を参照しているため、キーの変更・削除で表示が壊れる
  - `ScreenerWidget.jsx` が `stock.code / stock.name / stock.score / stock.risk_tag / stock.sector` を参照
  - `Market.jsx` が `s.name / s.avg_score / s.stock_count` を参照
- **GitHub Pages の URL が変わった場合**
  - `useScreenerData.js` の `SCREENER_URL` 定数（`https://raw.githubusercontent.com/nobinobi9000/japan-stock-screener/main/docs/latest.json`）を更新が必要
- **`latest.json` の更新が止まった場合（バッチ失敗）**
  - Kabu Note は localStorage の古いキャッシュを使い続けるため、日付表示が「最終更新: YYYY-MM-DD」となる（ウィジェットは壊れない）

### japan-stock-screener 側の変更が kabu-signal に影響する条件

- **`screener_snapshots` / `screener_stock_snapshots` のスキーマを変更した場合**
  - `jvqm_screener.py` が参照するカラムが変わると即座にバッチ失敗
  - 影響するカラム: `snapshot_date`, `is_incomplete`, `schema_version`, `jvqm_score`, `fetch_success` 等
- **Supabase への書き込みが止まった場合（バッチ失敗）**
  - `jvqm_screener.py` の鮮度ガードが発動し、kabu-signal は「本日配信なし」通知を送信（原則5の正常動作）

---

## 5. Supabase プロジェクトの共有関係

```
Supabase プロジェクト: nhkgyipjeithytqqfuda（Kabu Note / kabu-signal 共有）
  ├─ Kabu Note が書き込む: holdings, watchlist, transactions, dividend_records, ...
  ├─ kabu-signal が読む: holdings(user_id,code,cost_price), watchlist(user_id,code), pnl_alert_settings
  └─ japan-stock-screener が書き込む: screener_snapshots, screener_stock_snapshots
       └─ kabu-signal/jvqm_screener.py が読む

japan-stock-screener のバッチ は 同一 Supabase プロジェクトに screener_snapshots 等を書き込む
```

**⚠️ 重要:** kabu-signal は Kabu Note のユーザーデータに service_role key（全権限）でアクセスする。RLS を bypass できる状態のため、テーブルスキーマ変更・RLS変更時は必ず kabu-signal バッチへの影響を確認すること。

---

## 6. 連携における絶対原則チェックリスト（変更時に必ず確認）

| 原則 | チェック内容 |
|------|------------|
| 原則1 | kabu-signal の通知文言に「推奨」「おすすめ」「買い時」等が混入していないか |
| 原則2 | Kabu Note や kabu-signal が yfinance を独自に呼び出すコードが増えていないか。update_stocks.py のみ許可 |
| 原則3 | latest.json の `top3` / `sector_heatmap` 以外の全銘柄データが公開経路（GitHub Pages）に出ていないか |
| 原則4 | 保有銘柄・ウォッチリストに基づく通知がDiscord等の共有チャンネルに流れていないか |
| 原則5 | screener バッチ失敗時に kabu-signal が「配信なし」を明示的に通知しているか |
| 原則6 | holdings/watchlist の user_id をログ・URLパラメータに含めていないか |
