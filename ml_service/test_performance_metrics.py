"""Unit tests for the PerformanceMetrics calculator and report charts."""

from datetime import datetime, timedelta

import numpy as np
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
        [{"pnl": 100.0}, {"netPnl": -20.0}],
        initial_capital=10_000,
    )

    assert calculator.calculate_metrics()["profit_factor"] == pytest.approx(5.0)


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


def test_chart_generation_and_png_artifacts(trades, tmp_path):
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

    # Do not leave GUI resources open when this test is run repeatedly.
    import matplotlib.pyplot as plt

    plt.close("all")


def test_invalid_constructor_values():
    with pytest.raises(ValueError, match="initial_capital"):
        PerformanceMetrics([], initial_capital=0)
    with pytest.raises(ValueError, match="risk_free_rate"):
        PerformanceMetrics([], initial_capital=100, risk_free_rate=float("nan"))
