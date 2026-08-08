"""Performance metrics and visual reports for strategy trade ledgers.

The :class:`PerformanceMetrics` class consumes the closed-trade records
returned by :mod:`strategy_engine`.  The strategy engine currently emits
``profit_loss``; a few common aliases (``pnl``, ``net_pnl``, ``netPnl`` and
``profit``) are accepted as well so the calculator can be used with the other
trade ledgers in this repository.

Numerical calculations use pandas/numpy.  Matplotlib is loaded lazily and is
configured for a headless-safe backend when a chart is requested.  Numerical
callers therefore do not need to initialise a GUI backend, while report
callers can save the standard ``equity_curve.png`` and ``drawdown.png``
artifacts with :meth:`save_plots`.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd


# StrategyEngine's canonical field is ``profit_loss``.  These aliases keep the
# calculator compatible with the JS/backtesting ledgers without changing the
# StrategyEngine contract.
_PNL_KEYS: Tuple[str, ...] = (
    "profit_loss",
    "realized_pnl",
    "realizedPnl",
    "net_pnl",
    "netPnl",
    "pnl",
    "profit_loss_amount",
    "profitLoss",
    "profit",
)

_ENTRY_TIME_KEYS: Tuple[str, ...] = (
    "entry_time",
    "entry_timestamp",
    "opened_at",
    "open_time",
)
_EXIT_TIME_KEYS: Tuple[str, ...] = (
    "exit_time",
    "exit_timestamp",
    "closed_at",
    "close_time",
)
_TIMESTAMP_KEYS: Tuple[str, ...] = (
    "timestamp",
    "time",
    "date",
    "datetime",
)

_Number = Union[int, float, np.number]
_PathLike = Union[str, Path]


class PerformanceMetrics:
    """Calculate strategy performance metrics and generate visual reports.

    Parameters
    ----------
    trades:
        An iterable of trade mappings.  Records without a realised P/L value
        (for example the StrategyEngine's still-open trade) are ignored.  A
        pandas ``DataFrame`` and simple objects with attributes are accepted as
        a convenience.
    initial_capital:
        Positive finite starting account equity.
    risk_free_rate:
        Risk-free return applied to each return observation in the Sharpe
        formula.  The assignment contract supplies this as ``0.02`` by
        default; it is intentionally not silently annualised or compounded.

    Notes
    -----
    The trade contract contains P/L but not the capital deployed by each
    trade.  For a deterministic Sharpe observation, each trade return is
    therefore ``profit_loss / initial_capital``.  The equity and drawdown
    series use the absolute account equity ``initial_capital + cumulative P/L``.

    Timestamps are read from entry/exit fields when present.  If no usable
    elapsed time exists, annualisation uses one day per realised trade as an
    explicit deterministic fallback.  This fallback is exposed in the
    documentation rather than silently producing a divide-by-zero or NaN.

    Drawdown follows the signed convention already used by the Python
    StrategyEngine: zero at a running peak and negative below that peak.
    ``abs(max_drawdown)`` is the positive drawdown magnitude commonly used in
    dashboards.
    """

    def __init__(
        self,
        trades: Optional[Iterable[Mapping[str, Any]]],
        initial_capital: _Number,
        risk_free_rate: _Number = 0.02,
    ) -> None:
        self.trades = self._coerce_trades(trades)
        self.initial_capital = self._validate_initial_capital(initial_capital)
        self.risk_free_rate = self._validate_risk_free_rate(risk_free_rate)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def update_trades(self, trades: Optional[Iterable[Mapping[str, Any]]]) -> None:
        """Replace the ledger used by subsequent calculations and plots.

        ``PerformanceMetrics`` intentionally recalculates its small derived
        arrays on demand.  This makes both ``update_trades`` and direct edits
        to the public ``trades`` list safe, with no stale cache to invalidate.
        """

        self.trades = self._coerce_trades(trades)

    def calculate_metrics(self) -> Dict[str, Optional[float]]:
        """Calculate all requested performance metrics.

        Returns
        -------
        dict
            Exactly six keys: ``total_return``, ``annualized_return``,
            ``sharpe_ratio``, ``max_drawdown``, ``win_rate`` and
            ``profit_factor``.  An empty ledger returns zero-valued metrics;
            Profit Factor is ``None`` when trades exist but there is no gross
            loss, because that ratio is undefined rather than infinite.
        """

        return {
            "total_return": self._calculate_total_return(),
            "annualized_return": self._calculate_annualized_return(),
            "sharpe_ratio": self._calculate_sharpe_ratio(),
            "max_drawdown": self._calculate_max_drawdown(),
            "win_rate": self._calculate_win_rate(),
            "profit_factor": self._calculate_profit_factor(),
        }

    def get_equity_curve(self) -> pd.DataFrame:
        """Return the underlying equity/drawdown observations as a DataFrame.

        The first row is the initial capital.  Subsequent rows are after each
        realised trade and contain ``time``, ``equity`` and signed ``drawdown``
        columns.  This is useful for API consumers that need data rather than
        a matplotlib figure.
        """

        times, equity, drawdown = self._equity_data()
        return pd.DataFrame(
            {
                "time": times,
                "equity": equity,
                "drawdown": drawdown,
            }
        )

    def generate_equity_curve(self, save_path: Optional[_PathLike] = "equity_curve.png") -> Any:
        """Generate and optionally save the equity-curve figure.

        Parameters
        ----------
        save_path:
            Defaults to ``equity_curve.png`` to satisfy the report artifact
            contract.  Pass ``None`` for an in-memory figure only.  Parent
            directories are created automatically.

        Returns
        -------
        matplotlib.figure.Figure
            Figure containing initial capital and post-trade equity.
        """

        plt = self._matplotlib_pyplot()
        times, equity, _ = self._equity_data()
        x_values, x_label = self._plot_axis(times)

        figure, axis = plt.subplots(figsize=(10, 5))
        axis.plot(
            x_values,
            equity,
            color="#1565c0",
            linewidth=2,
            marker="o",
            markersize=3,
            label="Equity",
        )
        axis.axhline(
            self.initial_capital,
            color="#6b7280",
            linestyle="--",
            linewidth=1,
            label="Initial capital",
        )
        axis.set_title("Equity Curve")
        axis.set_xlabel(x_label)
        axis.set_ylabel("Capital")
        axis.grid(True, alpha=0.25)
        axis.legend(loc="best")
        figure.tight_layout()
        self._save_figure(figure, save_path)
        return figure

    def generate_drawdown(self, save_path: Optional[_PathLike] = "drawdown.png") -> Any:
        """Generate and optionally save the signed drawdown figure.

        ``drawdown`` is shown as a percentage of the running equity peak.  It
        is zero at a peak and negative during a decline.
        """

        plt = self._matplotlib_pyplot()
        times, _, drawdown = self._equity_data()
        x_values, x_label = self._plot_axis(times)

        figure, axis = plt.subplots(figsize=(10, 4))
        drawdown_percent = drawdown * 100.0
        axis.fill_between(
            x_values,
            drawdown_percent,
            0.0,
            color="#dc2626",
            alpha=0.22,
        )
        axis.plot(
            x_values,
            drawdown_percent,
            color="#b91c1c",
            linewidth=2,
            label="Drawdown",
        )
        axis.axhline(0.0, color="#6b7280", linewidth=1)
        axis.set_title("Drawdown")
        axis.set_xlabel(x_label)
        axis.set_ylabel("Drawdown (%)")
        axis.grid(True, alpha=0.25)
        axis.legend(loc="best")
        figure.tight_layout()
        self._save_figure(figure, save_path)
        return figure

    # Both names are useful to consumers and retain the requested concise API.
    generate_drawdown_curve = generate_drawdown

    def save_plots(
        self,
        output_dir: _PathLike = ".",
        equity_filename: str = "equity_curve.png",
        drawdown_filename: str = "drawdown.png",
    ) -> Dict[str, Path]:
        """Save both report charts and return their paths.

        Figures are closed after saving so repeated API/backtest calls do not
        leak matplotlib figure handles.  Call the individual ``generate_*``
        methods when the caller needs to keep a figure open.
        """

        directory = Path(output_dir)
        directory.mkdir(parents=True, exist_ok=True)
        equity_path = directory / equity_filename
        drawdown_path = directory / drawdown_filename

        plt = self._matplotlib_pyplot()
        equity_figure = None
        drawdown_figure = None
        try:
            equity_figure = self.generate_equity_curve(equity_path)
            drawdown_figure = self.generate_drawdown(drawdown_path)
            return {"equity_curve": equity_path, "drawdown": drawdown_path}
        finally:
            # Close any figure that was created, including the first one if the
            # second chart fails (for example, because of an invalid extension).
            if equity_figure is not None:
                plt.close(equity_figure)
            if drawdown_figure is not None:
                plt.close(drawdown_figure)

    # Compatibility alias for callers that use "charts" rather than "plots".
    save_charts = save_plots

    def generate_report(self, output_dir: _PathLike = ".") -> Dict[str, Any]:
        """Calculate metrics and save both visual artifacts in one call."""

        return {
            "metrics": self.calculate_metrics(),
            "charts": self.save_plots(output_dir),
        }

    # ------------------------------------------------------------------
    # Requested metric implementations
    # ------------------------------------------------------------------
    def _calculate_total_return(self) -> float:
        """Return ``(final capital - initial capital) / initial capital``."""

        _, equity, _ = self._equity_data()
        return float((equity[-1] - self.initial_capital) / self.initial_capital)

    def _calculate_annualized_return(self) -> Optional[float]:
        """Return ``(1 + total_return) ** (365 / days) - 1``.

        A total loss is represented by ``-1.0``.  If an extreme input would
        overflow the floating-point result, ``None`` is returned instead of an
        infinite value that cannot be represented safely in JSON.
        """

        total_return = self._calculate_total_return()
        if total_return == 0.0:
            return 0.0
        if total_return <= -1.0:
            return -1.0

        days = self._period_days()
        if days <= 0:
            return float(total_return)

        try:
            with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
                value = np.power(1.0 + total_return, 365.0 / days) - 1.0
        except (FloatingPointError, OverflowError, ValueError):
            return None
        if not np.isfinite(value):
            return None
        return float(value)

    def _calculate_sharpe_ratio(self) -> float:
        """Return ``(mean return - risk-free rate) / return std``.

        Return observations are realised trade P/L divided by initial capital.
        Population standard deviation (``ddof=0``) matches ``numpy.std`` and
        the requested formula.  Zero volatility returns ``0.0`` rather than
        NaN or infinity.
        """

        records = self._records()
        if not records:
            return 0.0

        returns = np.asarray(
            [record["pnl"] / self.initial_capital for record in records],
            dtype=float,
        )
        standard_deviation = float(np.std(returns, ddof=0))
        if not np.isfinite(standard_deviation) or standard_deviation <= np.finfo(float).eps:
            return 0.0

        ratio = (float(np.mean(returns)) - self.risk_free_rate) / standard_deviation
        return float(ratio) if np.isfinite(ratio) else 0.0

    def _calculate_max_drawdown(self) -> float:
        """Return the most negative percentage decline from a running peak."""

        _, _, drawdown = self._equity_data()
        return float(np.min(drawdown))

    def _calculate_win_rate(self) -> float:
        """Return positive realised trades divided by realised trades."""

        records = self._records()
        if not records:
            return 0.0
        wins = sum(record["pnl"] > 0.0 for record in records)
        return float(wins / len(records))

    def _calculate_profit_factor(self) -> Optional[float]:
        """Return gross profit divided by gross loss.

        An empty ledger returns ``0.0`` for a stable all-zero report.  For a
        non-empty all-winning ledger, the denominator is zero and the correct
        JSON-safe value is ``None`` rather than ``Infinity``.
        """

        records = self._records()
        if not records:
            return 0.0

        pnl = np.asarray([record["pnl"] for record in records], dtype=float)
        gross_profit = float(pnl[pnl > 0.0].sum())
        gross_loss = float(-pnl[pnl < 0.0].sum())
        if gross_loss <= np.finfo(float).eps:
            return None
        value = gross_profit / gross_loss
        return float(value) if np.isfinite(value) else None

    # ------------------------------------------------------------------
    # Input and series normalisation
    # ------------------------------------------------------------------
    @staticmethod
    def _coerce_trades(
        trades: Optional[Iterable[Mapping[str, Any]]],
    ) -> List[Any]:
        if trades is None:
            return []
        if isinstance(trades, pd.DataFrame):
            return trades.to_dict("records")
        if isinstance(trades, Mapping):
            # Accepting one mapping is useful at API boundaries while still
            # preserving the documented iterable-of-trades interface.
            return [trades]
        if isinstance(trades, (str, bytes)):
            raise TypeError("trades must be an iterable of trade mappings")
        try:
            return list(trades)
        except TypeError as exc:
            raise TypeError("trades must be an iterable of trade mappings") from exc

    @staticmethod
    def _validate_initial_capital(value: _Number) -> float:
        try:
            capital = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("initial_capital must be a positive finite number") from exc
        if not np.isfinite(capital) or capital <= 0.0:
            raise ValueError("initial_capital must be a positive finite number")
        return capital

    @staticmethod
    def _validate_risk_free_rate(value: _Number) -> float:
        try:
            rate = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("risk_free_rate must be a finite number") from exc
        if not np.isfinite(rate):
            raise ValueError("risk_free_rate must be a finite number")
        return rate

    def _records(self) -> List[Dict[str, Any]]:
        """Normalise realised trades in chronological/stable order."""

        records: List[Dict[str, Any]] = []
        for index, trade in enumerate(self.trades):
            mapping = self._as_mapping(trade, index)
            pnl = self._extract_pnl(mapping, index)
            # Missing/None/NaN P/L is the representation used for an open or
            # not-yet-realised trade.  It is excluded from all realised metrics.
            if pnl is None:
                continue

            end_time = self._first_value(mapping, _EXIT_TIME_KEYS + _TIMESTAMP_KEYS)
            start_time = self._first_value(
                mapping,
                _ENTRY_TIME_KEYS + _TIMESTAMP_KEYS,
            )
            records.append(
                {
                    "pnl": pnl,
                    "start_time": start_time,
                    "end_time": end_time if end_time is not None else start_time,
                    "input_index": index,
                }
            )

        # StrategyEngine emits chronological trades, but sorting a ledger that
        # includes timestamps prevents a malformed input order from corrupting
        # drawdown and annualisation.  If timestamps cannot be compared as one
        # homogeneous type, preserve the supplied order.
        if records and all(record["end_time"] is not None for record in records):
            tokens = [self._time_sort_token(record["end_time"]) for record in records]
            if all(token is not None for token in tokens) and len({token[0] for token in tokens}) == 1:
                records = [
                    record
                    for _, record in sorted(
                        zip(tokens, records),
                        key=lambda item: item[0][1],
                    )
                ]
        return records

    @staticmethod
    def _as_mapping(trade: Any, index: int) -> Mapping[str, Any]:
        if isinstance(trade, Mapping):
            return trade
        if hasattr(trade, "__dict__"):
            return vars(trade)
        raise TypeError(
            f"trade at index {index} must be a mapping or object with attributes"
        )

    @classmethod
    def _extract_pnl(
        cls,
        mapping: Mapping[str, Any],
        index: int,
    ) -> Optional[float]:
        for key in _PNL_KEYS:
            if key not in mapping or cls._is_missing(mapping[key]):
                continue
            try:
                value = float(mapping[key])
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"trade at index {index} has a non-numeric {key}"
                ) from exc
            if not np.isfinite(value):
                raise ValueError(f"trade at index {index} has a non-finite {key}")
            return value
        return None

    @staticmethod
    def _is_missing(value: Any) -> bool:
        if value is None:
            return True
        try:
            result = pd.isna(value)
            return bool(result) if np.isscalar(result) else False
        except (TypeError, ValueError):
            return False

    @classmethod
    def _first_value(
        cls,
        mapping: Mapping[str, Any],
        keys: Sequence[str],
    ) -> Any:
        for key in keys:
            if key in mapping and not cls._is_missing(mapping[key]):
                return mapping[key]
        return None

    @staticmethod
    def _time_sort_token(value: Any) -> Optional[Tuple[str, float]]:
        if isinstance(value, (int, float, np.integer, np.floating)):
            number = float(value)
            if not np.isfinite(number):
                return None
            return ("numeric", number)

        try:
            parsed = pd.to_datetime(value, utc=True, errors="coerce")
            if pd.isna(parsed):
                return None
            return ("datetime", float(parsed.value))
        except (TypeError, ValueError, OverflowError):
            return None

    def _equity_data(self) -> Tuple[List[Any], np.ndarray, np.ndarray]:
        """Build time labels, equity and signed drawdown arrays."""

        records = self._records()
        pnl = np.asarray([record["pnl"] for record in records], dtype=float)
        cumulative_pnl = np.cumsum(pnl) if pnl.size else np.asarray([], dtype=float)
        equity = np.concatenate(
            (
                np.asarray([self.initial_capital], dtype=float),
                self.initial_capital + cumulative_pnl,
            )
        )

        if not records:
            times: List[Any] = [0]
        else:
            initial_time = (
                records[0]["start_time"]
                if records[0]["start_time"] is not None
                else records[0]["end_time"]
            )
            trade_times = [
                record["end_time"]
                if record["end_time"] is not None
                else record["start_time"]
                for record in records
            ]
            if initial_time is None and all(value is None for value in trade_times):
                times = list(range(len(records) + 1))
            elif initial_time is None:
                initial_time = next(value for value in trade_times if value is not None)
                times = [initial_time] + trade_times
            else:
                times = [initial_time] + trade_times

        peak = np.maximum.accumulate(equity)
        with np.errstate(divide="ignore", invalid="ignore"):
            drawdown = np.divide(
                equity - peak,
                peak,
                out=np.zeros_like(equity),
                where=np.abs(peak) > np.finfo(float).eps,
            )
        # A peak can only be a maximum, so positive drawdown is never valid.
        drawdown = np.minimum(drawdown, 0.0)
        return times, equity, drawdown

    def _period_days(self) -> float:
        """Infer elapsed days, falling back to one day per trade."""

        records = self._records()
        if not records:
            return 0.0

        start = (
            records[0]["start_time"]
            if records[0]["start_time"] is not None
            else records[0]["end_time"]
        )
        end = (
            records[-1]["end_time"]
            if records[-1]["end_time"] is not None
            else records[-1]["start_time"]
        )
        elapsed = self._elapsed_days(start, end)
        if elapsed is not None and elapsed > 0.0:
            return float(elapsed)
        return float(max(len(records), 1))

    @staticmethod
    def _elapsed_days(start: Any, end: Any) -> Optional[float]:
        if start is None or end is None:
            return None

        # Numeric values are common for RangeIndex bars and Unix timestamps.
        if isinstance(start, (int, float, np.integer, np.floating)) and isinstance(
            end,
            (int, float, np.integer, np.floating),
        ):
            start_number = float(start)
            end_number = float(end)
            if not np.isfinite(start_number) or not np.isfinite(end_number):
                return None
            difference = end_number - start_number
            magnitude = max(abs(start_number), abs(end_number))
            if magnitude >= 1e14:  # nanoseconds since epoch
                return difference / 86_400_000_000_000.0
            if magnitude >= 1e11:  # milliseconds since epoch
                return difference / 86_400_000.0
            if magnitude >= 1e8:  # seconds since epoch
                return difference / 86_400.0
            # Small integer indexes are interpreted as day-like observations.
            return difference

        try:
            start_timestamp = pd.to_datetime(start, utc=True, errors="coerce")
            end_timestamp = pd.to_datetime(end, utc=True, errors="coerce")
            if pd.isna(start_timestamp) or pd.isna(end_timestamp):
                return None
            return float(
                (end_timestamp - start_timestamp).total_seconds() / 86_400.0
            )
        except (TypeError, ValueError, OverflowError):
            return None

    @staticmethod
    def _plot_axis(times: Sequence[Any]) -> Tuple[Sequence[Any], str]:
        """Return matplotlib-safe x values and a human-readable axis label."""

        if not times:
            return [0], "Trade"
        if all(
            isinstance(value, (datetime, date, pd.Timestamp, np.datetime64))
            for value in times
        ):
            return times, "Date"
        if all(
            isinstance(value, (int, float, np.integer, np.floating))
            for value in times
        ):
            magnitude = max(abs(float(value)) for value in times)
            if magnitude < 1e8:
                return list(range(len(times))), "Observation"
            unit = "ms" if magnitude >= 1e11 else "s"
            parsed_numeric = pd.to_datetime(
                pd.Series(list(times)), unit=unit, utc=True, errors="coerce"
            )
            if parsed_numeric.notna().all():
                return list(parsed_numeric), "Date"
            return list(range(len(times))), "Observation"

        parsed = pd.to_datetime(pd.Series(list(times)), utc=True, errors="coerce")
        if parsed.notna().all():
            return list(parsed), "Date"
        return list(range(len(times))), "Observation"

    @staticmethod
    def _matplotlib_pyplot() -> Any:
        try:
            import matplotlib

            # Select a non-interactive backend before importing pyplot.  Calling
            # this repeatedly is harmless and keeps API/CI execution headless.
            matplotlib.use("Agg", force=True)
            import matplotlib.pyplot as plt

            return plt
        except ImportError as exc:  # pragma: no cover - install-dependent
            raise ImportError(
                "matplotlib is required for chart generation; install the ML "
                "service dependencies first"
            ) from exc

    @staticmethod
    def _save_figure(figure: Any, save_path: Optional[_PathLike]) -> None:
        if save_path is None:
            return
        path = Path(save_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        figure.savefig(path, dpi=150, bbox_inches="tight")


__all__ = ["PerformanceMetrics"]
