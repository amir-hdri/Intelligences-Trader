# Intelligences-Trader ML research pipeline

This directory contains the Python research implementation for:

- a historical data loader and preprocessor (`data_loader.py`) connecting to Phase-1 database boundaries with point-in-time filtering, timeframe resampling, and causal normalization;
- a causal temporal convolutional actor-critic;
- PPO with categorical direction and Beta-distributed position size;
- a Gaussian-HMM volatility regime detector;
- order-book imbalance and rolling normalization features;
- an independent pre-trade circuit breaker.

## Reproducible setup

```bash
uv sync --locked
uv run pytest -q
```

PyTorch and ONNX are optional large dependencies:

```bash
uv sync --locked --extra training
uv run python train.py
```

The generated `market_model.onnx` is a research artifact. Before deployment, publish a model card containing the dataset and feature-schema hashes, scaler parameters, random seeds, training code commit, holdout dates, cost assumptions, calibration results, and approval signature. Do not promote a newly exported model merely because training completed.

## Action and observation contracts

Action: `[direction, size]`

- direction `0`: short
- direction `1`: hold/flat
- direction `2`: long
- size: capital fraction in `[0, 1]`

Observation: `[volatility_regime, drawdown, last_return, current_position, order_book_imbalance]`.

The safety circuit breaker is independent from the learned policy and must remain in the broker boundary for any future paper/live adapter.

## ماژول StrategyEngine (استراتژی معاملاتی)

ماژول `strategy_engine.py` یک موتور انعطاف‌پذیر برای اجرا و آزمون استراتژی‌های معاملاتی است:

- **استراتژی‌های ساده**: Moving Average Crossover، Mean Reversion (Bollinger Bands).
- **استراتژی‌های پیچیده (ML)**: آداپتور برای مدل‌های یادگیری ماشین با متد `.predict()`.
- **توابع عمومی**: `generate_signals(strategy, data)`، `simulate_orders(signals, initial_capital, slippage=0.001, commission=0.001)`، `execute_strategy(strategy, data)`.
- **موتور کلاس**: `StrategyEngine` با متدهای `execute_strategy`، `generate_signals` و `simulate_orders`.
- **ویژگی‌ها**: اعتبارسنجی دقیق (`ValueError` با پیام توصیفی)، محاسبه‌ی نقطه‌ای-زمانی (Next-Bar-Open)، پشتیبانی از موقعیت کوتاه/بلند، محاسبه‌ی معیارها (Sharpe، Max Drawdown، Profit Factor، Commission/Slippage totals)؛ مستندات به زبان فارسی در docstrings و کامنت‌ها.
- **تست‌ها**: `test_strategy_engine.py` با ۱۸ تست واحد (pytest) شامل تست‌های اعتبارسنجی، سیگنال، شبیه‌سازی، کوتاه، و معیار عملکرد.

برای اجرای تست‌ها:
```bash
uv run pytest test_strategy_engine.py -q --strict-markers
```

## Performance Metrics Calculator

`performance_metrics.py` معیارهای عملکرد را مستقیماً از معاملات بسته‌شده‌ی
`StrategyEngine` محاسبه می‌کند و برای گزارش‌گیری دو نمودار matplotlib تولید
می‌کند. رکوردهای موتور از کلید `profit_loss` استفاده می‌کنند؛ برای سازگاری با
دفترکل‌های دیگر کلیدهای `pnl`، `net_pnl`، `netPnl` و `profit` نیز پذیرفته
می‌شوند. معامله‌ای که P/L آن `None` باشد باز و تحقق‌نیافته در نظر گرفته می‌شود
و در معیارها وارد نمی‌شود.

```python
from performance_metrics import PerformanceMetrics
from strategy_engine import execute_strategy

result = execute_strategy("MA_Crossover", data, initial_capital=10_000)
report = PerformanceMetrics(result["trades"], initial_capital=10_000)
metrics = report.calculate_metrics()
print(metrics)

# Creates artifacts/equity_curve.png and artifacts/drawdown.png.
paths = report.save_plots("artifacts")

# Or receive the metrics and both chart paths together.
full_report = report.generate_report("artifacts")
```

معیارهای خروجی عبارت‌اند از `total_return`، `annualized_return`،
`sharpe_ratio`، `max_drawdown`، `win_rate` و `profit_factor`. برای جلوگیری از
خروجی JSON نامعتبر، Profit Factor در حالتی که معامله‌ی زیان‌ده وجود نداشته
باشد `None` است. `max_drawdown` با قرارداد موتور به‌صورت signed (صفر یا مقدار
منفی) گزارش می‌شود؛ مقدار مطلق آن درصد افت سرمایه را نشان می‌دهد. در صورت
نبود timestamp، برای annualization به‌صورت قطعی یک روز برای هر معامله فرض
می‌شود.

## موتور یکپارچه‌ی Backtesting

کلاس `BacktestingEngine` در `backtesting_engine.py` سه مرز `DataLoader`،
`StrategyEngine` و `PerformanceMetrics` را یکپارچه می‌کند. اجرای مرجع از سه
snapshot واقعی و ثابت BTC/USDT، ETH/USDT و AAPL استفاده می‌کند و هر سه
استراتژی MA(50/200)، Mean Reversion(20,2) و مدل ازپیش‌آموزش‌دیده‌ی PPO/TCN
در `market_model.onnx` را می‌آزماید:

```bash
uv sync --locked
uv run python run_backtests.py
```

خروجی‌های بازتولیدپذیر:

- `backtest_results.csv`: ۹ اجرای مقایسه‌ای (۳ نماد × ۳ استراتژی)
- `backtest_report.md`: جدول، تحلیل، محدودیت‌های مدل و منشأ داده
- `backtest_artifacts/*_equity_curve.png` و `*_drawdown.png`: ۱۸ نمودار
- `data/historical/manifest.json`: URL، commit و SHA-256 هر snapshot

سیگنال‌ها در Close ساخته و در Open کندل بعدی اجرا می‌شوند. موتور یکپارچه
موقعیت انتهای بازه را در آخرین Close تسویه می‌کند تا P/L و هزینه‌های دو سمت
به‌طور کامل در دفتر معاملات ثبت شوند. مدل ONNX با قرارداد `[batch, 30, 5]`
اجرا می‌شود؛ در نبود داده‌ی L2، ویژگی OBI صریحاً صفر خنثی است. مدل موجود روی
داده‌ی مصنوعی آموزش دیده، بنابراین خروجی ML فقط آزمون یکپارچگی پژوهشی است.
نام رشته‌ای `ML_Based` نیز مستقیماً آداپتورهای sequence-aware را می‌پذیرد:

```python
from backtesting_engine import BacktestingEngine
from ppo_onnx_strategy import PPOONNXStrategy

engine = BacktestingEngine(data_loader)
policy = PPOONNXStrategy("market_model.onnx")
metrics, equity = engine.run_backtest(
    "BTC/USDT", "2023-10-27", "2024-11-29", "1d",
    "ML_Based", model=policy,
)
```

برای نصب وابستگی‌ها و اجرای کل تست‌های Python:

```bash
uv sync --locked
uv run pytest -q
```
