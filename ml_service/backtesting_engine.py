"""Integration boundary for historical data, strategy execution and reporting."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

import numpy as np
import pandas as pd

try:
    from performance_metrics import PerformanceMetrics
    from strategy_engine import StrategyEngine
except ImportError:  # pragma: no cover - package import path
    from ml_service.performance_metrics import PerformanceMetrics
    from ml_service.strategy_engine import StrategyEngine

_PathLike = Union[str, Path]


class BacktestingEngine:
    """Run a point-in-time strategy backtest from one cohesive API.

    The injected loader must implement ``load_historical_data(symbol,
    start_date, end_date, timeframe)``.  Signals are generated at bar close and
    the existing :class:`StrategyEngine` executes them at the next bar open.
    All remaining exposure is liquidated at the final close before metrics are
    calculated.
    """

    def __init__(
        self,
        data_loader: Any,
        initial_capital: float = 10_000.0,
        slippage: float = 0.001,
        commission: float = 0.001,
        risk_free_rate: float = 0.02,
    ) -> None:
        if data_loader is None or not callable(
            getattr(data_loader, "load_historical_data", None)
        ):
            raise ValueError("data_loader must implement load_historical_data")
        if not np.isfinite(risk_free_rate):
            raise ValueError("risk_free_rate must be finite")

        self.data_loader = data_loader
        self.initial_capital = float(initial_capital)
        self.slippage = float(slippage)
        self.commission = float(commission)
        self.risk_free_rate = float(risk_free_rate)
        # StrategyEngine performs the canonical capital/rate validation.
        self.strategy_engine = StrategyEngine(
            None,
            self.initial_capital,
            self.slippage,
            self.commission,
        )
        self.metrics_calculator: Optional[PerformanceMetrics] = None
        self.last_result: Optional[Dict[str, Any]] = None

    @staticmethod
    def _prepare_data(data: Any) -> pd.DataFrame:
        if not isinstance(data, pd.DataFrame):
            raise TypeError("data_loader must return a pandas.DataFrame")
        if data.empty:
            raise ValueError("no historical data found for the requested backtest")
        if len(data) < 2:
            raise ValueError("at least two historical bars are required")

        prepared = data.copy()
        missing = [
            column
            for column in ("open", "high", "low", "close", "volume")
            if column not in prepared.columns
        ]
        if missing:
            raise ValueError(f"historical data is missing OHLCV columns: {missing}")

        if "timestamp" in prepared.columns:
            timestamp = pd.to_numeric(prepared["timestamp"], errors="coerce")
            if timestamp.isna().any():
                raise ValueError("historical timestamp values must be numeric")
            prepared.index = pd.to_datetime(timestamp, unit="ms", utc=True)
            prepared.index.name = "time"
        elif not isinstance(prepared.index, pd.DatetimeIndex):
            raise ValueError("historical data needs a timestamp column or DatetimeIndex")

        if prepared.index.has_duplicates:
            raise ValueError("historical data contains duplicate timestamps")
        if not prepared.index.is_monotonic_increasing:
            prepared = prepared.sort_index()
        numeric = prepared[["open", "high", "low", "close", "volume"]].apply(
            pd.to_numeric,
            errors="coerce",
        )
        if numeric.isna().any().any() or not np.isfinite(numeric.to_numpy()).all():
            raise ValueError("historical OHLCV values must be finite numbers")
        prepared.loc[:, numeric.columns] = numeric
        return prepared

    @staticmethod
    def _artifact_prefix(symbol: str, strategy: Any) -> str:
        strategy_name = strategy if isinstance(strategy, str) else strategy.__class__.__name__
        value = f"{symbol}_{strategy_name}".lower().replace("/", "_")
        value = re.sub(r"[^a-z0-9_]+", "_", value).strip("_")
        return value or "backtest"

    def run_backtest(
        self,
        symbol: str,
        start_date: Any,
        end_date: Any,
        timeframe: str,
        strategy: Any,
        *,
        output_dir: Optional[_PathLike] = None,
        artifact_prefix: Optional[str] = None,
        **parameters: Any,
    ) -> Tuple[Dict[str, Optional[float]], pd.DataFrame]:
        """Load data, execute a strategy and calculate/report its performance.

        Parameters after ``strategy`` are forwarded to ``StrategyEngine``.  If
        ``output_dir`` is supplied, uniquely named equity and drawdown PNGs are
        saved there.

        Returns
        -------
        (metrics, equity_curve):
            The six canonical ``PerformanceMetrics`` values and a DataFrame
            containing realised-trade ``time``, ``equity`` and ``drawdown``.
            Full per-bar execution output and artifact paths are available in
            :attr:`last_result`.
        """

        if not isinstance(symbol, str) or not symbol.strip():
            raise ValueError("symbol must be a non-empty string")
        data = self.data_loader.load_historical_data(
            symbol,
            start_date,
            end_date,
            timeframe,
        )
        prepared = self._prepare_data(data)
        self.strategy_engine.data = prepared
        execution_parameters = dict(parameters)
        execution_parameters["liquidate_at_end"] = True
        execution = self.strategy_engine.execute_strategy(strategy, **execution_parameters)
        trades = execution.get("trades")
        if not isinstance(trades, list):
            raise RuntimeError("StrategyEngine returned an invalid trade ledger")

        self.metrics_calculator = PerformanceMetrics(
            trades,
            self.initial_capital,
            risk_free_rate=self.risk_free_rate,
        )
        metrics = self.metrics_calculator.calculate_metrics()
        equity_curve = self.metrics_calculator.get_equity_curve()

        realised_pnl = float(
            sum(float(trade["profit_loss"]) for trade in trades if trade.get("profit_loss") is not None)
        )
        final_cash = float(execution["final_cash"])
        if not np.isclose(
            final_cash,
            self.initial_capital + realised_pnl,
            rtol=1e-9,
            atol=1e-6,
        ):
            raise RuntimeError("trade ledger P/L does not reconcile to final cash")
        if not np.isclose(float(execution.get("final_position", np.nan)), 0.0, atol=1e-12):
            raise RuntimeError("backtest ended with an unsettled position")

        artifacts: Dict[str, Path] = {}
        if output_dir is not None:
            prefix = artifact_prefix or self._artifact_prefix(symbol, strategy)
            artifacts = self.metrics_calculator.save_plots(
                output_dir,
                equity_filename=f"{prefix}_equity_curve.png",
                drawdown_filename=f"{prefix}_drawdown.png",
            )

        self.last_result = {
            "symbol": symbol,
            "strategy": strategy if isinstance(strategy, str) else strategy.__class__.__name__,
            "parameters": dict(parameters),
            "start_date": start_date,
            "end_date": end_date,
            "timeframe": timeframe,
            "bars": len(prepared),
            "data": prepared,
            "trades": trades,
            "execution": execution,
            "metrics": metrics,
            "equity_curve": equity_curve,
            "bar_equity_curve": pd.DataFrame(execution["equity_curve"]),
            "artifacts": artifacts,
        }
        return metrics, equity_curve.copy()


__all__ = ["BacktestingEngine"]
