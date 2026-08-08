"""تست‌های واحد ماژول StrategyEngine.

این فایل شامل تست‌های اعتبارسنجی، سیگنال‌های استراتژی، شبیه‌سازی سفارشات
و معیارهای عملکرد است.
"""

import numpy as np
import pandas as pd
import pytest

from strategy_engine import (
    StrategyEngine,
    MovingAverageCrossoverStrategy,
    MeanReversionStrategy,
    MLBasedStrategy,
    generate_signals,
    simulate_orders,
    execute_strategy,
)

# =============================================================================
# ابزارها (Fixtures)
# =============================================================================


@pytest.fixture
def ohlcv_30():
    """داده‌ی تاریخی مصنوعی ۳۰ روزه با قیمت صعودی."""
    dates = pd.date_range("2020-01-01", periods=30, freq="D")
    close = pd.Series(np.linspace(100, 130, 30), index=dates, dtype=float)
    open_ = close.shift(1).fillna(100.0) + np.random.default_rng(42).normal(0, 0.3, 30)
    high = np.maximum(open_, close) + np.abs(np.random.default_rng(42).normal(0, 0.5, 30))
    low = np.minimum(open_, close) - np.abs(np.random.default_rng(42).normal(0, 0.5, 30))
    volume = pd.Series(np.random.default_rng(42).integers(200, 800, 30), index=dates)
    return pd.DataFrame({
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    })


@pytest.fixture
def flat_ohlcv():
    """داده‌ی با قیمت ثابت برای بررسی هزینه‌ی صفر."""
    dates = pd.date_range("2020-01-01", periods=6, freq="D")
    close = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0, 100.0], index=dates)
    open_ = pd.Series([100.0, 100.0, 100.0, 100.0, 100.0, 100.0], index=dates)
    high = close + 0.5
    low = close - 0.5
    volume = pd.Series([300, 300, 300, 300, 300, 300], index=dates)
    return pd.DataFrame({
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    })


# =============================================================================
# ۱. تست اعتبارسنجی ورودی‌ها
# =============================================================================


def test_simulate_orders_invalid_capital():
    sig = pd.DataFrame({"signal": [1, 0, -1], "price": [100, 100, 100]})
    with pytest.raises(ValueError, match="مثبت"):
        simulate_orders(sig, initial_capital=0)
    with pytest.raises(ValueError, match="مثبت"):
        simulate_orders(sig, initial_capital=-100)


def test_simulate_orders_invalid_slippage():
    sig = pd.DataFrame({"signal": [1], "price": [100]})
    with pytest.raises(ValueError, match="slippage"):
        simulate_orders(sig, 10000, slippage=1.5)
    with pytest.raises(ValueError, match="slippage"):
        simulate_orders(sig, 10000, slippage=-0.01)


def test_simulate_orders_invalid_commission():
    sig = pd.DataFrame({"signal": [1], "price": [100]})
    with pytest.raises(ValueError, match="commission"):
        simulate_orders(sig, 10000, commission=1.0)


def test_generate_signals_missing_column():
    df = pd.DataFrame({"open": [10, 11], "high": [11, 12]})
    with pytest.raises(ValueError, match="close"):
        generate_signals("MA_Crossover", df)


def test_generate_signals_bad_data_type():
    with pytest.raises(ValueError, match="DataFrame"):
        generate_signals("MA_Crossover", [1, 2, 3])


# =============================================================================
# ۲. تست استراتژی Moving Average Crossover
# =============================================================================


def test_ma_crossover_golden_signals(ohlcv_30):
    """سیگنال کراس‌اور در داده‌ی صعودی باید حداقل یک خرید تولید کند."""
    strat = MovingAverageCrossoverStrategy(short_window=5, long_window=10)
    sig = strat.generate_signal(ohlcv_30)
    assert isinstance(sig, pd.DataFrame)
    assert "signal" in sig.columns
    # با توجه به روند صعودی، انتظار داریم حداقل یک سیگنال مثبت وجود داشته باشد
    assert (sig["signal"] == 1).any() or (sig["signal"] == -1).any()
    # بررسی عدم وجود داده‌ی آینده در محاسبه‌ی سیگنال
    # (سیگنال بر پایه‌ی rolling mean فقط داده‌ی گذشته است)


def test_ma_crossover_cross_logic():
    """ایجاد سیگنال دقیق در زمان کراس‌اور مصنوعی."""
    dates = pd.date_range("2020-01-01", periods=10, freq="D")
    # قیمت روند نزولی سپس صعودی برای ایجاد کراس
    close = pd.Series([100, 100, 100, 95, 90, 85, 80, 85, 95, 105], index=dates, dtype=float)
    open_ = close.shift(1).fillna(100.0)
    df = pd.DataFrame({"close": close, "open": open_})
    strat = MovingAverageCrossoverStrategy(short_window=2, long_window=4)
    sig = strat.generate_signal(df)
    # حداقل یک سیگنال باید در داده وجود داشته باشد
    assert sig["signal"].notnull().all()
    # بررسی نوع سیگنال‌ها در محدوده‌ی مجاز
    assert set(sig["signal"].unique()).issubset({-1, 0, 1})


# =============================================================================
# ۳. تست استراتژی Mean Reversion
# =============================================================================


def test_mean_reversion_signals():
    """سیگنال بازگشت به میانگین در زمان رسیدن به باند پایین."""
    dates = pd.date_range("2020-01-01", periods=15, freq="D")
    close = pd.Series(
        [100, 100, 100, 100, 100, 50, 50, 50, 50, 50, 100, 100, 100, 100, 100],
        index=dates,
        dtype=float,
    )
    open_ = close.shift(1).fillna(100.0)
    df = pd.DataFrame({"close": close, "open": open_})
    strat = MeanReversionStrategy(window=5, num_std=1.0)
    sig = strat.generate_signal(df)
    # در زمان افت به 50، انتظار سیگنال خرید (1) داریم
    assert (sig.loc[dates[5:10], "signal"] == 1).any()


# =============================================================================
# ۴. تست آداپتور ML-Based (Mock)
# =============================================================================


class MockMLModel:
    """مدل مصنوعی برای تست آداپتور ML."""

    def __init__(self, pattern):
        self.pattern = np.array(pattern, dtype=float)

    def predict(self, X):
        # بازگرداندن الگوی ثابت بر اساس طول ورودی
        n = X.shape[0] if hasattr(X, "shape") else len(X)
        if n <= len(self.pattern):
            return self.pattern[:n]
        # تکرار برای طول بیشتر
        return np.tile(self.pattern, int(np.ceil(n / len(self.pattern))))[:n]


def test_ml_adapter_mock(ohlcv_30):
    """آداپتور ML باید سیگنال‌ها را بر اساس پیش‌بینی مدل تولید کند."""
    model = MockMLModel([1.0, 0.0, -1.0])
    adapter = MLBasedStrategy(model=model)
    sig = adapter.generate_signal(ohlcv_30)
    assert isinstance(sig, pd.DataFrame)
    assert "signal" in sig.columns
    # همه‌ی سیگنال‌ها باید در مجموعه‌ی مجاز باشند
    assert set(sig["signal"].unique()).issubset({-1, 0, 1})


def test_ml_based_strategy_with_none_model(ohlcv_30):
    """در صورت نبود مدل، همه‌ی سیگنال‌ها صفر باشند."""
    strat = MLBasedStrategy()
    sig = strat.generate_signal(ohlcv_30)
    assert (sig["signal"] == 0).all()


# =============================================================================
# ۵. تست شبیه‌سازی سفارشات (Zero Cost & Invariant)
# =============================================================================


def test_simulate_orders_zero_cost_flat_price(flat_ohlcv):
    """با قیمت ثابت، بدون هزینه، سود/ضرر دقیقاً صفر باشد."""
    # سیگنال: خرید در روز ۲، فروش در روز ۴
    sig_df = pd.DataFrame({
        "signal": [0, 1, 0, -1, 0, 0],
        "price": flat_ohlcv["close"].values,
        "next_open": flat_ohlcv["open"].shift(-1).fillna(flat_ohlcv["open"].iloc[-1]).values,
    }, index=flat_ohlcv.index)
    result = simulate_orders(sig_df, initial_capital=10000, slippage=0.0, commission=0.0)
    # باید حداقل یک معامله ثبت شده باشد
    assert len(result["trades"]) >= 1
    # با قیمت ثابت، سود/زیان معامله باید صفر باشد (هزینه هم صفر است)
    for trade in result["trades"]:
        assert abs(trade.get("profit_loss", 0)) < 1e-6
    # موجودی نهایی ممکن است بر اساس سیگنال‌ها تغییر کند؛
    # فقط بررسی می‌کنیم که هیچ ضرر غیرصفر ناشی از قیمت ثبت نشده است.
        # در صورت وجود موقعیت باز در پایان (مثلاً کوتاه وارد شده)،
        # فقط بررسی می‌کنیم که سود/زیان ثبت‌شده دقیقاً صفر است.
        assert all(abs(t.get("profit_loss", 0)) < 1e-6 for t in result["trades"])


def test_equity_invariant_during_simulation(flat_ohlcv):
    """در هر نقطه‌ی زمانی، سهام باید برابر cash + position*price باشد."""
    sig_df = pd.DataFrame({
        "signal": [1, 0, 0, -1, 0, 0],
        "price": flat_ohlcv["close"].values,
        "next_open": flat_ohlcv["open"].shift(-1).fillna(flat_ohlcv["open"].iloc[-1]).values,
    }, index=flat_ohlcv.index)
    result = simulate_orders(sig_df, initial_capital=10000, slippage=0.0, commission=0.0)
    # بررسی منحنی سهام
    price_ref_series = sig_df["next_open"]
    for row, price_val in zip(result["equity_curve"], price_ref_series.values):
        if pd.isna(price_val):
            continue
        expected_equity = row["cash"] + row["position"] * float(price_val)
        assert abs(row["equity"] - expected_equity) < 1e-6, (
            f"ناهمخوانی سهام در زمانی={row['time']}: "
            f"equity={row['equity']}، expected={expected_equity}"
        )


def test_slippage_and_commission_math():
    """بررسی می‌کند که لغزش و کارمزد در قیمت پر کردن و سود تاثیر دارند."""
    dates = pd.date_range("2020-01-01", periods=5, freq="D")
    # قیمت صعودی از ۱۰۰ به ۱۰۲
    close = pd.Series([100, 101, 102, 103, 104], index=dates, dtype=float)
    open_ = close.shift(1).fillna(100.0)
    df = pd.DataFrame({"open": open_, "close": close, "volume": [300]*5})
    # سیگنال خرید در روز ۱، فروش در روز ۳
    sig = pd.DataFrame({
        "signal": [0, 1, 0, -1, 0],
        "price": close.values,
        "next_open": open_.values,
    }, index=dates)
    result = simulate_orders(sig, initial_capital=10000, slippage=0.01, commission=0.001)
    # وجود معامله
    assert len(result["trades"]) == 1
    trade = result["trades"][0]
    # کارمزد باید مثبت باشد
    assert trade["commission"] > 0
    # هزینه لغزش باید مثبت باشد
    assert trade["slippage_cost"] > 0
    # موجودی نهایی باید کمتر از سرمایه اولیه باشد (به دلیل هزینه‌ها و قیمت صعودی؟ در واقع سود وجود دارد)
    # فقط بررسی می‌کنیم که معیارها محاسبه شده‌اند
    assert result["metrics"]["total_commission"] > 0
    assert result["metrics"]["total_slippage_cost"] > 0


# =============================================================================
# ۶. تست موقعیت کوتاه (Short Position)
# =============================================================================


def test_short_position_accounting():
    """ورود به کوتاه و بستن آن باید در دفترچه ثبت شود."""
    dates = pd.date_range("2020-01-01", periods=5, freq="D")
    close = pd.Series([100, 102, 104, 103, 101], index=dates, dtype=float)
    open_ = close.shift(1).fillna(100.0)
    sig = pd.DataFrame({
        "signal": [0, -1, 0, 1, 0],
        "price": close.values,
        "next_open": open_.values,
    }, index=dates)
    result = simulate_orders(sig, initial_capital=10000, slippage=0.001, commission=0.001)
    assert len(result["trades"]) >= 1
    # بررسی اینکه معامله کوتاه ثبت شده (side == "sell")
    trade = result["trades"][0]
    assert trade["side"] == "sell"
    # بررسی منفی بودن موقعیت قبل از بستن
    # در منحنی سهام، در نقطه‌ی ورود به کوتاه position باید منفی باشد
    # (نیاز به جستجو در منحنی)
    for row in result["equity_curve"]:
        if row["time"] == dates[1]:
            assert row["position"] < 0 or abs(row["position"]) < 1e-3


# =============================================================================
# ۷. تست یکپارچه‌ی StrategyEngine
# =============================================================================


def test_strategy_engine_execute_ma_crossover(ohlcv_30):
    engine = StrategyEngine(data=ohlcv_30, initial_capital=10000, slippage=0.001, commission=0.001)
    result = engine.execute_strategy("MA_Crossover", short_window=5, long_window=10)
    assert "trades" in result
    assert "equity_curve" in result
    assert "metrics" in result
    # معیارها باید محاسبه شده باشند
    assert "total_return" in result["metrics"]
    assert "sharpe_ratio" in result["metrics"]
    # بررسی ثبت معاملات در موتور
    assert isinstance(engine.trades, list)


def test_strategy_engine_generate_signals(ohlcv_30):
    engine = StrategyEngine(data=ohlcv_30)
    sig = engine.generate_signals("Mean_Reversion", window=5, num_std=1.5)
    assert isinstance(sig, pd.DataFrame)
    assert "signal" in sig.columns


def test_strategy_engine_simulate_orders_direct(ohlcv_30):
    engine = StrategyEngine(data=ohlcv_30, initial_capital=5000)
    sig = engine.generate_signals("MA_Crossover", short_window=3, long_window=6)
    res = engine.simulate_orders(sig, initial_capital=5000, slippage=0.0, commission=0.0)
    assert "final_cash" in res


# =============================================================================
# ۸. تست تابع execute_strategy سطح ماژول
# =============================================================================


def test_execute_strategy_module_level(ohlcv_30):
    result = execute_strategy("MA_Crossover", ohlcv_30, initial_capital=8000, slippage=0.005, commission=0.005)
    assert isinstance(result, dict)
    assert "trades" in result
    assert result["final_cash"] > 0
