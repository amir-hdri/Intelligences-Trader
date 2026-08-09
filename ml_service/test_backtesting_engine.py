"""Integration tests for BacktestingEngine, ONNX policy and report artifacts."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from backtesting_engine import BacktestingEngine
from data_loader import DataLoader
from ppo_onnx_strategy import PPOONNXStrategy
from run_backtests import DEFAULT_DATA_DIR, DEFAULT_MODEL_PATH, run_suite, seed_loader_from_snapshots
from strategy_engine import simulate_orders


def _sample_loader(rows: int = 260) -> DataLoader:
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    timestamp = pd.date_range("2023-01-01", periods=rows, freq="D", tz="UTC")
    trend = np.linspace(100.0, 135.0, rows)
    close = trend + np.sin(np.arange(rows) / 7.0) * 8.0
    open_ = np.r_[close[0], close[:-1]]
    frame = pd.DataFrame(
        {
            "timestamp": timestamp.map(lambda value: int(value.timestamp() * 1000)),
            "open": open_,
            "high": np.maximum(open_, close) + 1.0,
            "low": np.minimum(open_, close) - 1.0,
            "close": close,
            "volume": np.full(rows, 1_000.0),
        }
    )
    loader.save_historical_data("TEST", frame, timeframe="1d")
    return loader


def test_backtesting_engine_integrates_modules_and_saves_artifacts(tmp_path):
    engine = BacktestingEngine(_sample_loader(), initial_capital=10_000)
    metrics, equity = engine.run_backtest(
        "TEST",
        "2023-01-01",
        "2023-09-17",
        "1d",
        "Mean_Reversion",
        window=20,
        num_std=1.5,
        output_dir=tmp_path,
        artifact_prefix="integration",
    )

    assert set(metrics) == {
        "total_return",
        "annualized_return",
        "sharpe_ratio",
        "max_drawdown",
        "win_rate",
        "profit_factor",
    }
    assert list(equity.columns) == ["time", "equity", "drawdown"]
    assert engine.last_result is not None
    assert engine.last_result["bars"] == 260
    assert engine.last_result["execution"]["final_position"] == pytest.approx(0.0)
    assert len(engine.last_result["trades"]) > 0
    assert (tmp_path / "integration_equity_curve.png").is_file()
    assert (tmp_path / "integration_drawdown.png").is_file()


def test_backtesting_engine_rejects_an_empty_date_range():
    engine = BacktestingEngine(_sample_loader())
    with pytest.raises(ValueError, match="no historical data"):
        engine.run_backtest(
            "TEST",
            "2030-01-01",
            "2030-02-01",
            "1d",
            "Mean_Reversion",
        )


def test_liquidation_reconciles_profitable_short_trade():
    signals = pd.DataFrame(
        {
            "signal": [-1, 0, 0],
            "size": [0.5, 0.0, 0.0],
            "price": [100.0, 90.0, 80.0],
            "next_open": [100.0, 90.0, np.nan],
        },
        index=pd.date_range("2024-01-01", periods=3, freq="D"),
    )
    result = simulate_orders(
        signals,
        initial_capital=10_000,
        slippage=0.001,
        commission=0.001,
        liquidate_at_end=True,
    )

    assert result["final_position"] == pytest.approx(0.0)
    assert len(result["trades"]) == 1
    assert result["trades"][0]["side"] == "sell"
    assert result["trades"][0]["exit_reason"] == "end_of_backtest"
    assert result["trades"][0]["profit_loss"] > 0
    assert result["final_cash"] == pytest.approx(
        10_000 + result["trades"][0]["profit_loss"]
    )


def test_pretrained_ppo_tcn_predictions_are_causal():
    loader, _ = seed_loader_from_snapshots(DEFAULT_DATA_DIR)
    data = loader.load_historical_data(
        "BTC/USDT",
        "2023-10-27",
        "2024-03-01",
        "1d",
    )
    data.index = pd.to_datetime(data["timestamp"], unit="ms", utc=True)
    strategy = PPOONNXStrategy(DEFAULT_MODEL_PATH)

    prefix = strategy.generate_signal(data.iloc[:80])
    full = strategy.generate_signal(data)

    assert {"signal", "size", "prob_short", "prob_hold", "prob_long"}.issubset(full.columns)
    assert set(full["signal"].unique()).issubset({-1, 0, 1})
    assert full["size"].between(0.0, 1.0).all()
    np.testing.assert_allclose(
        prefix[["prob_short", "prob_hold", "prob_long"]].to_numpy(),
        full.iloc[:80][["prob_short", "prob_hold", "prob_long"]].to_numpy(),
        equal_nan=True,
        rtol=0,
        atol=1e-7,
    )
    assert strategy.last_inference_summary["sequence_length"] == 30
    assert strategy.last_inference_summary["inference_bars"] == len(data) - 29


def test_reproducible_suite_writes_nine_rows_and_eighteen_charts(tmp_path):
    results_path = tmp_path / "backtest_results.csv"
    report_path = tmp_path / "backtest_report.md"
    artifact_dir = tmp_path / "charts"
    results = run_suite(
        data_dir=DEFAULT_DATA_DIR,
        model_path=DEFAULT_MODEL_PATH,
        results_path=results_path,
        report_path=report_path,
        artifact_dir=artifact_dir,
    )

    assert len(results) == 9
    assert set(results["symbol"]) == {"BTC/USDT", "ETH/USDT", "AAPL"}
    assert set(results["strategy"]) == {
        "Moving Average Crossover",
        "Mean Reversion",
        "ML-Based PPO/TCN",
    }
    assert results_path.is_file()
    assert report_path.is_file()
    assert len(list(artifact_dir.glob("*_equity_curve.png"))) == 9
    assert len(list(artifact_dir.glob("*_drawdown.png"))) == 9
    report = report_path.read_text(encoding="utf-8")
    assert "جدول مقایسه‌ای" in report
    assert "PPO/TCN" in report
