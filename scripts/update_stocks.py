"""
Kabu Note - 株価自動更新スクリプト
平日16時（JST）にGitHub Actionsで実行される。

処理フロー:
  1. Supabase の holdings テーブルから全ユーザーの証券コードを取得
  2. yfinance でバッチ取得（企業名・株価・配当など）
  3. stocks テーブルを UPSERT
  4. ユーザーごとの日次資産を集計して daily_history テーブルを UPSERT
  5. 株式分割・併合の検知
  6. 配当履歴(stock_dividend_events)の同期・ユーザーごとの確定記録(dividend_records)作成
"""

import os
import re
import time
from collections import defaultdict
from datetime import datetime, date

import yfinance as yf
import jpholiday
import pytz
from deep_translator import GoogleTranslator
from supabase import create_client

# ==========================================
# 定数・設定
# ==========================================
SUFFIX = ".T"
JST    = pytz.timezone("Asia/Tokyo")

# 配当履歴の取得対象期間（これより前の配当は取得しない。年度別グラフ表示に
# 必要な範囲＋バッファ）
DIVIDEND_HISTORY_SINCE = date(2024, 1, 1)


# ==========================================
# 補助関数
# ==========================================

def is_tse_holiday(target: date) -> bool:
    if target.weekday() >= 5:
        return True
    if jpholiday.is_holiday(target):
        return True
    if (target.month == 12 and target.day == 31) or \
       (target.month == 1  and target.day <= 3):
        return True
    return False


def get_supabase_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def get_dividend_month(ticker: yf.Ticker) -> str:
    """参考表示用（Dashboard/Stocks画面の「配当額・配当月」列）。
    確定記録(dividend_records)の作成にはこの値を使わない。"""
    try:
        dividends = ticker.dividends
        if dividends is not None and not dividends.empty:
            last_date = dividends.index[-1]
            if hasattr(last_date, "to_pydatetime"):
                last_date = last_date.to_pydatetime()
            return last_date.strftime("%Y/%m")
    except Exception:
        pass
    return ""


def get_dividend_history(ticker: yf.Ticker) -> list:
    """配当履歴を [(ex_date, rate_per_share), ...] で返す（DIVIDEND_HISTORY_SINCE以降のみ）。
    中間配当・期末配当など、同一銘柄内の複数の権利確定日を取りこぼさないよう、
    最新の1件だけでなく全件を返す。"""
    try:
        dividends = ticker.dividends
        if dividends is None or dividends.empty:
            return []
        result = []
        for ts, rate in dividends.items():
            d = ts.to_pydatetime().date() if hasattr(ts, "to_pydatetime") else ts
            if d >= DIVIDEND_HISTORY_SINCE:
                result.append((d, float(rate)))
        return result
    except Exception:
        return []


def get_splits(ticker: yf.Ticker) -> list:
    """株式分割・併合履歴を [(date, ratio), ...] のリストで返す。ratio>1=分割、ratio<1=併合。"""
    try:
        splits = ticker.splits
        if splits is None or splits.empty:
            return []
        result = []
        for ts, ratio in splits.items():
            d = ts.to_pydatetime().date() if hasattr(ts, "to_pydatetime") else ts
            result.append((d, float(ratio)))
        return result
    except Exception:
        return []


def _translate(translator: GoogleTranslator, text: str) -> str:
    if not text:
        return ""
    try:
        return translator.translate(text) or text
    except Exception:
        return text


def get_formatted_name(translator: GoogleTranslator, info: dict) -> str:
    raw = info.get("longName") or info.get("shortName") or ""
    if not raw:
        return ""
    name = _translate(translator, raw)
    # 日本語に変換されなかった場合は shortName を使用
    if not re.search(r"[ぁ-んァ-ン一-龥]", name or ""):
        name = info.get("shortName") or raw
    # 不要サフィックスを除去
    for sfx in ["Ltd.", "LTD.", "ltd.", "Inc.", "INC.", "inc.",
                "Corporation", "CO.,", "Co.,", "CO.LTD.", "Co.Ltd.", "K.K.", ","]:
        name = name.replace(sfx, "")
    name = name.strip()
    # 「株式会社」を補完
    if not any(k in name for k in ["株式会社", "（株）", "(株)"]):
        name = name + "株式会社"
    else:
        name = name.replace("(株)", "株式会社").replace("（株）", "株式会社")
    return name.strip()


# ==========================================
# yfinance バッチ取得
# ==========================================

def fetch_stock_data(codes: list) -> dict:
    unique = list(dict.fromkeys(codes))
    print(f"  yfinance 取得: {len(unique)} 銘柄")
    translator = GoogleTranslator(source="auto", target="ja")
    cache = {}

    for code in unique:
        symbol = f"{code}{SUFFIX}"
        print(f"  [{code}] 取得中...")
        try:
            tkr  = yf.Ticker(symbol)
            info = tkr.info
            fast = tkr.fast_info

            current_price  = fast.last_price or 0
            previous_close = fast.previous_close or 0
            price_change   = round(current_price - previous_close, 1)

            cache[code] = {
                "name_ja":       get_formatted_name(translator, info),
                "name_en":       info.get("longName") or info.get("shortName") or "",
                "sector":        _translate(translator, info.get("sector") or info.get("industry") or ""),
                "price":         current_price,
                "price_change":  price_change,
                "dividend_rate": info.get("dividendRate") or 0,
                "dividend_month": get_dividend_month(tkr),
                "dividend_history": get_dividend_history(tkr),
                "currency":      info.get("currency") or "JPY",
                "splits":        get_splits(tkr),
            }
            print(f"    ✅ {cache[code]['name_ja']}  終値={current_price}  前日差={price_change:+}")

        except Exception as e:
            print(f"    ❌ [{code}] 取得失敗: {e}")
            cache[code] = {
                "name_ja": "", "name_en": "", "sector": "",
                "price": 0, "price_change": 0,
                "dividend_rate": 0, "dividend_month": "", "dividend_history": [],
                "currency": "JPY",
                "splits": [],
            }
        time.sleep(1)

    return cache


# ==========================================
# 株式分割・併合の検知
# ==========================================

def detect_stock_splits(supabase, holdings: list, stock_cache: dict) -> int:
    """保有開始日より後の分割・併合イベントを検知し、pendingレコードを作成する。
    holdings.quantity/cost_price はここでは書き換えない（ユーザー確認方式、原則: 財務データを無断で変更しない）。
    """
    created = 0
    for h in holdings:
        code    = h["code"]
        splits  = stock_cache.get(code, {}).get("splits", [])
        if not splits:
            continue

        holding_created = h["created_at"]
        if isinstance(holding_created, str):
            holding_created = datetime.fromisoformat(holding_created.replace("Z", "+00:00")).date()
        elif hasattr(holding_created, "date"):
            holding_created = holding_created.date()

        for split_date, ratio in splits:
            if split_date <= holding_created:
                continue  # 保有開始前の分割は無視（購入時の株価に既に反映されている）

            existing = supabase.table("stock_split_events") \
                .select("id") \
                .eq("holding_id", h["id"]) \
                .eq("split_date", split_date.isoformat()) \
                .execute()
            if existing.data:
                continue  # 既に検知済み

            supabase.table("stock_split_events").insert({
                "user_id":    h["user_id"],
                "holding_id": h["id"],
                "code":       code,
                "split_date": split_date.isoformat(),
                "ratio":      ratio,
                "status":     "pending",
            }).execute()
            print(f"  検知: {code} {split_date} 比率{ratio} (holding_id={h['id'][:8]}...)")
            created += 1

    print(f"  新規検知 {created} 件")
    return created


# ==========================================
# 配当履歴の同期・ユーザーごとの確定記録作成
# ==========================================

def _add_to_annual_summary(supabase, user_id: str, year: int, received_dividends: float) -> None:
    """annual_summary.received_dividends に加算する（既存行があれば加算、無ければ新規作成）。"""
    existing = supabase.table("annual_summary") \
        .select("realized_pnl, received_dividends") \
        .eq("user_id", user_id).eq("year", year).maybe_single().execute()
    s = existing.data
    supabase.table("annual_summary").upsert({
        "user_id":            user_id,
        "year":               year,
        "realized_pnl":       float(s["realized_pnl"]) if s else 0,
        "received_dividends": (float(s["received_dividends"]) if s else 0) + received_dividends,
        "updated_at":         datetime.now(JST).isoformat(),
    }, on_conflict="user_id,year").execute()


def sync_dividend_events(supabase, stock_cache: dict) -> list:
    """stock_dividend_events(銘柄ごとの配当履歴、追記専用)を同期し、
    新規に検知したイベントのリスト [(code, ex_date, rate), ...] を返す。"""
    new_events = []
    for code, data in stock_cache.items():
        history = data.get("dividend_history", [])
        if not history:
            continue

        existing = supabase.table("stock_dividend_events") \
            .select("ex_date").eq("code", code).execute()
        known_dates = {row["ex_date"] for row in (existing.data or [])}

        for ex_date, rate in history:
            ex_date_str = ex_date.isoformat()
            if ex_date_str in known_dates:
                continue
            supabase.table("stock_dividend_events").insert({
                "code":           code,
                "ex_date":        ex_date_str,
                "rate_per_share": rate,
            }).execute()
            new_events.append((code, ex_date, rate))
            print(f"  新規配当イベント検知: {code} {ex_date_str} 1株{rate}円")

    print(f"  新規配当イベント {len(new_events)} 件")
    return new_events


def create_dividend_snapshots(supabase, holdings: list, new_events: list) -> int:
    """新規に検知した配当イベントについて、保有開始日より後であれば
    その時点の保有株数でユーザーごとの確定記録(dividend_records)を作成する。
    権利確定日から検知までのタイムラグを最短化することで、売却による
    金額のズレ・全量売却による記録の消失を防ぐ。"""
    if not new_events:
        return 0

    created = 0
    for code, ex_date, rate in new_events:
        for h in holdings:
            if h["code"] != code:
                continue

            holding_created = h["created_at"]
            if isinstance(holding_created, str):
                holding_created = datetime.fromisoformat(holding_created.replace("Z", "+00:00")).date()
            elif hasattr(holding_created, "date"):
                holding_created = holding_created.date()

            if ex_date <= holding_created:
                continue  # 保有開始前の配当は対象外

            quantity     = int(float(h["quantity"]))
            amount       = round(rate * quantity)
            payment_year = ex_date.year + 1 if ex_date.month >= 10 else ex_date.year

            supabase.table("dividend_records").insert({
                "user_id":        h["user_id"],
                "code":           code,
                "year":           ex_date.year,
                "month":          ex_date.month,
                "ex_date":        ex_date.isoformat(),
                "payment_year":   payment_year,
                "amount":         amount,
                "quantity":       quantity,
                "auto_confirmed": True,
            }).execute()

            _add_to_annual_summary(supabase, h["user_id"], payment_year, amount)

            print(f"  確定記録作成: {code} ({ex_date.isoformat()}) {amount:,}円 → "
                  f"{payment_year}年収入 (user: {h['user_id'][:8]}...)")
            created += 1

    print(f"  確定記録 {created} 件作成")
    return created


# ==========================================
# メイン処理
# ==========================================

def main():
    now      = datetime.now(JST)
    today    = now.date()
    today_str = today.isoformat()
    print(f"--- 処理開始: {now.strftime('%Y-%m-%d %H:%M:%S')} ---")

    force = os.environ.get("FORCE_RUN", "").lower() in ("true", "1", "yes")
    if not force and is_tse_holiday(today):
        print("【判定】東証休場日のためスキップします。（強制実行: FORCE_RUN=true で上書き可）")
        return
    if force:
        print("【判定】FORCE_RUN=true のため休場日チェックをスキップします。")

    supabase = get_supabase_client()

    # ── 1. holdings から全証券コードを取得 ──────────────────────────
    print("\n--- holdings 取得中 ---")
    res = supabase.table("holdings").select("id, code, quantity, cost_price, user_id, created_at").execute()
    holdings = res.data or []

    if not holdings:
        print("【警告】保有銘柄がありません。処理を終了します。")
        return

    codes = list(dict.fromkeys(h["code"] for h in holdings))
    print(f"  対象コード: {codes}")

    # ── 2. yfinance でバッチ取得 ─────────────────────────────────────
    print("\n--- yfinance 取得中 ---")
    stock_cache = fetch_stock_data(codes)

    # ── 3. stocks テーブルを UPSERT ──────────────────────────────────
    print("\n--- stocks テーブル更新中 ---")
    upsert_rows = []
    for code, data in stock_cache.items():
        upsert_rows.append({
            "code":           code,
            "name_ja":        data["name_ja"],
            "name_en":        data["name_en"],
            "sector":         data["sector"],
            "price":          data["price"],
            "price_change":   data["price_change"],
            "dividend_rate":  data["dividend_rate"],
            "dividend_month": data["dividend_month"],
            "currency":       data["currency"],
            "updated_at":     now.isoformat(),
        })

    supabase.table("stocks").upsert(upsert_rows).execute()
    print(f"  {len(upsert_rows)} 件 UPSERT 完了")

    # ── 4. ユーザーごとの日次資産を集計して daily_history を UPSERT ──
    print("\n--- daily_history 更新中 ---")
    user_totals = defaultdict(lambda: {"market": 0.0, "cost": 0.0})

    for h in holdings:
        code  = h["code"]
        price = stock_cache.get(code, {}).get("price", 0)
        qty   = float(h["quantity"])
        cost  = float(h["cost_price"])

        user_totals[h["user_id"]]["market"] += price * qty
        user_totals[h["user_id"]]["cost"]   += cost  * qty

    history_rows = []
    for user_id, totals in user_totals.items():
        mkt  = round(totals["market"], 1)
        cst  = totals["cost"]
        rate = round((mkt - cst) / cst * 100, 2) if cst > 0 else 0.0
        history_rows.append({
            "user_id":            user_id,
            "date":               today_str,
            "total_market_value": mkt,
            "total_pnl_rate":     rate,
        })
        print(f"  user={user_id[:8]}...  資産={mkt:,.0f}円  損益率={rate:+.2f}%")

    supabase.table("daily_history").upsert(
        history_rows,
        on_conflict="user_id,date"
    ).execute()
    print(f"  {len(history_rows)} ユーザー分 UPSERT 完了")

    # ── 5. 株式分割・併合の検知（pendingレコード作成のみ、自動調整はしない）──
    print("\n--- 株式分割・併合 検知中 ---")
    detect_stock_splits(supabase, holdings, stock_cache)

    # ── 6. 配当履歴の同期・ユーザーごとの確定記録作成 ─────────────────
    print("\n--- 配当履歴の同期中 ---")
    new_events = sync_dividend_events(supabase, stock_cache)
    create_dividend_snapshots(supabase, holdings, new_events)

    print(f"\n--- 全処理完了 ---")


if __name__ == "__main__":
    main()
