"""Reproduce the three-symbol × three-strategy integration backtest report."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Mapping, Sequence

import numpy as np
import pandas as pd

try:
    from backtesting_engine import BacktestingEngine
    from data_loader import DataLoader
    from ppo_onnx_strategy import PPOONNXStrategy
except ImportError:  # pragma: no cover - package execution path
    from ml_service.backtesting_engine import BacktestingEngine
    from ml_service.data_loader import DataLoader
    from ml_service.ppo_onnx_strategy import PPOONNXStrategy

HERE = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = HERE / "data" / "historical"
DEFAULT_MODEL_PATH = HERE / "market_model.onnx"
DEFAULT_RESULTS_PATH = HERE / "backtest_results.csv"
DEFAULT_REPORT_PATH = HERE / "backtest_report.md"
DEFAULT_ARTIFACT_DIR = HERE / "backtest_artifacts"
START_DATE = "2023-10-27"
END_DATE = "2024-11-29"
TIMEFRAME = "1d"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def seed_loader_from_snapshots(data_dir: Path) -> tuple[DataLoader, Mapping[str, Any]]:
    """Verify immutable snapshot hashes and seed an in-memory DataLoader."""

    manifest_path = data_dir / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"snapshot manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    datasets = manifest.get("datasets")
    if not isinstance(datasets, list) or len(datasets) < 3:
        raise ValueError("snapshot manifest must contain at least three datasets")

    loader = DataLoader(db_url=":memory:", auto_seed=False)
    for dataset in datasets:
        path = data_dir / dataset["file"]
        if not path.is_file():
            raise FileNotFoundError(f"historical snapshot not found: {path}")
        actual_hash = _sha256(path)
        if actual_hash != dataset["sha256"]:
            raise ValueError(f"snapshot hash mismatch: {path.name}")
        frame = pd.read_csv(path)
        loader.save_historical_data(
            dataset["symbol"],
            frame,
            timeframe=dataset["timeframe"],
        )
    return loader, manifest


def _strategy_specs(model_path: Path) -> Sequence[Dict[str, Any]]:
    model = PPOONNXStrategy(model_path)
    return (
        {
            "name": "Moving Average Crossover",
            "slug": "moving_average_crossover",
            "strategy": "Moving_Average_Crossover",
            "parameters": {"short_window": 50, "long_window": 200},
        },
        {
            "name": "Mean Reversion",
            "slug": "mean_reversion",
            "strategy": "Mean_Reversion",
            "parameters": {"window": 20, "num_std": 2},
        },
        {
            "name": "ML-Based PPO/TCN",
            "slug": "ppo_tcn_onnx",
            "strategy": model,
            "parameters": {},
        },
    )


def run_suite(
    data_dir: Path = DEFAULT_DATA_DIR,
    model_path: Path = DEFAULT_MODEL_PATH,
    results_path: Path = DEFAULT_RESULTS_PATH,
    report_path: Path = DEFAULT_REPORT_PATH,
    artifact_dir: Path = DEFAULT_ARTIFACT_DIR,
) -> pd.DataFrame:
    """Run all nine backtests and write CSV, Markdown and PNG artifacts."""

    data_dir = Path(data_dir).resolve()
    model_path = Path(model_path).resolve()
    results_path = Path(results_path).resolve()
    report_path = Path(report_path).resolve()
    artifact_dir = Path(artifact_dir).resolve()
    if not model_path.is_file():
        raise FileNotFoundError(f"pretrained ONNX model not found: {model_path}")

    loader, manifest = seed_loader_from_snapshots(data_dir)
    engine = BacktestingEngine(
        loader,
        initial_capital=10_000.0,
        slippage=0.001,
        commission=0.001,
        risk_free_rate=0.02,
    )
    strategy_specs = _strategy_specs(model_path)
    symbol_rows = manifest["datasets"]
    rows: List[Dict[str, Any]] = []
    artifact_dir.mkdir(parents=True, exist_ok=True)

    for dataset in symbol_rows:
        symbol = dataset["symbol"]
        symbol_slug = symbol.lower().replace("/", "_")
        for spec in strategy_specs:
            prefix = f"{symbol_slug}_{spec['slug']}"
            metrics, _ = engine.run_backtest(
                symbol,
                START_DATE,
                END_DATE,
                TIMEFRAME,
                spec["strategy"],
                output_dir=artifact_dir,
                artifact_prefix=prefix,
                **spec["parameters"],
            )
            assert engine.last_result is not None
            execution = engine.last_result["execution"]
            trades = engine.last_result["trades"]
            model_summary: Mapping[str, Any] = {}
            if isinstance(spec["strategy"], PPOONNXStrategy):
                model_summary = spec["strategy"].last_inference_summary

            row = {
                "symbol": symbol,
                "strategy": spec["name"],
                "parameters": json.dumps(spec["parameters"], sort_keys=True),
                "start_date": START_DATE,
                "end_date": END_DATE,
                "timeframe": TIMEFRAME,
                "bars": engine.last_result["bars"],
                "trade_count": len(trades),
                "final_equity": float(execution["final_cash"]),
                "total_return": metrics["total_return"],
                "annualized_return": metrics["annualized_return"],
                "sharpe_ratio": metrics["sharpe_ratio"],
                "max_drawdown": metrics["max_drawdown"],
                "win_rate": metrics["win_rate"],
                "profit_factor": metrics["profit_factor"],
                "total_commission": float(sum(trade.get("commission", 0.0) for trade in trades)),
                "total_slippage_cost": float(sum(trade.get("slippage_cost", 0.0) for trade in trades)),
                "model_warmup_bars": model_summary.get("warmup_bars"),
                "model_short_signals": model_summary.get("short_signals"),
                "model_hold_signals": model_summary.get("hold_signals"),
                "model_long_signals": model_summary.get("long_signals"),
                "equity_curve_file": os.path.relpath(
                    engine.last_result["artifacts"]["equity_curve"],
                    results_path.parent,
                ).replace(os.sep, "/"),
                "drawdown_file": os.path.relpath(
                    engine.last_result["artifacts"]["drawdown"],
                    results_path.parent,
                ).replace(os.sep, "/"),
            }
            rows.append(row)

    results = pd.DataFrame(rows)
    results_path.parent.mkdir(parents=True, exist_ok=True)
    results.to_csv(results_path, index=False, float_format="%.10f")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        build_markdown_report(
            results,
            manifest=manifest,
            model_path=model_path,
            report_path=report_path,
            results_path=results_path,
        ),
        encoding="utf-8",
    )
    return results


def _display_number(value: Any, digits: int = 3) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "—"
    return f"{float(value):.{digits}f}"


def _display_percent(value: Any) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "—"
    return f"{float(value) * 100:.2f}%"


def _relative_link(target: Path, report_path: Path) -> str:
    return os.path.relpath(target, report_path.parent).replace(os.sep, "/")


def build_markdown_report(
    results: pd.DataFrame,
    *,
    manifest: Mapping[str, Any],
    model_path: Path,
    report_path: Path,
    results_path: Path,
) -> str:
    """Create a Persian comparison report directly from measured outputs."""

    lines = [
        "# گزارش یکپارچه‌ی موتور Backtesting",
        "",
        "> **وضعیت:** آزمایش پژوهشی و شبیه‌سازی؛ این نتایج توصیه‌ی سرمایه‌گذاری یا ادعای عملکرد زنده نیستند.",
        "",
        "## تنظیمات آزمایش",
        "",
        f"- بازه: `{START_DATE}` تا `{END_DATE}`، تایم‌فریم `{TIMEFRAME}`",
        "- سرمایه‌ی اولیه‌ی هر اجرا: `10,000`؛ Slippage: `0.1%`؛ Commission: `0.1%` در هر سمت",
        "- اجرا: سیگنال در پایان کندل و معامله در Open کندل بعدی (Next-Bar-Open)",
        "- تسویه: هر موقعیت باز در آخرین Close بسته شده و هزینه‌ی خروج در P/L منظور شده است.",
        "- معیارها از دفتر معاملات بسته‌شده‌ی `PerformanceMetrics` محاسبه شده‌اند؛ Drawdown به‌صورت signed گزارش می‌شود.",
        f"- CSV کامل: [`{results_path.name}`]({_relative_link(results_path, report_path)})",
        "",
        "## جدول مقایسه‌ای",
        "",
        "| نماد | استراتژی | کندل | معامله | سرمایه نهایی | بازده کل | بازده سالانه | Sharpe | Max DD | Win Rate | Profit Factor | کارمزد | لغزش |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in results.to_dict("records"):
        lines.append(
            "| {symbol} | {strategy} | {bars} | {trades} | {equity} | {total} | "
            "{annual} | {sharpe} | {drawdown} | {wins} | {pf} | {commission} | {slippage} |".format(
                symbol=row["symbol"],
                strategy=row["strategy"],
                bars=int(row["bars"]),
                trades=int(row["trade_count"]),
                equity=f"{float(row['final_equity']):,.2f}",
                total=_display_percent(row["total_return"]),
                annual=_display_percent(row["annualized_return"]),
                sharpe=_display_number(row["sharpe_ratio"]),
                drawdown=_display_percent(row["max_drawdown"]),
                wins=_display_percent(row["win_rate"]),
                pf=_display_number(row["profit_factor"]),
                commission=f"{float(row['total_commission']):,.2f}",
                slippage=f"{float(row['total_slippage_cost']):,.2f}",
            )
        )

    ranked = results.sort_values("total_return", ascending=False)
    best = ranked.iloc[0]
    worst = ranked.iloc[-1]
    averages = results.groupby("strategy", as_index=False)["total_return"].mean().sort_values(
        "total_return", ascending=False
    )
    positive = int((results["total_return"] > 0).sum())
    ml_rows = results.loc[results["strategy"] == "ML-Based PPO/TCN"]
    ml_hold = int(ml_rows["model_hold_signals"].fillna(0).sum())
    ml_directional = int(
        ml_rows[["model_short_signals", "model_long_signals"]].fillna(0).to_numpy().sum()
    )
    lines.extend(
        [
            "",
            "## تحلیل نتایج",
            "",
            f"- بهترین اجرای این نمونه **{best['strategy']} روی {best['symbol']}** با بازده {_display_percent(best['total_return'])} بود.",
            f"- ضعیف‌ترین اجرا **{worst['strategy']} روی {worst['symbol']}** با بازده {_display_percent(worst['total_return'])} بود.",
            f"- از ۹ اجرا، {positive} اجرا بازده مثبت داشتند.",
            "- میانگین بازده استراتژی‌ها روی سه نماد: "
            + "، ".join(
                f"**{row.strategy}** = {_display_percent(row.total_return)}"
                for row in averages.itertuples(index=False)
            )
            + ".",
            "- مقایسه‌ی مستقیم Sharpe باید با احتیاط انجام شود: قرارداد فعلی `PerformanceMetrics` بازده هر معامله را نسبت به سرمایه‌ی اولیه و نرخ بدون ریسک را به‌ازای هر مشاهده اعمال می‌کند.",
            "- مدل PPO/TCN واقعاً از artifact موجود ONNX اجرا شده است؛ خروجی اندازه‌ی مدل برای اندازه‌ی موقعیت استفاده می‌شود. چون OHLCV داده‌ی L2 ندارد، ویژگی OBI با مقدار خنثی صفر پر شده است.",
            f"- مدل پس از warm-up در مجموع {ml_hold} تصمیم Hold و {ml_directional} تصمیم جهت‌دار صادر کرد؛ صفر بودن معامله/بازده ML نتیجه‌ی مستقیم خروجی مدل است، نه جایگزینی نتیجه‌ی ساختگی.",
            "- مدل فعلی در `train.py` روی داده‌ی مصنوعی آموزش دیده و model card تأییدشده ندارد؛ بنابراین نتیجه‌ی ML صرفاً sanity check یکپارچه‌سازی است و اعتبار out-of-sample تجاری محسوب نمی‌شود.",
            "",
            "## پیشنهادهای بهبود",
            "",
            "1. Walk-forward validation و تقسیم زمانی train/validation/test با دوره‌های بازار متفاوت اضافه شود.",
            "2. مدل PPO/TCN روی snapshot واقعیِ نسخه‌بندی‌شده بازآموزی و همراه با scaler، feature schema، seed و model card منتشر شود.",
            "3. برای ML داده‌ی واقعی L2/OBI تهیه شود؛ جای‌گذاری صفر تنها یک fallback شفاف است.",
            "4. اندازه‌ی موقعیت، حدود exposure، stop-loss و circuit breaker در سناریوهای stress و هزینه‌های متفاوت بررسی شوند.",
            "5. برای سهام، تقویم ۲۵۲روزه و برای کریپتو تقویم ۳۶۵روزه به‌صورت جداگانه در annualization/Sharpe پشتیبانی شود.",
            "6. Bootstrap confidence interval، معیار Buy-and-Hold و آزمون حساسیت Slippage/Commission به گزارش افزوده شود.",
            "",
            "## نمودارهای Equity Curve و Drawdown",
            "",
        ]
    )
    for row in results.to_dict("records"):
        equity = _relative_link(
            (results_path.parent / row["equity_curve_file"]).resolve(),
            report_path,
        )
        drawdown = _relative_link(
            (results_path.parent / row["drawdown_file"]).resolve(),
            report_path,
        )
        title = f"{row['symbol']} — {row['strategy']}"
        lines.extend(
            [
                f"### {title}",
                "",
                f"![Equity Curve — {title}]({equity})",
                "",
                f"![Drawdown — {title}]({drawdown})",
                "",
            ]
        )

    lines.extend(
        [
            "## منشأ و قابلیت بازتولید داده",
            "",
            "| نماد | منبع | تعداد | اولین/آخرین روز | SHA-256 |",
            "|---|---|---:|---|---|",
        ]
    )
    for dataset in manifest["datasets"]:
        lines.append(
            f"| {dataset['symbol']} | [{dataset['source_name']}]({dataset['source_url']}) | "
            f"{dataset['rows']} | {dataset['first_date']} / {dataset['last_date']} | `{dataset['sha256']}` |"
        )
    model_data_path = model_path.with_name(model_path.name + ".data")
    lines.extend(
        [
            "",
            f"- مدل ONNX: `{model_path.name}` — SHA-256: `{_sha256(model_path)}`",
            f"- tensor data: `{model_data_path.name}` — SHA-256: `{_sha256(model_data_path)}`",
            "",
            "## اجرای مجدد",
            "",
            "```bash",
            "cd ml_service",
            "uv sync --locked",
            "uv run python run_backtests.py",
            "uv run pytest -q",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--artifacts", type=Path, default=DEFAULT_ARTIFACT_DIR)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    results = run_suite(
        data_dir=args.data_dir,
        model_path=args.model,
        results_path=args.results,
        report_path=args.report,
        artifact_dir=args.artifacts,
    )
    print(results.to_string(index=False))
    print(f"\nWrote {args.results}, {args.report}, and {args.artifacts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
