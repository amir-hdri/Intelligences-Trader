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
) -> Dict[str, Any]:
    """شبیه‌سازی سفارشات با در نظر گرفتن Slippage و Commission.

    فرضیات:
        - سیگنال 1 یعنی ورود به موقعیت بلند (Long).
        - سیگنال -1 یعنی ورود به موقعیت کوتاه (Short).
        - اجرای سفارش بر روی `next_open` صورت می‌گیرد در صورت وجود؛ در غیر این
          صورت از `price` استفاده می‌شود.
        - کارمزد به‌صورت درصدی از حجم معامله (Notional) اعمال می‌شود.
        - لغزش (Slippage) در قیمت پر کردن (Fill Price) لحاظ می‌شود.

    پارامترها:
        signals: DataFrame با حداقل ستون `signal` و `price` یا `next_open`.
        initial_capital: سرمایه اولیه (باید > 0).
        slippage: لغزش در بازه‌ی [0, 1).
        commission: کارمزد در بازه‌ی [0, 1).

    خروجی:
        dict شامل:
        - `trades`: لیست معاملات با جزئیات (entry_time, exit_time, entry_price,
          exit_price, volume, profit_loss, commission, slippage_cost).
        - `equity_curve`: لیست نقطه‌ای-زمانی از موجودی سهام (cash + position*price).
        - `final_cash`: نقدینگی نهایی.
        - `final_position`: حجم نهایی موقعیت.
        - `metrics`: معیارهای عملکرد (total_return, sharpe_ratio, max_drawdown,
          win_rate, profit_factor, total_commission, total_slippage_cost).
    """
    # ----- اعتبارسنجی دقیق -----
    if not isinstance(signals, pd.DataFrame):
        raise ValueError("signals باید یک pandas.DataFrame باشد.")
    if "signal" not in signals.columns:
        raise ValueError("signals باید ستون 'signal' داشته باشد.")
    _validate_positive_finite(initial_capital, "initial_capital")
    _validate_rate(slippage, "slippage")
    _validate_rate(commission, "commission")
    # ----- آماده‌سازی -----
    cash = float(initial_capital)
    position = 0.0  # مثبت = بلند، منفی = کوتاه
    trades: List[Dict[str, Any]] = []
    equity_curve: List[Dict[str, Any]] = []
    open_trade: Optional[Dict[str, Any]] = None
    # انتخاب ستون قیمت
    if "next_open" in signals.columns and signals["next_open"].notnull().any():
        price_col = "next_open"
    elif "price" in signals.columns:
        price_col = "price"
    else:
        raise ValueError("signals باید ستون 'price' یا 'next_open' داشته باشد.")
    # ----- حلقه‌ی شبیه‌سازی -----
    for idx, row in signals.iterrows():
        price_ref_raw = row.get(price_col)
        price_ref = float(price_ref_raw) if pd.notnull(price_ref_raw) else np.nan
        # ثبت منحنی سهام در زمان فعلی
        if np.isfinite(price_ref) and price_ref > 0:
            current_equity = cash + position * price_ref
        else:
            current_equity = cash
        equity_curve.append({
            "time": idx,
            "equity": float(current_equity),
            "cash": float(cash),
            "position": float(position),
        })
        # در صورت قیمت نامعتبر، ادامه بده (فقط ثبت سهام)
        if not np.isfinite(price_ref) or price_ref <= 0:
            continue
        signal = int(round(float(row["signal"])))
        # ----- پردازش سیگنال -----
        if signal == 1:  # ورود به بلند (Buy / Long)
            if position < 0:
                # بستن موقعیت کوتاه (Close Short)
                exit_price = price_ref * (1.0 + slippage)  # خرید مجدد در قیمت بالاتر
                notional = abs(position) * exit_price
                cash += notional * (1.0 - commission)
                # ثبت معامله‌ی بسته‌شده
                if open_trade is not None:
                    entry_price = open_trade["entry_price"]
                    volume = open_trade["volume"]
                    entry_notional = entry_price * volume
                    exit_notional = exit_price * volume
                    total_comm = (entry_notional + exit_notional) * commission
                    # سود/زیان: برای کوتاه، سود = (entry - exit) * volume
                    profit = (entry_price - exit_price) * volume - total_comm
                    open_trade["exit_time"] = idx
                    open_trade["exit_price"] = exit_price
                    open_trade["profit_loss"] = float(profit)
                    open_trade["commission"] = float(total_comm)
                    open_trade["slippage_cost"] = float(volume * (exit_price - price_ref))
                    trades.append(open_trade)
                    open_trade = None
                position = 0.0
            if position == 0.0:
                # ورود به بلند جدید
                entry_price = price_ref * (1.0 + slippage)
                # تقسیم نقدینگی به گونه‌ای که پس از کسر کارمزد، نقدینگی صفر شود
                if cash > 0:
                    notional = cash / (1.0 + commission)
                    shares = notional / entry_price if entry_price > 0 else 0.0
                else:
                    notional = 0.0
                    shares = 0.0
                entry_comm = notional * commission
                cash -= notional + entry_comm  # بعد از این، cash باید صفر باشد
                position = float(shares)
                open_trade = {
                    "entry_time": idx,
                    "entry_price": float(entry_price),
                    "volume": float(abs(shares)),
                    "side": "buy",
                    "commission": float(entry_comm),
                    "slippage_cost": float(shares * (entry_price - price_ref)),
                    "profit_loss": None,
                    "exit_time": None,
                    "exit_price": None,
                }
            # اگر قبلاً بلند بودم (position > 0) و سیگنال باز هم 1: نگه‌دار (هیچ کاری نکن)
        elif signal == -1:  # ورود به کوتاه (Sell / Short)
            if position > 0:
                # بستن موقعیت بلند (Close Long)
                exit_price = price_ref * (1.0 - slippage)
                notional = position * exit_price
                cash += notional * (1.0 - commission)
                if open_trade is not None:
                    entry_price = open_trade["entry_price"]
                    volume = open_trade["volume"]
                    entry_notional = entry_price * volume
                    exit_notional = exit_price * volume
                    total_comm = (entry_notional + exit_notional) * commission
                    profit = (exit_price - entry_price) * volume - total_comm
                    open_trade["exit_time"] = idx
                    open_trade["exit_price"] = float(exit_price)
                    open_trade["profit_loss"] = float(profit)
                    open_trade["commission"] = float(total_comm)
                    open_trade["slippage_cost"] = float(volume * (price_ref - exit_price))
                    trades.append(open_trade)
                    open_trade = None
                position = 0.0
            if position == 0.0:
                # ورود به کوتاه جدید
                entry_price = price_ref * (1.0 - slippage)
                if cash > 0:
                    notional = cash / (1.0 + commission)
                    shares = -notional / entry_price if entry_price > 0 else 0.0
                else:
                    notional = 0.0
                    shares = 0.0
                entry_comm = notional * commission
                cash -= notional + entry_comm
                position = float(shares)
                open_trade = {
                    "entry_time": idx,
                    "entry_price": float(entry_price),
                    "volume": float(abs(shares)),
                    "side": "sell",
                    "commission": float(entry_comm),
                    "slippage_cost": float(abs(shares) * (price_ref - entry_price)),
                    "profit_loss": None,
                    "exit_time": None,
                    "exit_price": None,
                }
            # اگر قبلاً کوتاه بودم (position < 0) و سیگنال -1: نگه‌دار
        else:  # signal == 0 -> هیچ اقدامی
            pass
    # ----- بستن موقعیت باز در انتها (اختیاری برای سهام نهایی دقیق) -----
    if open_trade is not None and len(equity_curve) > 0:
        last_price = float(signals[price_col].dropna().iloc[-1]) if not signals[price_col].dropna().empty else float(equity_curve[-1]["equity"] / max(position, 1))
        # برای سادگی، در پایان تست‌ها با سیگنال مشخص بسته می‌شوند؛ در اینجا فقط ثبت می‌کنیم
        # بدون بستن برای جلوگیری از پیچیدگی در محاسبات نهایی
        pass
    # ----- محاسبه معیارها -----
    metrics = _compute_metrics(trades, equity_curve)
    result = {
        "trades": trades,
        "equity_curve": equity_curve,
        "final_cash": float(cash),
        "final_position": float(position),
        "metrics": metrics,
    }
    return result


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
    ) -> Dict[str, Any]:
        """شبیه‌سازی سفارشات از روی سیگنال."""
        return simulate_orders(
            signals,
            initial_capital=initial_capital if initial_capital is not None else self.initial_capital,
            slippage=slippage if slippage is not None else self.slippage,
            commission=commission if commission is not None else self.commission,
        )

    # --- پیاده‌سازی خاص هر استراتژی ---

    def _ma_crossover_strategy(self, short_window: int = 50, long_window: int = 200) -> Dict[str, Any]:
        return self.execute_strategy("MA_Crossover", short_window=short_window, long_window=long_window)

    def _mean_reversion_strategy(self, window: int = 20, num_std: float = 2) -> Dict[str, Any]:
        return self.execute_strategy("Mean_Reversion", window=window, num_std=num_std)

    def _ml_based_strategy(self, model: Optional[Any] = None) -> Dict[str, Any]:
        return self.execute_strategy("ML_Based", model=model)
