"""
Kabu Note - 株価自動更新スクリプト
平日17時（JST）にGitHub Actionsで実行される
（japan-stock-screenerの完了(〜16:30 JST)を待ってから動く、2026-09-22変更）。

処理フロー:
  0. screener_snapshots の最新 snapshot_date(=S、データ基準日)を取得する。
     取得できなければ何も書かずに非ゼロ終了する。
  1. Supabase の holdings テーブルから全ユーザーの証券コードを取得
  2. 企業名・業種・株価は screener_stock_snapshots の snapshot_date=S の行から取得
     （japan-stock-screenerがJPX公式リストを元に毎日生成する日本語名。
     翻訳は行わない。2026-09-22: 旧Google翻訳方式はCI環境からのアクセスが
     頻繁にブロックされ、英語名のまま保存される不具合が常態化していたため廃止）。
     Sに有効な行が無い銘柄は stocks の既存値(price等)を維持し、0で上書きしない。
  3. 配当・株式分割情報のみ yfinance でバッチ取得
  4. stocks テーブルを UPSERT
  5. ユーザーごとの日次資産を集計して daily_history テーブルを UPSERT（date=S）
  6. 株式分割・併合の検知
  7. 配当履歴(stock_dividend_events)の同期・ユーザーごとの確定記録(dividend_records)作成

基準日の考え方（2026-10-10 修正）:
  処理の基準日は「起動時刻の日付」ではなく「スナップショットの取引日 S」。
  GitHub Actions の schedule は数時間〜終日遅れることが常態のため、起動時刻で
  処理の可否・日付ラベルを決めると、遅延起動の日に全処理がスキップされたり
  履歴の日付がずれたりする。何度・いつ走っても同じ結果になる(冪等)ように、
  起動時刻は updated_at とログにだけ使う。東証カレンダーは「期待取引日 T」を
  求めて S<T を警告(非ゼロ終了)するための診断にだけ使い、処理の可否には使わない。
  DRY_RUN=true の場合は読み取りのみを行い、書込み(insert/upsert/update/delete/rpc)は実行しない。
"""

import calendar
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, date, time as dtime, timedelta

import yfinance as yf
import jpholiday
import pytz
from supabase import create_client

# ==========================================
# 定数・設定
# ==========================================
SUFFIX = ".T"
JST    = pytz.timezone("Asia/Tokyo")

# 配当履歴の取得対象期間（これより前の配当は取得しない。年度別グラフ表示に
# 必要な範囲＋バッファ）
DIVIDEND_HISTORY_SINCE = date(2024, 1, 1)

# 期待取引日の判定に使う「その日のスナップショットが出揃っているはずの時刻」(JST)。
# japan-stock-screener の watchdog の最終確認(未配信ならエラーメール)時刻に揃えた値。
SNAPSHOT_EXPECTED_BY = dtime(20, 0)


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


def expected_trading_date(now_jst: datetime) -> date:
    """起動時刻(JST)の時点で、スナップショットが出揃っているはずの最新の取引日(T)を返す。
    診断(S<T の警告)にだけ使う。処理の可否には使わない。
    SNAPSHOT_EXPECTED_BY(20:00 JST)より前なら前日扱いとし、休場日なら営業日まで遡る。"""
    if now_jst.tzinfo is not None:
        now_jst = now_jst.astimezone(JST)
    d = now_jst.date()
    if now_jst.time() < SNAPSHOT_EXPECTED_BY:
        d -= timedelta(days=1)
    while is_tse_holiday(d):
        d -= timedelta(days=1)
    return d


def get_supabase_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("true", "1", "yes")


# 書込み系の操作名。DRY_RUN では実行せず、行数だけをログに出す（中身は出さない）。
_WRITE_OPS = ("insert", "upsert", "update", "delete")


class _NoopExecution:
    """DRY_RUN で書込みを実行しないときに返すダミー。チェーンされたメソッドを全て受け流す。"""
    data = []
    count = None

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def execute(self):
        return self


class _DryRunTable:
    def __init__(self, table, name):
        self._table = table
        self._name  = name

    def __getattr__(self, attr):
        target = getattr(self._table, attr)
        if attr in _WRITE_OPS:
            def skipped(payload=None, *args, **kwargs):
                n = len(payload) if isinstance(payload, list) else 1
                print(f"  [DRY_RUN] 書込みスキップ: {self._name}.{attr} ({n} 行)")
                return _NoopExecution()
            return skipped
        return target


class DryRunClient:
    """読み取りだけを本物のクライアントに委譲し、書込み(insert/upsert/update/delete/rpc)は
    実行せずにログへ出すだけにするラッパー(DRY_RUN=true 用)。"""

    def __init__(self, client):
        self._client = client

    def table(self, name):
        return _DryRunTable(self._client.table(name), name)

    def rpc(self, fn, params=None, *args, **kwargs):
        print(f"  [DRY_RUN] 書込みスキップ: rpc {fn}")
        return _NoopExecution()


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


# ==========================================
# 銘柄マスタ（社名・業種・終値）取得
# ==========================================

def fetch_latest_snapshot(supabase):
    """screener_snapshots から最新の1行(snapshot_date, is_incomplete, success_rate)を返す。
    行が無ければ None。例外は呼び出し側で扱う。"""
    res = supabase.table("screener_snapshots") \
        .select("snapshot_date, is_incomplete, success_rate") \
        .order("snapshot_date", desc=True).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else None


def fetch_snapshot_prices(supabase, codes: list, snapshot_date: date) -> dict:
    """screener_stock_snapshots の snapshot_date=S の行から社名(日本語)・業種・終値を取得する
    (japan-stock-screener 由来。service_role で読む)。有効な行
    (fetch_success=true かつ終値あり)だけを code をキーにした dict で返す。"""
    if not codes:
        return {}
    res = supabase.table("screener_stock_snapshots") \
        .select("code, name, sector, close_price, fetch_success") \
        .eq("snapshot_date", snapshot_date.isoformat()) \
        .in_("code", codes).execute()
    return {row["code"]: row for row in (res.data or [])
            if row.get("fetch_success") and row.get("close_price")}


def fetch_existing_stocks(supabase, codes: list) -> dict:
    """Sに有効な行が無いコード用のフォールバック（前回保存値を維持するため）。"""
    if not codes:
        return {}
    res = supabase.table("stocks") \
        .select("code, name_ja, sector, price, price_change") \
        .in_("code", codes).execute()
    return {row["code"]: row for row in (res.data or [])}


# ==========================================
# yfinance バッチ取得（配当・株式分割・前日差のみ）
# ==========================================

def fetch_stock_data(supabase, codes: list, snapshot_date: date) -> dict:
    unique = list(dict.fromkeys(codes))

    print(f"  スナップショット取得（社名・業種・終値, 基準日={snapshot_date.isoformat()}）: {len(unique)} 銘柄")
    master   = fetch_snapshot_prices(supabase, unique, snapshot_date)
    existing = fetch_existing_stocks(supabase, [c for c in unique if c not in master])

    print(f"  yfinance 取得（配当・株式分割・前日差のみ）: {len(unique)} 銘柄")
    cache = {}

    for code in unique:
        symbol = f"{code}{SUFFIX}"
        print(f"  [{code}] 取得中...")

        m = master.get(code)
        stale = m is None
        if m:
            name_ja, sector, price = m["name"], m["sector"], m["close_price"]
            stale_change = None
        else:
            # Sに有効な行が無い銘柄: stocks の既存値を維持する(0で上書きしない)。
            # 価格・前日差は「S以前の価格」のままになるため、daily_history の評価にも
            # この価格を使い、件数をログに残す。
            prev = existing.get(code, {})
            name_ja, sector = prev.get("name_ja") or "", prev.get("sector") or ""
            price        = prev.get("price") or 0
            stale_change = prev.get("price_change") or 0
            print(f"    ⚠️ [{code}] 基準日{snapshot_date.isoformat()}の有効な終値なし。"
                  f"stocks の既存値を維持します（price={price}, name={name_ja or '(空)'}）")

        try:
            tkr  = yf.Ticker(symbol)
            info = tkr.info
            fast = tkr.fast_info

            previous_close = fast.previous_close or 0
            price_change   = round(price - previous_close, 1) if previous_close else 0
            if stale:
                price_change = stale_change

            cache[code] = {
                "name_ja":       name_ja,
                "name_en":       info.get("longName") or info.get("shortName") or "",
                "sector":        sector,
                "price":         price,
                "price_stale":   stale,
                "price_change":  price_change,
                "dividend_rate": info.get("dividendRate") or 0,
                "dividend_month": get_dividend_month(tkr),
                "dividend_history": get_dividend_history(tkr),
                "currency":      info.get("currency") or "JPY",
                "splits":        get_splits(tkr),
            }
            print(f"    ✅ {name_ja}  終値={price}  前日差={price_change:+}")

        except Exception as e:
            # 配当・分割・前日差の取得失敗。社名・業種・株価はスナップショット由来のため影響を受けない。
            print(f"    ❌ [{code}] yfinance取得失敗(配当・分割・前日差のみ影響): {e}")
            cache[code] = {
                "name_ja": name_ja, "name_en": "", "sector": sector,
                "price": price, "price_stale": stale,
                "price_change": stale_change if stale else 0,
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
            print(f"  検知: {code} {split_date} 比率{ratio}")
            created += 1

    print(f"  新規検知 {created} 件")
    return created


# ==========================================
# 配当履歴の同期・ユーザーごとの確定記録作成
# ==========================================

def _add_to_annual_summary(supabase, user_id: str, year: int, received_dividends: float) -> None:
    """annual_summary.received_dividends に加算する。DB側のRPCで原子的に加算するため、
    「読んで足して書き戻す」方式特有の加算漏れ・上書きのリスクが無い
    (2026-09-29: 旧実装は対象行が無いとexisting自体がNoneになりクラッシュしていた)。"""
    supabase.rpc("increment_annual_summary", {
        "p_user_id":             user_id,
        "p_year":                year,
        "p_realized_pnl":        0,
        "p_received_dividends":  received_dividends,
    }).execute()


DEFAULT_DIVIDEND_PAYMENT_LAG_MONTHS = 3  # 会社ごとの設定が無い場合の既定ラグ(月)


def add_months(d: date, months: int) -> date:
    """dにmonthsヶ月を加算した日付を返す（月末日のはみ出しはその月の末日に丸める）。"""
    total = d.month - 1 + months
    year  = d.year + total // 12
    month = total % 12 + 1
    day   = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def get_dividend_payment_lags(supabase, codes: list) -> dict:
    """stocksテーブルから会社ごとの配当支払ラグ(月)を取得する。
    未登録銘柄はDEFAULT_DIVIDEND_PAYMENT_LAG_MONTHSを使う。"""
    if not codes:
        return {}
    res = supabase.table("stocks").select("code, dividend_payment_lag_months") \
        .in_("code", codes).execute()
    return {row["code"]: row.get("dividend_payment_lag_months") or DEFAULT_DIVIDEND_PAYMENT_LAG_MONTHS
            for row in (res.data or [])}


def refresh_dividend_status(supabase, ref_date: date) -> int:
    """推定支払日(payment_date)がデータ基準日(ref_date)以前の scheduled レコードを
    confirmed に更新する(2026-09-13追加。年をまたぐ配当の受取年管理を正しく行うための状態遷移)。
    判定は起動時刻ではなくデータ基準日で行う(2026-10-10)。"""
    res = supabase.table("dividend_records") \
        .select("id") \
        .eq("status", "scheduled") \
        .lte("payment_date", ref_date.isoformat()) \
        .execute()
    ids = [row["id"] for row in (res.data or [])]
    if not ids:
        return 0
    supabase.table("dividend_records").update({"status": "confirmed"}) \
        .in_("id", ids).execute()
    print(f"  scheduled→confirmed に更新: {len(ids)} 件")
    return len(ids)


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


def create_dividend_snapshots(supabase, holdings: list, new_events: list, ref_date: date) -> int:
    """新規に検知した配当イベントについて、保有開始日より後であれば
    その時点の保有株数でユーザーごとの確定記録(dividend_records)を作成する。
    権利確定日から検知までのタイムラグを最短化することで、売却による
    金額のズレ・全量売却による記録の消失を防ぐ。

    受取年(payment_year)は、以前は「権利確定日が10月以降なら翌年」という
    全銘柄共通の固定ルールで推測していたが、会社ごとに配当支払日までの
    タイムラグ(2〜3ヶ月程度)が異なるため誤分類が起きていた。会社ごとの
    ラグ(stocks.dividend_payment_lag_months)から推定支払日(payment_date)を
    算出し、そのyearをpayment_yearとする(2026-09-13、根本原因の修正)。
    支払日が未到来のものはstatus='scheduled'として区別し、実際に支払日を
    過ぎたら refresh_dividend_status() が'confirmed'に更新する。
    scheduled/confirmed の判定はデータ基準日(ref_date)で行い、起動時刻には依存しない
    (2026-10-10)。"""
    if not new_events:
        return 0

    lag_by_code = get_dividend_payment_lags(supabase, list({code for code, _, _ in new_events}))

    created = 0
    for code, ex_date, rate in new_events:
        # 同一銘柄を複数の証券会社に分けて保有しているユーザーは株数を合算する。
        # dividend_recordsは(user_id, code, ex_date)が一意制約のため、保有行ごとに
        # 個別insertすると2件目で重複キーエラーになりバッチ全体が止まっていた
        # (2026-09-29発見。保有開始前の分は従来通り対象外)。
        quantity_by_user: dict[str, int] = {}
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

            uid = h["user_id"]
            quantity_by_user[uid] = quantity_by_user.get(uid, 0) + int(float(h["quantity"]))

        for user_id, quantity in quantity_by_user.items():
            amount       = round(rate * quantity)
            lag_months   = lag_by_code.get(code, DEFAULT_DIVIDEND_PAYMENT_LAG_MONTHS)
            payment_date = add_months(ex_date, lag_months)
            payment_year = payment_date.year
            status       = "scheduled" if payment_date > ref_date else "confirmed"

            supabase.table("dividend_records").insert({
                "user_id":        user_id,
                "code":           code,
                "year":           ex_date.year,
                "month":          ex_date.month,
                "ex_date":        ex_date.isoformat(),
                "payment_date":   payment_date.isoformat(),
                "payment_year":   payment_year,
                "status":         status,
                "amount":         amount,
                "quantity":       quantity,
                "auto_confirmed": True,
            }).execute()

            _add_to_annual_summary(supabase, user_id, payment_year, amount)

            # 公開ログのため、ユーザーID・金額など個人に紐づく情報は出さない(原則6)
            print(f"  確定記録作成: {code} ({ex_date.isoformat()}) → "
                  f"{payment_year}年収入・推定支払日{payment_date.isoformat()}({status})")
            created += 1

    print(f"  確定記録 {created} 件作成")
    return created


# ==========================================
# メイン処理
# ==========================================

def parse_snapshot_date(value) -> date:
    return date.fromisoformat(str(value)[:10])


def report_snapshot_status(snapshot: dict, now: datetime):
    """データ基準日(S)と期待取引日(T)を比較してログに出す。
    戻り値: (S, behind)。behind=True は S<T（スナップショット未到着の疑い）。
    カレンダーは診断にのみ使い、処理の可否は決めない。"""
    ref_date = parse_snapshot_date(snapshot["snapshot_date"])
    expected = expected_trading_date(now)
    launch_is_holiday = is_tse_holiday(now.astimezone(JST).date() if now.tzinfo else now.date())
    print(f"  データ基準日={ref_date.isoformat()} / 期待取引日={expected.isoformat()} / "
          f"起動={now.strftime('%Y-%m-%d %H:%M:%S')} JST"
          f"（起動日は休場日: {'はい' if launch_is_holiday else 'いいえ'}）")

    behind = ref_date < expected
    if behind:
        print(f"【警告】スナップショットが期待取引日に届いていません: データ基準日={ref_date.isoformat()} は"
              f"期待取引日={expected.isoformat()} より前です。株価は{ref_date.isoformat()}時点のままです。"
              f"基準日分の処理は行い、最後に非ゼロ終了します。")
    if is_tse_holiday(ref_date):
        print(f"【警告】データ基準日={ref_date.isoformat()} は東証の休場日です。"
              f"スナップショットの日付の付き方を確認してください。")
    if snapshot.get("is_incomplete"):
        print(f"【警告】不完全なスナップショットです（success_rate={snapshot.get('success_rate')}）。"
              f"取得できた銘柄の終値のみを使用します。")
    return ref_date, behind


def main(now=None, supabase=None, dry_run=None) -> int:
    """終了コードを返す（0=正常、1=異常）。now / supabase / dry_run はテスト用に注入できる。
    now は起動時刻(JST, tz-aware)。updated_at・ログ・期待取引日の診断にだけ使い、
    処理の基準日には使わない。"""
    now = now or datetime.now(JST)
    if dry_run is None:
        dry_run = env_flag("DRY_RUN")
    print(f"--- 処理開始: {now.strftime('%Y-%m-%d %H:%M:%S')} ---")

    if supabase is None:
        supabase = get_supabase_client()
    if dry_run:
        print("【DRY_RUN】読み取りのみ行い、書込みは実行しません。")
        supabase = DryRunClient(supabase)

    # ── 0. データ基準日 S（最新スナップショットの取引日）を取得 ────────
    print("\n--- スナップショット基準日の確認 ---")
    try:
        snapshot = fetch_latest_snapshot(supabase)
    except Exception as e:
        print(f"【エラー】screener_snapshots の取得に失敗しました。書込みを行わず終了します: {e}")
        return 1
    if snapshot is None:
        print("【エラー】screener_snapshots に行がありません。書込みを行わず終了します。")
        return 1
    ref_date, behind = report_snapshot_status(snapshot, now)
    ref_str = ref_date.isoformat()
    final_code = 1 if behind else 0

    # ── 1. holdings から全証券コードを取得 ──────────────────────────
    print("\n--- holdings 取得中 ---")
    res = supabase.table("holdings").select("id, code, quantity, cost_price, user_id, created_at").execute()
    holdings = res.data or []

    if not holdings:
        print("【警告】保有銘柄がありません。処理を終了します。")
        return final_code

    codes = list(dict.fromkeys(h["code"] for h in holdings))
    print(f"  対象コード: {codes}")

    # ── 2. スナップショット(S) + yfinance(配当・分割)でバッチ取得 ───────
    print("\n--- 銘柄データ取得中 ---")
    try:
        stock_cache = fetch_stock_data(supabase, codes, ref_date)
    except Exception as e:
        print(f"【エラー】銘柄データの取得に失敗しました。書込みを行わず終了します: {e}")
        return 1

    stale_codes = [c for c, d in stock_cache.items() if d.get("price_stale")]
    if stale_codes:
        print(f"【注意】基準日{ref_str}の終値が無く、stocks の既存価格（{ref_str}以前の価格）を使う銘柄: "
              f"{len(stale_codes)} 件 {stale_codes}")

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
    # 日付ラベルは起動日ではなくデータ基準日 S。公開ログのため個人別の金額・IDは出さない。
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
            "date":               ref_str,
            "total_market_value": mkt,
            "total_pnl_rate":     rate,
        })

    if stale_codes:
        print(f"  評価に{ref_str}以前の価格を使った銘柄: {len(stale_codes)} 件 {stale_codes}")
    supabase.table("daily_history").upsert(
        history_rows,
        on_conflict="user_id,date"
    ).execute()
    print(f"  {len(history_rows)} ユーザー分 UPSERT 完了（date={ref_str}）")

    # ── 5. 株式分割・併合の検知（pendingレコード作成のみ、自動調整はしない）──
    print("\n--- 株式分割・併合 検知中 ---")
    detect_stock_splits(supabase, holdings, stock_cache)

    # ── 6. 配当履歴の同期・ユーザーごとの確定記録作成 ─────────────────
    print("\n--- 配当履歴の同期中 ---")
    new_events = sync_dividend_events(supabase, stock_cache)
    create_dividend_snapshots(supabase, holdings, new_events, ref_date)
    refresh_dividend_status(supabase, ref_date)

    print(f"\n--- 全処理完了 ---")
    if behind:
        print("【警告】スナップショット未到着の疑いがあるため、非ゼロ終了します（上記の警告を参照）。")
    return final_code


if __name__ == "__main__":
    sys.exit(main())
