"""
update_stocks.py の自動テスト（標準 unittest。本番DB・yfinance・Webhook には一切接続しない）。

実行:
    cd stocks/Kabu-Note
    python -m unittest scripts.test_update_stocks -v

方針:
  - Supabase は偽クライアント(FakeSupabase)で置き換え、書込みを配列に記録する。
  - yfinance は unittest.mock.patch で固定データに差し替える。
  - 壁時計は main(now=...) で注入する（環境変数での時刻上書きは本番コードに無い）。
  - このリポジトリは PUBLIC のため、テストデータはすべて架空
    （実ユーザーID・実金額・キーは入れない）。
"""

import contextlib
import copy
import io
import os
import re
import unittest
from datetime import date, datetime
from unittest import mock

import pandas as pd

try:
    from scripts import update_stocks as us
except ImportError:  # python scripts/test_update_stocks.py で直接実行した場合
    import update_stocks as us


S = "2026-10-09"  # 架空のデータ基準日（金曜）


def jst(y, m, d, hh=0, mm=0):
    return us.JST.localize(datetime(y, m, d, hh, mm))


# ==========================================
# 偽 Supabase クライアント
# ==========================================

class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, rows, fail=None):
        self._rows = list(rows)
        self._fail = fail

    def eq(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) == val]
        return self

    def in_(self, col, vals):
        self._rows = [r for r in self._rows if r.get(col) in vals]
        return self

    def lte(self, col, val):
        self._rows = [r for r in self._rows if r.get(col) is not None and r[col] <= val]
        return self

    def order(self, col, desc=False):
        self._rows.sort(key=lambda r: r[col], reverse=desc)
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError(self._fail)
        return FakeResult(copy.deepcopy(self._rows))


class FakeWrite:
    """insert/upsert/update/delete/rpc の呼び出しを記録する。チェーンされたフィルタも記録する。"""

    def __init__(self, entry):
        self.entry = entry

    def in_(self, col, vals):
        self.entry["filters"].append(("in_", col, list(vals)))
        return self

    def eq(self, col, val):
        self.entry["filters"].append(("eq", col, val))
        return self

    def execute(self):
        return FakeResult([])


class FakeTable:
    def __init__(self, client, name):
        self._c = client
        self._name = name

    def select(self, *_cols):
        fail = self._c.fail_select.get(self._name)
        return FakeQuery(self._c.data.get(self._name, []), fail)

    def _write(self, op, payload, **kwargs):
        entry = {"op": op, "table": self._name, "payload": copy.deepcopy(payload),
                 "kwargs": kwargs, "filters": []}
        self._c.writes.append(entry)
        return FakeWrite(entry)

    def insert(self, payload, **kw):
        return self._write("insert", payload, **kw)

    def upsert(self, payload, **kw):
        return self._write("upsert", payload, **kw)

    def update(self, payload, **kw):
        return self._write("update", payload, **kw)

    def delete(self, **kw):
        return self._write("delete", None, **kw)


class FakeSupabase:
    def __init__(self, data, fail_select=None):
        self.data = data
        self.fail_select = fail_select or {}
        self.writes = []

    def table(self, name):
        return FakeTable(self, name)

    def rpc(self, fn, params=None):
        entry = {"op": "rpc", "table": fn, "payload": copy.deepcopy(params),
                 "kwargs": {}, "filters": []}
        self.writes.append(entry)
        return FakeWrite(entry)

    def writes_to(self, table, op=None):
        return [w for w in self.writes
                if w["table"] == table and (op is None or w["op"] == op)]


# ==========================================
# 架空のテストデータ
# ==========================================

U1 = "11111111-aaaa-bbbb-cccc-000000000001"
U2 = "22222222-aaaa-bbbb-cccc-000000000002"
CREATED = "2026-01-01T00:00:00+00:00"


def make_data(snapshot_rows=None):
    """基準日 S=2026-10-09 のスナップショットと保有を持つ架空データ。
    - 7203: Sに有効な行あり（U1は2行保有＝合算される）
    - 6501: Sに有効な行あり
    - 6502: Sに行はあるが fetch_success=false  → S以前の価格を維持
    - 9999: Sに行なし                           → S以前の価格を維持
    """
    return {
        "screener_snapshots": snapshot_rows if snapshot_rows is not None else [
            {"snapshot_date": "2026-10-08", "is_incomplete": False, "success_rate": 0.95},
            {"snapshot_date": S, "is_incomplete": False, "success_rate": 0.95},
        ],
        "screener_stock_snapshots": [
            {"snapshot_date": "2026-10-08", "code": "7203", "name": "旧名A", "sector": "旧業種",
             "close_price": 2900.0, "fetch_success": True},
            {"snapshot_date": S, "code": "7203", "name": "テストA", "sector": "業種A",
             "close_price": 3000.5, "fetch_success": True},
            {"snapshot_date": S, "code": "6501", "name": "テストB", "sector": "業種B",
             "close_price": 4000.0, "fetch_success": True},
            {"snapshot_date": S, "code": "6502", "name": "テストC", "sector": "業種C",
             "close_price": None, "fetch_success": False},
        ],
        "stocks": [
            {"code": "7203", "name_ja": "古い名A", "sector": "古A", "price": 111.0,
             "price_change": 1.0},
            {"code": "6501", "name_ja": "古い名B", "sector": "古B", "price": 222.0,
             "price_change": 2.0},
            {"code": "6502", "name_ja": "テストC", "sector": "業種C", "price": 1234.5,
             "price_change": 3.0},
            {"code": "9999", "name_ja": "テストD", "sector": "業種D", "price": 777.0,
             "price_change": 5.0},
        ],
        "holdings": [
            {"id": "h1", "user_id": U1, "code": "7203", "quantity": 100, "cost_price": 2000,
             "created_at": CREATED},
            {"id": "h2", "user_id": U1, "code": "7203", "quantity": 50, "cost_price": 2100,
             "created_at": CREATED},
            {"id": "h3", "user_id": U1, "code": "6501", "quantity": 10, "cost_price": 1000,
             "created_at": CREATED},
            {"id": "h4", "user_id": U2, "code": "7203", "quantity": 3, "cost_price": 1900,
             "created_at": CREATED},
            {"id": "h5", "user_id": U2, "code": "9999", "quantity": 20, "cost_price": 500,
             "created_at": CREATED},
            {"id": "h6", "user_id": U2, "code": "6502", "quantity": 5, "cost_price": 1000,
             "created_at": CREATED},
        ],
        "stock_split_events": [],
        "stock_dividend_events": [],
        "dividend_records": [],
    }


class FakeTicker:
    """yf.Ticker の代替。7203 に配当1件、6501 に分割1件を持たせる。"""

    def __init__(self, symbol):
        self.symbol = symbol
        self.info = {"longName": "Test Co", "currency": "JPY", "dividendRate": 10}

        class _Fast:
            previous_close = 2990.0
        self.fast_info = _Fast()

        if symbol == "7203.T":
            # 権利確定日 2026-07-09 + 既定ラグ3ヶ月 = 2026-10-09（=S）→ confirmed
            self.dividends = pd.Series([20.0], index=pd.to_datetime(["2026-07-09"]))
        else:
            self.dividends = pd.Series([], dtype=float)
        if symbol == "6501.T":
            self.splits = pd.Series([2.0], index=pd.to_datetime(["2026-09-01"]))
        else:
            self.splits = pd.Series([], dtype=float)


def run_main(data=None, now=None, dry_run=False, fail_select=None, client=None):
    """main を偽クライアント・偽yfinanceで実行し、(終了コード, 出力, クライアント) を返す。"""
    client = client or FakeSupabase(data if data is not None else make_data(), fail_select)
    buf = io.StringIO()
    with mock.patch.object(us.yf, "Ticker", FakeTicker), \
         mock.patch.object(us.time, "sleep", lambda *_: None), \
         contextlib.redirect_stdout(buf):
        rc = us.main(now=now or jst(2026, 10, 9, 17, 0), supabase=client, dry_run=dry_run)
    return rc, buf.getvalue(), client


def normalized_writes(client):
    """stocks.updated_at（実時刻）を除いた書込み内容。起動時刻不変性の比較用。"""
    out = []
    for w in client.writes:
        w = copy.deepcopy(w)
        if w["table"] == "stocks" and isinstance(w["payload"], list):
            for r in w["payload"]:
                r.pop("updated_at", None)
        out.append(w)
    return out


# ==========================================
# テスト
# ==========================================

class TestExpectedTradingDate(unittest.TestCase):
    """C1 期待取引日の網羅"""

    CASES = [
        (jst(2026, 10, 9, 19, 59), date(2026, 10, 8)),
        (jst(2026, 10, 9, 20, 0),  date(2026, 10, 9)),
        (jst(2026, 10, 9, 23, 59), date(2026, 10, 9)),
        (jst(2026, 10, 10, 0, 0),  date(2026, 10, 9)),
        (jst(2026, 10, 10, 12, 0), date(2026, 10, 9)),
        (jst(2026, 10, 11, 15, 0), date(2026, 10, 9)),
        (jst(2026, 10, 12, 17, 0), date(2026, 10, 9)),   # スポーツの日
        (jst(2026, 10, 12, 21, 0), date(2026, 10, 9)),
        (jst(2026, 10, 13, 1, 51), date(2026, 10, 9)),
        (jst(2026, 10, 13, 20, 0), date(2026, 10, 13)),
        (jst(2026, 12, 31, 21, 0), date(2026, 12, 30)),
        (jst(2027, 1, 4, 19, 0),   date(2026, 12, 30)),
        (jst(2027, 1, 4, 21, 0),   date(2027, 1, 4)),
    ]

    def test_table(self):
        for now, expected in self.CASES:
            with self.subTest(now=now.isoformat()):
                self.assertEqual(us.expected_trading_date(now), expected)


class TestStartTimeInvariance(unittest.TestCase):
    """C2 起動時刻不変性 / C3 インシデント再現の解消 / C4 休場日の冪等"""

    TIMES = [
        jst(2026, 10, 9, 17, 0),
        jst(2026, 10, 9, 23, 59),
        jst(2026, 10, 10, 0, 0),    # 土曜（今回の発火時刻）
        jst(2026, 10, 10, 12, 0),
        jst(2026, 10, 11, 15, 0),   # 日曜
        jst(2026, 10, 12, 17, 0),   # 平日祝日
        jst(2026, 10, 13, 1, 51),   # 月曜スロットの遅延起動
    ]

    def test_c2_same_result_for_any_start_time(self):
        baseline = None
        for now in self.TIMES:
            with self.subTest(now=now.isoformat()):
                rc, out, client = run_main(now=now)          # (a) 例外なし
                self.assertEqual(rc, 0)
                hist = client.writes_to("daily_history", "upsert")
                self.assertEqual(len(hist), 1)
                for row in hist[0]["payload"]:                # (b) 日付はS固定
                    self.assertEqual(row["date"], S)
                self.assertEqual(hist[0]["kwargs"].get("on_conflict"), "user_id,date")
                for w in client.writes:                       # (d) 土曜日付の行は0件
                    if isinstance(w["payload"], list):
                        self.assertFalse([r for r in w["payload"]
                                          if isinstance(r, dict) and r.get("date") == "2026-10-10"])
                norm = normalized_writes(client)              # (b)(c) 内容が完全一致
                if baseline is None:
                    baseline = norm
                else:
                    self.assertEqual(norm, baseline)

    def test_c3_saturday_midnight_no_skip(self):
        rc, out, client = run_main(now=jst(2026, 10, 10, 0, 0))
        self.assertEqual(rc, 0)
        self.assertNotIn("東証休場日のためスキップ", out)
        stocks = client.writes_to("stocks", "upsert")
        self.assertGreaterEqual(len(stocks), 1)
        self.assertGreaterEqual(len(client.writes_to("daily_history", "upsert")), 1)
        prices = {r["code"]: r["price"] for r in stocks[0]["payload"]}
        self.assertEqual(prices["7203"], 3000.5)   # 前日(10/8)の2900.0ではなくSの終値
        self.assertEqual(prices["6501"], 4000.0)

    def test_c4_holiday_run_is_idempotent(self):
        _, _, ref_client = run_main(now=jst(2026, 10, 9, 17, 0))
        rc, out, client = run_main(now=jst(2026, 10, 12, 17, 0))
        self.assertEqual(rc, 0)
        self.assertEqual(normalized_writes(client), normalized_writes(ref_client))
        self.assertIn(f"データ基準日={S}", out)
        self.assertIn(f"期待取引日={S}", out)
        self.assertIn("起動日は休場日: はい", out)


class TestDiagnostics(unittest.TestCase):
    def test_c5_snapshot_behind_expected_warns_and_fails_after_processing(self):
        rc, out, client = run_main(now=jst(2026, 10, 13, 21, 0))
        self.assertEqual(rc, 1)
        self.assertIn("【警告】", out)
        self.assertIn("期待取引日=2026-10-13", out)
        # S分の処理は行われている
        self.assertEqual(len(client.writes_to("stocks", "upsert")), 1)
        self.assertEqual(len(client.writes_to("daily_history", "upsert")), 1)

    def test_snapshot_ahead_of_expected_is_ok(self):
        rc, out, _ = run_main(now=jst(2026, 10, 9, 17, 0))   # T=10/8 < S=10/9
        self.assertEqual(rc, 0)
        self.assertNotIn("【警告】", out)

    def test_c7_incomplete_snapshot_warns_without_behavior_change(self):
        data = make_data()
        data["screener_snapshots"][-1]["is_incomplete"] = True
        rc, out, client = run_main(data)
        self.assertEqual(rc, 0)
        self.assertIn("【警告】不完全なスナップショット", out)
        self.assertEqual(len(client.writes_to("daily_history", "upsert")), 1)

    def test_snapshot_date_on_holiday_warns(self):
        data = make_data(snapshot_rows=[
            {"snapshot_date": "2026-10-10", "is_incomplete": False, "success_rate": 0.95}])
        _, out, _ = run_main(data, now=jst(2026, 10, 10, 12, 0))
        self.assertIn("休場日です", out)


class TestFetchFailureIsSafe(unittest.TestCase):
    """C6 取得不能の安全性"""

    def test_zero_rows(self):
        rc, out, client = run_main(make_data(snapshot_rows=[]))
        self.assertEqual(rc, 1)
        self.assertEqual(client.writes, [])
        self.assertIn("【エラー】", out)
        self.assertIn("screener_snapshots", out)

    def test_exception(self):
        rc, out, client = run_main(fail_select={"screener_snapshots": "boom"})
        self.assertEqual(rc, 1)
        self.assertEqual(client.writes, [])
        self.assertIn("【エラー】", out)
        self.assertIn("boom", out)

    def test_price_fetch_exception_writes_nothing(self):
        rc, out, client = run_main(fail_select={"screener_stock_snapshots": "boom2"})
        self.assertEqual(rc, 1)
        self.assertEqual(client.writes, [])


class TestDividendReferenceDate(unittest.TestCase):
    """C8 配当の基準日（ref_date）"""

    def setUp(self):
        # 関数を直接呼ぶテストなので、ログ出力でテスト結果を汚さない
        cm = contextlib.redirect_stdout(io.StringIO())
        cm.__enter__()
        self.addCleanup(cm.__exit__, None, None, None)

    def _holdings(self):
        return [{"id": "h1", "user_id": U1, "code": "7203", "quantity": 100,
                 "cost_price": 2000, "created_at": CREATED}]

    def test_status_boundary(self):
        ref = date(2026, 10, 9)
        # ex_date + 既定ラグ3ヶ月 = payment_date
        cases = [
            (date(2026, 7, 9),  "confirmed"),   # payment_date == ref
            (date(2026, 7, 10), "scheduled"),   # payment_date == ref+1
            (date(2026, 7, 8),  "confirmed"),   # ref-1
        ]
        for ex_date, expected in cases:
            with self.subTest(ex_date=ex_date.isoformat()):
                client = FakeSupabase(make_data())
                n = us.create_dividend_snapshots(client, self._holdings(),
                                                 [("7203", ex_date, 20.0)], ref)
                self.assertEqual(n, 1)
                rec = client.writes_to("dividend_records", "insert")[0]["payload"]
                self.assertEqual(rec["status"], expected)

    def test_status_independent_of_wall_clock(self):
        ref = date(2026, 10, 9)
        for fake_now in (datetime(2026, 10, 9, 1, 0), datetime(2026, 10, 12, 23, 0)):
            with self.subTest(fake_now=fake_now.isoformat()):
                client = FakeSupabase(make_data())
                with mock.patch.object(us, "datetime", wraps=datetime) as m:
                    m.now.return_value = fake_now
                    us.create_dividend_snapshots(client, self._holdings(),
                                                 [("7203", date(2026, 7, 10), 20.0)], ref)
                rec = client.writes_to("dividend_records", "insert")[0]["payload"]
                self.assertEqual(rec["status"], "scheduled")

    def test_refresh_uses_ref_date(self):
        data = make_data()
        data["dividend_records"] = [
            {"id": "a", "status": "scheduled", "payment_date": "2026-10-09"},
            {"id": "b", "status": "scheduled", "payment_date": "2026-10-10"},
            {"id": "c", "status": "confirmed", "payment_date": "2026-10-01"},
        ]
        client = FakeSupabase(data)
        n = us.refresh_dividend_status(client, date(2026, 10, 9))
        self.assertEqual(n, 1)
        upd = client.writes_to("dividend_records", "update")[0]
        self.assertEqual(upd["payload"], {"status": "confirmed"})
        self.assertEqual(upd["filters"], [("in_", "id", ["a"])])

    def test_main_creates_merged_dividend_and_annual_summary(self):
        # 同一銘柄複数保有の合算 / 9/29 の RPC 方式の維持 / S基準の status
        _, _, client = run_main()
        recs = client.writes_to("dividend_records", "insert")
        by_user = {r["payload"]["user_id"]: r["payload"] for r in recs}
        self.assertEqual(by_user[U1]["quantity"], 150)
        self.assertEqual(by_user[U1]["amount"], 3000)
        self.assertEqual(by_user[U1]["status"], "confirmed")
        self.assertEqual(by_user[U2]["quantity"], 3)
        rpcs = client.writes_to("increment_annual_summary")
        self.assertEqual(len(rpcs), 2)
        self.assertEqual({r["payload"]["p_user_id"] for r in rpcs}, {U1, U2})
        # 分割検知: 6501 を保有する1行のみ
        self.assertEqual(len(client.writes_to("stock_split_events", "insert")), 1)


class TestDryRun(unittest.TestCase):
    """C9 DRY_RUN"""

    def test_no_writes(self):
        rc, out, client = run_main(dry_run=True)
        self.assertEqual(rc, 0)
        self.assertEqual(client.writes, [])
        self.assertIn("[DRY_RUN]", out)
        self.assertIn("stocks.upsert", out)
        self.assertIn("daily_history.upsert", out)
        self.assertIn("rpc increment_annual_summary", out)

    def test_env_var_enables_dry_run(self):
        client = FakeSupabase(make_data())
        buf = io.StringIO()
        with mock.patch.dict(os.environ, {"DRY_RUN": "true"}), \
             mock.patch.object(us.yf, "Ticker", FakeTicker), \
             mock.patch.object(us.time, "sleep", lambda *_: None), \
             contextlib.redirect_stdout(buf):
            rc = us.main(now=jst(2026, 10, 9, 17, 0), supabase=client)
        self.assertEqual(rc, 0)
        self.assertEqual(client.writes, [])

    def test_empty_env_var_is_not_dry_run(self):
        client = FakeSupabase(make_data())
        buf = io.StringIO()
        with mock.patch.dict(os.environ, {"DRY_RUN": ""}), \
             mock.patch.object(us.yf, "Ticker", FakeTicker), \
             mock.patch.object(us.time, "sleep", lambda *_: None), \
             contextlib.redirect_stdout(buf):
            rc = us.main(now=jst(2026, 10, 9, 17, 0), supabase=client)
        self.assertEqual(rc, 0)
        self.assertTrue(client.writes_to("stocks", "upsert"))


class TestMissingSnapshotRowKeepsPrice(unittest.TestCase):
    """C11 欠落銘柄（Sに有効な行が無い）の価格維持"""

    def test_keeps_existing_values_and_logs(self):
        rc, out, client = run_main()
        rows = {r["code"]: r for r in client.writes_to("stocks", "upsert")[0]["payload"]}
        # 行なし(9999) と fetch_success=false(6502) は既存価格・前日差・名称を維持
        self.assertEqual(rows["9999"]["price"], 777.0)
        self.assertEqual(rows["9999"]["price_change"], 5.0)
        self.assertEqual(rows["9999"]["name_ja"], "テストD")
        self.assertEqual(rows["6502"]["price"], 1234.5)
        for r in rows.values():
            self.assertNotEqual(r["price"], 0)
        # 有効な行がある銘柄はSの終値・名称
        self.assertEqual(rows["7203"]["price"], 3000.5)
        self.assertEqual(rows["7203"]["name_ja"], "テストA")
        # daily_history の評価にも既存価格が使われる
        hist = {r["user_id"]: r for r in client.writes_to("daily_history", "upsert")[0]["payload"]}
        self.assertEqual(hist[U1]["total_market_value"], 150 * 3000.5 + 10 * 4000.0)
        self.assertEqual(hist[U2]["total_market_value"], 3 * 3000.5 + 20 * 777.0 + 5 * 1234.5)
        # ログに明示（銘柄コードと件数）
        self.assertIn("以前の価格", out)
        self.assertIn("2 件", out)
        self.assertIn("9999", out)
        self.assertIn("6502", out)

    def test_other_day_rows_are_not_used(self):
        # 7203 は 10/8 にも行があるが、10/9 の行だけが使われる
        _, _, client = run_main()
        rows = {r["code"]: r for r in client.writes_to("stocks", "upsert")[0]["payload"]}
        self.assertNotEqual(rows["7203"]["price"], 2900.0)


class TestNoPersonalDataInLogs(unittest.TestCase):
    """C14 ログにユーザーID（部分含む）・個人の金額が出ない"""

    def _check(self, out):
        for uid in (U1, U2):
            self.assertNotIn(uid, out)
            self.assertNotIn(uid[:8], out)
        for h in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.assertNotIn(f"holding_id={h}", out)
        # U1: 490075.0 / U2: 30714.0 / 損益率 / 配当金額 / 保有数量
        for needle in ("490,075", "490075", "30,714", "30714", "55.58", "3,000円", "3000円"):
            self.assertNotIn(needle, out)

    def test_normal_run(self):
        _, out, _ = run_main()
        self._check(out)

    def test_dry_run(self):
        _, out, _ = run_main(dry_run=True)
        self._check(out)

    def test_split_and_dividend_logs_present_without_ids(self):
        _, out, _ = run_main()
        self.assertIn("確定記録作成: 7203", out)
        self.assertIn("検知: 6501", out)


class TestWorkflowAndSource(unittest.TestCase):
    """C10 / C12 / C13 の一部をテストでも担保する"""

    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def _read(self, *parts):
        with open(os.path.join(self.ROOT, *parts), encoding="utf-8") as f:
            return f.read()

    def test_wall_clock_gate_removed(self):
        src = self._read("scripts", "update_stocks.py")
        self.assertNotIn("is_tse_holiday(today)", src)
        self.assertNotIn("東証休場日のためスキップ", src)
        self.assertNotIn("FORCE_RUN", src)
        self.assertNotIn("force_run", src)

    def test_no_forbidden_words_in_script(self):
        src = self._read("scripts", "update_stocks.py")
        # 禁止語（絶対原則1）。このファイル自体が検索に掛からないようエスケープで記述する。
        banned = ("\u63a8\u5968", "\u304a\u3059\u3059\u3081", "\u30a8\u30f3\u30c8\u30ea\u30fc\u306b", "\u8cb7\u3044\u6642", "\u58f2\u308a\u6642", "\u72d9\u3044\u76ee", "\u3059\u3079\u304d", "\u52dd\u7387")
        for word in banned:
            self.assertNotIn(word, src)

    def test_workflow_has_concurrency_and_no_force_run(self):
        text = self._read(".github", "workflows", "daily_update.yml")
        self.assertRegex(text, r"(?m)^concurrency:\s*$")
        self.assertIn("cancel-in-progress: false", text)
        self.assertNotIn("force_run", text.lower())
        try:
            import yaml
        except ImportError:
            return
        doc = yaml.safe_load(text)
        self.assertEqual(doc["concurrency"]["group"], "kabu-note-daily-update")
        self.assertIs(doc["concurrency"]["cancel-in-progress"], False)

    def test_test_file_has_no_real_looking_secrets(self):
        src = self._read("scripts", "test_update_stocks.py")
        self.assertIsNone(re.search(r"eyJ[A-Za-z0-9_-]{20,}", src))   # JWT風
        self.assertIsNone(re.search(r"https://[a-z0-9]{20}\.supabase\.co", src))


if __name__ == "__main__":
    unittest.main()
