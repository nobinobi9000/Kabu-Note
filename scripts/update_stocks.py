"""
Kabu Note - 株価自動更新スクリプト
平日16時（JST）にGitHub Actionsで実行される。

処理フロー:
  1. Supabase の holdings テーブルから全ユーザーの証券コードを取得
  2. yfinance でバッチ取得（企業名・株価・配当など）
  3. stocks テーブルを UPSERT
  4. ユーザーごとの日次資産を集計して daily_history テーブルを UPSERT
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
                "currency":      info.get("currency") or "JPY",
            }
            print(f"    ✅ {cache[code]['name_ja']}  終値={current_price}  前日差={price_change:+}")

        except Exception as e:
            print(f"    ❌ [{code}] 取得失敗: {e}")
            cache[code] = {
                "name_ja": "", "name_en": "", "sector": "",
                "price": 0, "price_change": 0,
                "dividend_rate": 0, "dividend_month": "", "currency": "JPY",
            }
        time.sleep(1)

    return cache


# ==========================================
# メイン処理
# ==========================================

def main():
    now      = datetime.now(JST)
    today    = now.date()
    today_str = today.isoformat()
    print(f"--- 処理開始: {now.strftime('%Y-%m-%d %H:%M:%S')} ---")

    if is_tse_holiday(today):
        print("【判定】東証休場日のためスキップします。")
        return

    supabase = get_supabase_client()

    # ── 1. holdings から全証券コードを取得 ──────────────────────────
    print("\n--- holdings 取得中 ---")
    res = supabase.table("holdings").select("code, quantity, cost_price, user_id").execute()
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

    print(f"\n--- 全処理完了 ---")


if __name__ == "__main__":
    main()
