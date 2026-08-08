"""Unit tests for the PerformanceMetrics calculator and report charts."""

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from performance_metrics import PerformanceMetrics


@pytest.fixture
def trades():
    start = datetime(2024, 1, 1)
    return [
        {
            "entry_time": start,
            "exit_time": start + timedelta(days=2),
            "profit_loss": 100.0,
        },
        {
            "entry_time": start + timedelta(days=3),
            "exit_time": start + timedelta(days=6),
            "profit_loss": -50.0,
        },
        {
            "entry_time": start + timedelta(days=7),
            "exit_time": start + timedelta(days=10),
            "profit_loss": 200.0,
        },
    ]


def test_total_return(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)

    assert calculator._calculate_total_return() == pytest.approx(0.025)


def test_annualized_return_uses_trade_dates(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)
    expected = (1.025) ** (365 / 10) - 1

    assert calculator._calculate_annualized_return() == pytest.approx(expected)


def test_annualized_return_has_deterministic_fallback_without_dates():
    calculator = PerformanceMetrics(
        [{"profit_loss": 100.0}, {"profit_loss": 100.0}],
        initial_capital=10_000,
    )
    expected = (1.02) ** (365 / 2) - 1

    assert calculator._calculate_annualized_return() == pytest.approx(expected)


def test_annualized_return_handles_total_loss():
    calculator = PerformanceMetrics([{"profit_loss": -10_000}], 10_000)

    assert calculator._calculate_annualized_return() == -1.0


def test_sharpe_ratio_is_a_float_and_uses_requested_formula(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000, risk_free_rate=0.02)
    returns = np.asarray([0.01, -0.005, 0.02])
    expected = (returns.mean() - 0.02) / returns.std()

    sharpe = calculator._calculate_sharpe_ratio()

    assert isinstance(sharpe, float)
    assert sharpe == pytest.approx(expected)


def test_sharpe_ratio_is_zero_when_returns_have_no_variance():
    calculator = PerformanceMetrics(
        [{"profit_loss": 100.0}, {"profit_loss": 100.0}],
        initial_capital=10_000,
    )

    assert calculator._calculate_sharpe_ratio() == 0.0


def test_max_drawdown_is_signed_and_uses_running_peak(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)

    # Equity: 10,000 -> 10,100 -> 10,050 -> 10,250.
    assert calculator._calculate_max_drawdown() == pytest.approx(-50 / 10_100)


def test_win_rate_counts_only_positive_realised_trades(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)

    assert calculator._calculate_win_rate() == pytest.approx(2 / 3)


def test_profit_factor_is_gross_profit_over_gross_loss(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)

    assert calculator._calculate_profit_factor() == pytest.approx(6.0)


def test_empty_and_open_trades_are_safe():
    calculator = PerformanceMetrics(
        [{"profit_loss": None}, {"profit_loss": 0.0}],
        initial_capital=10_000,
    )

    metrics = calculator.calculate_metrics()

    assert metrics == {
        "total_return": 0.0,
        "annualized_return": 0.0,
        "sharpe_ratio": 0.0,
        "max_drawdown": 0.0,
        "win_rate": 0.0,
        "profit_factor": None,
    }


def test_profit_factor_is_none_when_there_are_no_losses():
    calculator = PerformanceMetrics(
        [{"profit_loss": 100.0}, {"profit_loss": 25.0}],
        initial_capital=10_000,
    )

    assert calculator._calculate_profit_factor() is None


def test_ledger_aliases_are_supported():
    calculator = PerformanceMetrics(
        [{"realizedPnl": 100.0}, {"netPnl": -20.0}],
        initial_capital=10_000,
    )

    assert calculator.calculate_metrics()["profit_factor"] == pytest.approx(5.0)


def test_dataframe_and_single_mapping_inputs_are_supported():
    frame = pd.DataFrame({"profit_loss": [100.0, -25.0]})
    from_frame = PerformanceMetrics(frame, initial_capital=10_000)
    from_mapping = PerformanceMetrics({"profit_loss": 100.0}, initial_capital=10_000)

    assert from_frame._calculate_profit_factor() == pytest.approx(4.0)
    assert from_mapping._calculate_total_return() == pytest.approx(0.01)


def test_nan_pnl_is_treated_as_unrealised_and_infinite_pnl_is_rejected():
    calculator = PerformanceMetrics(
        [{"profit_loss": np.nan}, {"profit_loss": 100.0}],
        initial_capital=10_000,
    )
    assert calculator._calculate_total_return() == pytest.approx(0.01)

    with pytest.raises(ValueError, match="non-finite"):
        PerformanceMetrics([{"profit_loss": np.inf}], 10_000).calculate_metrics()


def test_calculate_metrics_returns_all_requested_keys(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)

    assert set(calculator.calculate_metrics()) == {
        "total_return",
        "annualized_return",
        "sharpe_ratio",
        "max_drawdown",
        "win_rate",
        "profit_factor",
    }


def test_equity_curve_data_contains_initial_point_and_drawdown(trades):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)
    curve = calculator.get_equity_curve()

    assert list(curve.columns) == ["time", "equity", "drawdown"]
    assert len(curve) == 4
    assert curve["equity"].tolist() == pytest.approx([10_000, 10_100, 10_050, 10_250])
    assert curve["drawdown"].min() == pytest.approx(-50 / 10_100)


def test_unsorted_timestamped_trades_are_processed_chronologically():
    late = datetime(2024, 1, 3)
    early = datetime(2024, 1, 2)
    calculator = PerformanceMetrics(
        [
            {"timestamp": late, "profit_loss": -50.0},
            {"timestamp": early, "profit_loss": 100.0},
        ],
        initial_capital=10_000,
    )

    curve = calculator.get_equity_curve()
    assert curve["equity"].tolist() == pytest.approx([10_000, 10_100, 10_050])
    assert calculator._calculate_max_drawdown() == pytest.approx(-50 / 10_100)


def test_zero_numeric_timestamps_are_not_lost():
    calculator = PerformanceMetrics(
        [
            {"entry_time": 0, "exit_time": 1, "profit_loss": 100.0},
            {"entry_time": 2, "exit_time": 3, "profit_loss": -50.0},
        ],
        initial_capital=10_000,
    )

    assert calculator._period_days() == pytest.approx(3.0)
    assert calculator._calculate_total_return() == pytest.approx(0.005)


def test_update_trades_recomputes_derived_values():
    calculator = PerformanceMetrics([{"profit_loss": 100.0}], 10_000)
    assert calculator._calculate_total_return() == pytest.approx(0.01)

    calculator.update_trades([{"profit_loss": -100.0}])
    assert calculator._calculate_total_return() == pytest.approx(-0.01)


def test_chart_generation_and_png_artifacts(trades, tmp_path, monkeypatch):
    calculator = PerformanceMetrics(trades, initial_capital=10_000)
    equity_path = tmp_path / "reports" / "equity_curve.png"
    drawdown_path = tmp_path / "reports" / "drawdown.png"

    equity_figure = calculator.generate_equity_curve(equity_path)
    drawdown_figure = calculator.generate_drawdown(drawdown_path)

    assert equity_figure.__class__.__name__ == "Figure"
    assert drawdown_figure.__class__.__name__ == "Figure"
    assert equity_path.is_file() and equity_path.stat().st_size > 0
    assert drawdown_path.is_file() and drawdown_path.stat().st_size > 0

    saved = calculator.save_plots(tmp_path / "standard")
    assert saved["equity_curve"].name == "equity_curve.png"
    assert saved["drawdown"].name == "drawdown.png"
    assert all(path.is_file() for path in saved.values())

    # The no-argument methods also produce the requested default artifacts.
    monkeypatch.chdir(tmp_path)
    calculator.generate_equity_curve()
    calculator.generate_drawdown()
    assert (tmp_path / "equity_curve.png").is_file()
    assert (tmp_path / "drawdown.png").is_file()

    # Do not leave GUI resources open when this test is run repeatedly.
    import matplotlib.pyplot as plt

    plt.close("all")


def test_generate_report_returns_metrics_and_chart_paths(trades, tmp_path):
    report = PerformanceMetrics(trades, initial_capital=10_000).generate_report(tmp_path)

    assert set(report) == {"metrics", "charts"}
    assert report["metrics"]["win_rate"] == pytest.approx(2 / 3)
    assert all(path.is_file() for path in report["charts"].values())


def test_invalid_constructor_values_and_trade_types():
    with pytest.raises(ValueError, match="initial_capital"):
        PerformanceMetrics([], initial_capital=0)
    with pytest.raises(ValueError, match="risk_free_rate"):
        PerformanceMetrics([], initial_capital=100, risk_free_rate=float("nan"))
    with pytest.raises(TypeError, match="iterable"):
        PerformanceMetrics("not-a-trade-list", initial_capital=100)
    with pytest.raises(TypeError, match="trade at index"):
        PerformanceMetrics([1], initial_capital=100).calculate_metrics()
