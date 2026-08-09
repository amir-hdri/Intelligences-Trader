"""ماژول موتور استراتژی معاملاتی (Strategy Engine).

این ماژول امکان اجرای استراتژی‌های ساده (Moving Average Crossover) و پیچیده
(ML-Based) را فراهم می‌کند. سیگنال‌های خرید/فروش تولید شده و سفارشات با
در نظر گرفتن Slippage و Commission شبیه‌سازی می‌شوند.

قوانین نقطه‌ای-زمانی:
- سیگنال در پایان کندل `t` تولید می‌شود.
- اجرای سفارش بر روی قیمت باز شدن کندل `t+1` صورت می‌گیرد (Next-Bar-Open).
- هیچ داده‌ی آینده در محاسبه‌ی سیگنال استفاده نمی‌شود.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Any, Callable, Dict, List, Optional, Union

# =============================================================================
# توابع اعتبارسنجی (Validation)
# =============================================================================


def _validate_dataframe(data: Any, name: str = "data") -> pd.DataFrame:
    """بررسی می‌کند که ورودی یک DataFrame معتبر با ستون close باشد."""
    if not isinstance(data, pd.DataFrame):
        raise ValueError(f"{name} باید یک pandas.DataFrame باشد.")
    if "close" not in data.columns:
        raise ValueError(f"{name} باید ستون 'close' داشته باشد.")
    # بررسی مقادیر محدود و مثبت برای قیمت
    close_vals = pd.to_numeric(data["close"], errors="coerce")
    if close_vals.isnull().any():
        raise ValueError("مقدار غیرعدد در ستون 'close' وجود دارد.")
    if (close_vals <= 0).any():
        raise ValueError("همه‌ی قیمت‌ها در 'close' باید مثبت باشند.")
    return data


def _validate_positive_finite(value: float, name: str) -> float:
    if not np.isfinite(value) or value <= 0:
        raise ValueError(f"{name} باید یک عدد مثبت و محدود باشد.")
    return float(value)


def _validate_rate(value: float, name: str, inclusive_low: bool = True) -> float:
    """بررسی می‌کند نرخ در [0, 1) باشد."""
    if not np.isfinite(value):
        raise ValueError(f"{name} باید محدود باشد.")
    if inclusive_low:
        if not (0 <= value < 1):
            raise ValueError(f"{name} باید در بازه‌ی [0, 1) باشد.")
    else:
        if not (0 < value < 1):
            raise ValueError(f"{name} باید در بازه‌ی (0, 1) باشد.")
    return float(value)


# =============================================================================
# استراتژی‌های پایه (Rule-Based)
# =============================================================================


class MovingAverageCrossoverStrategy:
    """استراتژی کراس‌اور میانگین متحرک (Moving Average Crossover).

    سیگنال خرید: وقتی میانگین کوتاه از میانگین بلند عبور می‌کند به سمت بالا.
    سیگنال فروش: وقتی میانگین کوتاه از میانگین بلند عبور می‌کند به سمت پایین.
    """

    def __init__(self, short_window: int = 50, long_window: int = 200):
        if short_window <= 0 or long_window <= 0:
            raise ValueError("پنجره‌ها باید اعداد صحیح مثبت باشند.")
        if short_window >= long_window:
            raise ValueError("پنجره‌ی کوتاه باید از پنجره‌ی بلند کوتاه‌تر باشد.")
        self.short_window = int(short_window)
        self.long_window = int(long_window)

    def generate_signal(self, data: pd.DataFrame) -> pd.DataFrame:
        data = _validate_dataframe(data, "data")
        close = pd.to_numeric(data["close"], errors="coerce").astype(float)
        # محاسبات فقط بر پایه‌ی داده‌های گذشته (Causal)
        short_ma = close.rolling(window=self.short_window, min_periods=self.short_window).mean()
        long_ma = close.rolling(window=self.long_window, min_periods=self.long_window).mean()
        # تشخیص کراس‌اور با مقایسه‌ی وضعیت فعلی و قبلی
        above = short_ma > long_ma
        prev_above = above.shift(1)
        signal = pd.Series(0, index=data.index, dtype=int)
        # کراس به بالا
        cross_up = above & (~prev_above.fillna(False))
        signal.loc[cross_up] = 1
        # کراس به پایین
        cross_down = (~above) & prev_above.fillna(False)
        signal.loc[cross_down] = -1
        # ساخت خروجی
        next_open = data["open"].shift(-1) if "open" in data.columns else close
        result = pd.DataFrame({
            "signal": signal,
            "price": close,
            "next_open": next_open,
        }, index=data.index)
        return result


class MeanReversionStrategy:
    """استراتژی بازگشت به میانگین (Mean Reversion) با باندهای بولینگر."""

    def __init__(self, window: int = 20, num_std: float = 2.0):
        if window <= 0:
            raise ValueError("پنجره باید مثبت باشد.")
        if not np.isfinite(num_std) or num_std <= 0:
            raise ValueError("num_std باید عدد مثبت و محدود باشد.")
        self.window = int(window)
        self.num_std = float(num_std)

    def generate_signal(self, data: pd.DataFrame) -> pd.DataFrame:
        data = _validate_dataframe(data, "data")
        close = pd.to_numeric(data["close"], errors="coerce").astype(float)
        rolling_mean = close.rolling(window=self.window, min_periods=self.window).mean()
        rolling_std = close.rolling(window=self.window, min_periods=self.window).std()
        upper = rolling_mean + self.num_std * rolling_std
        lower = rolling_mean - self.num_std * rolling_std
        signal = pd.Series(0, index=data.index, dtype=int)
        signal.loc[close < lower] = 1
        signal.loc[close > upper] = -1
        next_open = data["open"].shift(-1) if "open" in data.columns else close
        result = pd.DataFrame({
            "signal": signal,
            "price": close,
            "next_open": next_open,
        }, index=data.index)
        return result


# =============================================================================
# آداپتور استراتژی ML-Based
# =============================================================================


class MLBasedStrategy:
    """آداپتور برای استراتژی‌های مبتنی بر مدل یادگیری ماشین.

    مدل می‌تواند هر شیء با متد `.predict(X)` باشد یا یک تابع فراخوانی‌پذیر.
    خروجی مدل باید در محدوده‌ی [-1, 1] یا [0, 1, 2] انتظار برود و به سیگنال
    ۱ (خرید)، -۱ (فروش) یا ۰ (نگه‌داری) تبدیل می‌شود.
    """

    def __init__(self, model: Optional[Any] = None):
        self.model = model

    def generate_signal(self, data: pd.DataFrame) -> pd.DataFrame:
        data = _validate_dataframe(data, "data")
        close = pd.to_numeric(data["close"], errors="coerce").astype(float)
        if self.model is not None:
            # استخراج ویژگی‌های ساده: قیمت نرمال‌شده و بازده‌ی لحظه‌ای
            ret = close.pct_change().fillna(0.0)
            feat = pd.DataFrame({
                "close_norm": close / close.iloc[-1] if close.iloc[-1] != 0 else close,
                "ret": ret,
            }, index=data.index)
            feat = feat.fillna(0.0)
            X = feat.values
            try:
                preds_raw = self.model.predict(X)
            except Exception as exc:
                raise ValueError(f"خطا در پیش‌بینی مدل: {exc}")
            preds = np.asarray(preds_raw).reshape(-1)
            # تطبیق خروجی
            if preds.dtype.kind in "iuf":
                # عدد صحیح یا شناور
                signal = np.where(preds > 0.5, 1, np.where(preds < -0.5, -1, 0)).astype(int)
            else:
                signal = np.zeros(len(preds), dtype=int)
            signal = pd.Series(signal, index=data.index, dtype=int)
        else:
            # در صورت نبود مدل، همه را نگه‌دار
            signal = pd.Series(0, index=data.index, dtype=int)
        next_open = data["open"].shift(-1) if "open" in data.columns else close
        result = pd.DataFrame({
            "signal": signal,
            "price": close,
            "next_open": next_open,
        }, index=data.index)
        return result


# =============================================================================
# توابع عمومی مورد نیاز کاربر (Exact Signatures)
# =============================================================================


def generate_signals(strategy: Union[str, Any, Callable], data: pd.DataFrame) -> pd.DataFrame:
    """تولید سیگنال‌های خرید/فروش بر اساس استراتژی داده‌شده.

    پارامترها:
        strategy: نام استراتژی (رشته) یا نمونه‌ی کلاس استراتژی یا تابع/مدل.
        data: DataFrame با حداقل ستون 'close' و به‌صورت نقطه‌ای-زمانی.

    خروجی:
        DataFrame با شاخص `data.index` و ستون‌های:
        - `signal`: 1 برای خرید، -1 برای فروش، 0 برای نگه‌داری.
        - `price`: قیمت مرجع (close) در زمان سیگنال.
        - `next_open`: قیمت باز شدن کندل بعدی (در صورت وجود 'open').

    نکته:
        محاسبه‌ی سیگنال فقط بر پایه‌ی داده‌های گذشته انجام می‌شود (No Lookahead).
    """
    data = _validate_dataframe(data, "data")
    # اگر شیء دارای متد generate_signal باشد
    if hasattr(strategy, "generate_signal") and callable(getattr(strategy, "generate_signal")):
        sig_df = strategy.generate_signal(data)
        if isinstance(sig_df, pd.DataFrame):
            # تضمین وجود ستون‌های پایه
            for col in ("signal", "price"):
                if col not in sig_df.columns:
                    raise ValueError(f"خروجی generate_signal باید ستون '{col}' را داشته باشد.")
            return sig_df
        else:
            raise ValueError("generate_signal باید DataFrame بازگرداند.")
    # اگر قابل فراخوانی باشد (تابع یا مدل)
    if callable(strategy) and not isinstance(strategy, str):
        # تلاش برای فراخوانی مستقیم با داده
        try:
            result = strategy(data)
        except Exception:
            # اگر مدل انتظار ویژگی دارد، از آداپتور MLBasedStrategy استفاده می‌کنیم
            adapter = MLBasedStrategy(model=strategy)
            return adapter.generate_signal(data)
        if isinstance(result, pd.DataFrame):
            return result
        # اگر آرایه/لیست باشد
        sig = pd.Series(np.asarray(result).reshape(-1), index=data.index, dtype=int)
        return pd.DataFrame({
            "signal": sig,
            "price": data["close"],
            "next_open": data["open"].shift(-1) if "open" in data.columns else data["close"],
        }, index=data.index)
    # اگر رشته باشد
    if isinstance(strategy, str):
        key = strategy.lower().strip().replace(" ", "_").replace("-", "_")
        if key in ("ma_crossover", "moving_average_crossover"):
            return MovingAverageCrossoverStrategy().generate_signal(data)
        elif key in ("mean_reversion", "bollinger_bands", "mean_reversion_strategy"):
            return MeanReversionStrategy().generate_signal(data)
        elif key in ("ml_based", "ml_based_strategy", "ml"):
            return MLBasedStrategy().generate_signal(data)
        else:
            raise ValueError(f"استراتژی ناشناخته: {strategy}")
    raise ValueError("strategy باید رشته، شیء با متد generate_signal، یا تابع/مدل باشد.")


def simulate_orders(
    signals: pd.DataFrame,
    initial_capital: float,
    slippage: float = 0.001,
    commission: float = 0.001,
    liquidate_at_end: bool = False,
) -> Dict[str, Any]:
    """Simulate event signals with next-bar execution and deterministic liquidation.

    ``signal`` is an event/target-direction column: ``1`` opens or keeps a long
    position, ``-1`` opens or keeps a short position, and ``0`` does nothing.
    When present, ``next_open`` is the execution price for a signal generated
    at the current close.  ``price`` is used for mark-to-market observations.
    An optional ``size`` column controls the fraction of available capital used
    when a new position is opened; rule-based strategies default to 100%.

    Set ``liquidate_at_end=True`` for a finite backtest in which all P/L and
    both entry/exit costs appear in the realised trade ledger consumed by
    :class:`PerformanceMetrics`.  The default remains ``False`` for backwards
    compatibility with callers that intentionally carry an open position.
    """
    if not isinstance(liquidate_at_end, (bool, np.bool_)):
        raise ValueError("liquidate_at_end باید boolean باشد.")
    if not isinstance(signals, pd.DataFrame):
        raise ValueError("signals باید یک pandas.DataFrame باشد.")
    if "signal" not in signals.columns:
        raise ValueError("signals باید ستون 'signal' داشته باشد.")
    initial_capital = _validate_positive_finite(initial_capital, "initial_capital")
    slippage = _validate_rate(slippage, "slippage")
    commission = _validate_rate(commission, "commission")
    if signals.empty:
        return {
            "trades": [],
            "equity_curve": [],
            "final_cash": float(initial_capital),
            "final_position": 0.0,
            "metrics": _compute_metrics([], []),
        }
    if "next_open" not in signals.columns and "price" not in signals.columns:
        raise ValueError("signals باید ستون 'price' یا 'next_open' داشته باشد.")

    cash = float(initial_capital)
    position = 0.0  # positive=long shares, negative=short shares
    open_trade: Optional[Dict[str, Any]] = None
    trades: List[Dict[str, Any]] = []
    equity_curve: List[Dict[str, Any]] = []

    def _finite_price(value: Any) -> Optional[float]:
        try:
            price = float(value)
        except (TypeError, ValueError):
            return None
        return price if np.isfinite(price) and price > 0.0 else None

    def _position_size(row: pd.Series) -> float:
        raw_size = row.get("size", 1.0)
        try:
            size = float(raw_size)
        except (TypeError, ValueError) as exc:
            raise ValueError("size باید عددی در بازه‌ی [0, 1] باشد.") from exc
        if not np.isfinite(size) or not 0.0 <= size <= 1.0:
            raise ValueError("size باید عددی در بازه‌ی [0, 1] باشد.")
        return size

    def _open(direction: int, reference_price: float, when: Any, size: float) -> None:
        nonlocal cash, position, open_trade
        if size <= 0.0 or cash <= 0.0:
            return

        budget = cash * size
        if direction > 0:
            fill_price = reference_price * (1.0 + slippage)
            # Include entry commission in the requested capital allocation.
            entry_notional = budget / (1.0 + commission)
            volume = entry_notional / fill_price
            entry_commission = entry_notional * commission
            cash -= entry_notional + entry_commission
            position = volume
            side = "buy"
            entry_slippage = volume * (fill_price - reference_price)
        else:
            fill_price = reference_price * (1.0 - slippage)
            entry_notional = budget / (1.0 + commission)
            volume = entry_notional / fill_price
            entry_commission = entry_notional * commission
            # A short sale receives proceeds; equity still subtracts the short
            # liability via cash + position * mark_price.
            cash += entry_notional - entry_commission
            position = -volume
            side = "sell"
            entry_slippage = volume * (reference_price - fill_price)

        open_trade = {
            "entry_time": when,
            "entry_price": float(fill_price),
            "volume": float(volume),
            "size": float(size),
            "side": side,
            "entry_commission": float(entry_commission),
            "commission": float(entry_commission),
            "slippage_cost": float(entry_slippage),
            "profit_loss": None,
            "exit_time": None,
            "exit_price": None,
            "exit_reason": None,
        }

    def _close(reference_price: float, when: Any, reason: str) -> None:
        nonlocal cash, position, open_trade
        if position == 0.0 or open_trade is None:
            return

        volume = abs(position)
        entry_price = float(open_trade["entry_price"])
        entry_commission = float(open_trade["entry_commission"])
        if position > 0.0:
            fill_price = reference_price * (1.0 - slippage)
            exit_notional = volume * fill_price
            exit_commission = exit_notional * commission
            cash += exit_notional - exit_commission
            profit = (fill_price - entry_price) * volume - entry_commission - exit_commission
            exit_slippage = volume * (reference_price - fill_price)
        else:
            fill_price = reference_price * (1.0 + slippage)
            exit_notional = volume * fill_price
            exit_commission = exit_notional * commission
            cash -= exit_notional + exit_commission
            profit = (entry_price - fill_price) * volume - entry_commission - exit_commission
            exit_slippage = volume * (fill_price - reference_price)

        open_trade.update(
            {
                "exit_time": when,
                "exit_price": float(fill_price),
                "exit_commission": float(exit_commission),
                "commission": float(entry_commission + exit_commission),
                "slippage_cost": float(open_trade["slippage_cost"] + exit_slippage),
                "profit_loss": float(profit),
                "exit_reason": reason,
            }
        )
        trades.append(open_trade)
        open_trade = None
        position = 0.0

    has_next_open = "next_open" in signals.columns
    for idx, row in signals.iterrows():
        mark_price = _finite_price(row.get("price"))
        if mark_price is None:
            mark_price = _finite_price(row.get("next_open"))
        current_equity = cash + position * mark_price if mark_price is not None else cash
        equity_curve.append(
            {
                "time": idx,
                "equity": float(current_equity),
                "cash": float(cash),
                "position": float(position),
            }
        )

        execution_price = _finite_price(row.get("next_open")) if has_next_open else mark_price
        if execution_price is None:
            # In particular, the final next_open is intentionally NaN: there is
            # no future bar on which that final signal can be executed.
            continue

        try:
            signal_value = float(row["signal"])
        except (TypeError, ValueError) as exc:
            raise ValueError("signal باید یکی از مقادیر -1، 0 یا 1 باشد.") from exc
        if not np.isfinite(signal_value):
            raise ValueError("signal باید محدود باشد.")
        signal = int(round(signal_value))
        if signal not in (-1, 0, 1):
            raise ValueError("signal باید یکی از مقادیر -1، 0 یا 1 باشد.")
        size = _position_size(row)

        if signal == 1 and position <= 0.0:
            if position < 0.0:
                _close(execution_price, idx, "reversal")
            _open(1, execution_price, idx, size)
        elif signal == -1 and position >= 0.0:
            if position > 0.0:
                _close(execution_price, idx, "reversal")
            _open(-1, execution_price, idx, size)

    # Settle all remaining exposure at the final observed close.  If ``price``
    # is unavailable, use the last valid execution/mark price as a fallback.
    final_index = signals.index[-1]
    final_price: Optional[float] = None
    for column in ("price", "next_open"):
        if column in signals.columns:
            valid = [_finite_price(value) for value in signals[column].tolist()]
            valid = [value for value in valid if value is not None]
            if valid:
                final_price = valid[-1]
                break
    if liquidate_at_end and position != 0.0:
        if final_price is None:
            raise ValueError("برای تسویه‌ی موقعیت نهایی قیمت معتبر وجود ندارد.")
        _close(final_price, final_index, "end_of_backtest")

    if liquidate_at_end and equity_curve:
        equity_curve[-1].update(
            {
                "equity": float(cash),
                "cash": float(cash),
                "position": 0.0,
            }
        )

    return {
        "trades": trades,
        "equity_curve": equity_curve,
        "final_cash": float(cash),
        "final_position": float(position),
        "metrics": _compute_metrics(trades, equity_curve),
    }


def _compute_metrics(trades: List[Dict[str, Any]], equity_curve: List[Dict[str, Any]]) -> Dict[str, Any]:
    """محاسبه معیارهای عملکرد بر اساس معاملات و منحنی سهام."""
    if not equity_curve:
        return {
            "total_return": 0.0,
            "sharpe_ratio": None,
            "max_drawdown": 0.0,
            "win_rate": None,
            "profit_factor": None,
            "total_commission": 0.0,
            "total_slippage_cost": 0.0,
        }
    equity_df = pd.DataFrame(equity_curve)
    equity_df["equity"] = pd.to_numeric(equity_df["equity"], errors="coerce")
    # بازده کل
    start_equity = equity_df["equity"].iloc[0]
    end_equity = equity_df["equity"].iloc[-1]
    total_return = float((end_equity / start_equity - 1.0)) if start_equity and start_equity > 0 else 0.0
    # نرخ بازده لحظه‌ای برای شارپ
    equity_df["return"] = equity_df["equity"].pct_change()
    returns = equity_df["return"].dropna()
    sharpe = None
    if len(returns) > 1 and returns.std() > 1e-12:
        # سالانه با فرض 252 دوره در سال (قابل تنظیم)
        sharpe = float((returns.mean() / returns.std()) * np.sqrt(252))
    # حداکثر افت سرمایه (Max Drawdown)
    peak = equity_df["equity"].cummax()
    drawdown = (equity_df["equity"] - peak) / peak
    max_drawdown = float(drawdown.min()) if not drawdown.empty else 0.0
    # معیارهای معاملاتی
    profits = []
    total_commission = 0.0
    total_slippage = 0.0
    for t in trades:
        if t.get("profit_loss") is not None:
            profits.append(float(t["profit_loss"]))
        total_commission += float(t.get("commission", 0.0))
        total_slippage += float(t.get("slippage_cost", 0.0))
    win_rate = None
    profit_factor = None
    if profits:
        wins = sum(1 for p in profits if p > 0)
        win_rate = float(wins / len(profits))
        gross_profit = sum(p for p in profits if p > 0)
        gross_loss = abs(sum(p for p in profits if p < 0))
        if gross_loss > 1e-9:
            profit_factor = float(gross_profit / gross_loss)
    return {
        "total_return": total_return,
        "sharpe_ratio": sharpe,
        "max_drawdown": max_drawdown,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "total_commission": total_commission,
        "total_slippage_cost": total_slippage,
    }


def execute_strategy(
    strategy: Union[str, Any],
    data: pd.DataFrame,
    initial_capital: float = 10000.0,
    slippage: float = 0.001,
    commission: float = 0.001,
) -> Dict[str, Any]:
    """اجرای یکپارچه: تولید سیگنال سپس شبیه‌سازی سفارشات.

    پارامترها:
        strategy: نام یا شیء استراتژی.
        data: DataFrame با ستون‌های OHLCV.
        initial_capital: سرمایه اولیه (پیش‌فرض 10000).
        slippage: لغزش (پیش‌فرض 0.001).
        commission: کارمزد (پیش‌فرض 0.001).

    خروجی:
        dict حاصل از `simulate_orders`.
    """
    signals = generate_signals(strategy, data)
    result = simulate_orders(
        signals,
        initial_capital=initial_capital,
        slippage=slippage,
        commission=commission,
    )
    return result


# =============================================================================
# کلاس StrategyEngine (مطابق مشخصات کاربر)
# =============================================================================


class StrategyEngine:
    """موتور اجرای استراتژی معاملاتی.

    این کلاس امکان تنظیم داده، اجرا و شبیه‌سازی استراتژی را در یک رابط واحد
    فراهم می‌کند. متدهای داخلی `_ma_crossover_strategy`، `_mean_reversion_strategy`
    و `_ml_based_strategy` پیاده‌سازی خاص هر استراتژی را انجام می‌دهند.
    """

    def __init__(
        self,
        data: Optional[pd.DataFrame] = None,
        initial_capital: float = 10000.0,
        slippage: float = 0.001,
        commission: float = 0.001,
    ):
        self.data = data
        _validate_positive_finite(initial_capital, "initial_capital")
        _validate_rate(slippage, "slippage")
        _validate_rate(commission, "commission")
        self.initial_capital = float(initial_capital)
        self.slippage = float(slippage)
        self.commission = float(commission)
        self.trades: List[Dict[str, Any]] = []

    # --- متدهای عمومی ---

    def execute_strategy(self, strategy: Union[str, Any], **parameters: Any) -> Dict[str, Any]:
        """اجرای استراتژی بر روی داده‌ی ثبت‌شده.

        آرگومان‌ها:
            strategy: نام استراتژی یا نمونه‌ی کلاس.
            **parameters: پارامترهای خاص استراتژی (مثلاً short_window=50).

        خروجی:
            dict نتایج شبیه‌سازی.
        """
        if self.data is None:
            raise ValueError("داده (data) در موتور تنظیم نشده است.")
        # ساخت شیء استراتژی در صورت نیاز
        strat_obj = strategy
        if isinstance(strategy, str):
            key = strategy.lower().strip().replace(" ", "_").replace("-", "_")
            if key in ("ma_crossover", "moving_average_crossover"):
                strat_obj = MovingAverageCrossoverStrategy(
                    short_window=parameters.get("short_window", 50),
                    long_window=parameters.get("long_window", 200),
                )
            elif key in ("mean_reversion", "bollinger_bands", "mean_reversion_strategy"):
                strat_obj = MeanReversionStrategy(
                    window=parameters.get("window", 20),
                    num_std=parameters.get("num_std", 2),
                )
            elif key in ("ml_based", "ml_based_strategy", "ml"):
                strat_obj = MLBasedStrategy(model=parameters.get("model", None))
            else:
                raise ValueError(f"استراتژی ناشناخته: {strategy}")
        # تولید سیگنال
        signals = generate_signals(strat_obj, self.data)
        # شبیه‌سازی
        cap = parameters.get("initial_capital", self.initial_capital)
        slip = parameters.get("slippage", self.slippage)
        comm = parameters.get("commission", self.commission)
        result = simulate_orders(
            signals,
            initial_capital=_validate_positive_finite(cap, "initial_capital"),
            slippage=_validate_rate(slip, "slippage"),
            commission=_validate_rate(comm, "commission"),
            liquidate_at_end=parameters.get("liquidate_at_end", False),
        )
        self.trades = result.get("trades", [])
        return result

    def generate_signals(self, strategy: Union[str, Any], **parameters: Any) -> pd.DataFrame:
        """تولید سیگنال بر اساس استراتژی."""
        if self.data is None:
            raise ValueError("داده (data) در موتور تنظیم نشده است.")
        strat_obj = strategy
        if isinstance(strategy, str):
            key = strategy.lower().strip().replace(" ", "_").replace("-", "_")
            if key in ("ma_crossover", "moving_average_crossover"):
                strat_obj = MovingAverageCrossoverStrategy(
                    short_window=parameters.get("short_window", 50),
                    long_window=parameters.get("long_window", 200),
                )
            elif key in ("mean_reversion", "bollinger_bands", "mean_reversion_strategy"):
                strat_obj = MeanReversionStrategy(
                    window=parameters.get("window", 20),
                    num_std=parameters.get("num_std", 2),
                )
            elif key in ("ml_based", "ml_based_strategy", "ml"):
                strat_obj = MLBasedStrategy(model=parameters.get("model", None))
            else:
                raise ValueError(f"استراتژی ناشناخته: {strategy}")
        return generate_signals(strat_obj, self.data)

    def simulate_orders(
        self,
        signals: pd.DataFrame,
        initial_capital: Optional[float] = None,
        slippage: Optional[float] = None,
        commission: Optional[float] = None,
        liquidate_at_end: bool = False,
    ) -> Dict[str, Any]:
        """شبیه‌سازی سفارشات از روی سیگنال."""
        return simulate_orders(
            signals,
            initial_capital=initial_capital if initial_capital is not None else self.initial_capital,
            slippage=slippage if slippage is not None else self.slippage,
            commission=commission if commission is not None else self.commission,
            liquidate_at_end=liquidate_at_end,
        )

    # --- پیاده‌سازی خاص هر استراتژی ---

    def _ma_crossover_strategy(self, short_window: int = 50, long_window: int = 200) -> Dict[str, Any]:
        return self.execute_strategy("MA_Crossover", short_window=short_window, long_window=long_window)

    def _mean_reversion_strategy(self, window: int = 20, num_std: float = 2) -> Dict[str, Any]:
        return self.execute_strategy("Mean_Reversion", window=window, num_std=num_std)

    def _ml_based_strategy(self, model: Optional[Any] = None) -> Dict[str, Any]:
        return self.execute_strategy("ML_Based", model=model)
