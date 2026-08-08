"""Performance metrics and visual reporting for strategy trades.

The :class:`PerformanceMetrics` class consumes the closed-trade records emitted
by :mod:`strategy_engine`.  A trade is expected to contain ``profit_loss``;
``pnl``, ``net_pnl``/``netPnl`` and ``profit`` are accepted as compatibility
aliases for ledgers used elsewhere in the project.

The calculator deliberately keeps the public result small and JSON-friendly:
``calculate_metrics`` returns the six metrics requested by the strategy
contract.  Undefined ratios (for example, a profit factor when there are no
losing trades) are represented by ``None`` rather than ``Infinity``.

Plotting uses matplotlib's object-oriented API.  Matplotlib is imported lazily
so callers that only need numerical metrics do not pay for a plotting backend
at import time.  Both chart methods return a ``matplotlib.figure.Figure`` and
accept an optional path.  :meth:`save_plots` is a convenience for producing the
standard ``equity_curve.png`` and ``drawdown.png`` report artifacts.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd


# StrategyEngine currently emits ``profit_loss``.  The aliases make the
# calculator usable with the other trade ledgers in this repository too.
_PNL_KEYS: Tuple[str, ...] = (
    "profit_loss",
    "net_pnl",
    "netPnl",
    "pnl",
    "profit",
)

# The first key found is preferred.  Entry and exit times are both used when
# determining the annualisation period, while the exit time is used for the
# post-trade equity point.
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
    """Calculate strategy performance metrics and generate report charts.

    Parameters
    ----------
    trades:
        An iterable of closed trade dictionaries.  The StrategyEngine output
        uses ``profit_loss`` for realised net P/L.  Trades with a missing or
        ``None`` P/L are considered open trades and are excluded from metrics.
    initial_capital:
        Starting account equity.  It must be a positive, finite number.
    risk_free_rate:
        Risk-free return used by the Sharpe calculation.  This value is
        applied to each return observation exactly as specified by the
        strategy contract.  The default is ``0.02`` (two percent).

    Notes
    -----
    A trade ledger contains P/L but not necessarily an exposure or account
    equity for every observation.  Therefore each return observation used for
    Sharpe is ``trade P/L / initial_capital``.  This is deterministic and
    matches the input contract.  The equity curve and drawdown use the more
    useful absolute equity series ``initial_capital + cumulative P/L``.

    Dates are read from ``entry_time``/``exit_time`` when available.  If a
    ledger has no timestamps, one day per realised trade is used as a
    documented fallback for annualisation; without a time axis an annualised
    figure cannot be inferred more precisely.
    """

    def __init__(
        self,
        trades: Iterable[Mapping[str, Any]],
        initial_capital: _Number,
        risk_free_rate: _Number = 0.02,
    ) -> None:
        if trades is None:
            normalised_trades: List[Any] = []
        elif isinstance(trades, pd.DataFrame):
            normalised_trades = trades.to_dict("records")
        else:
            try:
                normalised_trades = list(trades)
            except TypeError as exc:
                raise TypeError("trades must be an iterable of trade mappings") from exc

        try:
            capital = float(initial_capital)
        except (TypeError, ValueError) as exc:
            raise ValueError("initial_capital must be a positive finite number") from exc
        if not np.isfinite(capital) or capital <= 0:
            raise ValueError("initial_capital must be a positive finite number")

        try:
            rf_rate = float(risk_free_rate)
        except (TypeError, ValueError) as exc:
            raise ValueError("risk_free_rate must be a finite number") from exc
        if not np.isfinite(rf_rate):
            raise ValueError("risk_free_rate must be a finite number")

        self.trades = normalised_trades
        self.initial_capital = capital
        self.risk_free_rate = rf_rate

        # These caches keep calculations and plots consistent even when all
        # public methods are called independently by a notebook or API.
        self._realised_records: Optional[List[Dict[str, Any]]] = None
        self._equity_cache: Optional[Tuple[List[Any], np.ndarray, np.ndarray]] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def calculate_metrics(self) -> Dict[str, Optional[float]]:
        """Calculate all supported performance metrics.

        Returns
        -------
        dict
            A dictionary containing ``total_return``, ``annualized_return``,
            ``sharpe_ratio``, ``max_drawdown``, ``win_rate`` and
            ``profit_factor``.  Ratios that are undefined because the ledger
            has no observations are returned as ``0.0`` for an empty ledger;
            a profit factor with trades but no gross loss is ``None``.
        """

        return {
            "total_return": self._calculate_total_return(),
            "annualized_return": self._calculate_annualized_return(),
            "sharpe_ratio": self._calculate_sharpe_ratio(),
            "max_drawdown": self._calculate_max_drawdown(),
            "win_rate": self._calculate_win_rate(),
            "profit_factor": self._calculate_profit_factor(),
        }

    def generate_equity_curve(self, save_path: Optional[_PathLike] = "equity_curve.png"):
        """Generate the strategy equity-curve figure.

        Parameters
        ----------
        save_path:
            Image path to write.  It defaults to ``equity_curve.png`` so a
            direct call produces the requested report artifact; pass ``None``
            when only an in-memory figure is wanted.  The parent directory is
            created and the format is inferred from the supplied extension.

        Returns
        -------
        matplotlib.figure.Figure
            A figure containing account equity after each realised trade.
        """

        plt = self._matplotlib_pyplot()
        times, equity, _ = self._equity_data()
        x_values, x_label = self._plot_axis(times)

        figure, axis = plt.subplots(figsize=(10, 5))
        axis.plot(x_values, equity, color="#1565c0", linewidth=2, marker="o", markersize=3, label="Equity")
        axis.axhline(self.initial_capital, color="#6b7280", linestyle="--", linewidth=1, label="Initial capital")
        axis.set_title("Equity Curve")
        axis.set_xlabel(x_label)
        axis.set_ylabel("Capital")
        axis.grid(True, alpha=0.25)
        axis.legend(loc="best")
        figure.tight_layout()
        self._save_figure(figure, save_path)
        return figure

    def generate_drawdown(self, save_path: Optional[_PathLike] = "drawdown.png"):
        """Generate the drawdown figure.

        Drawdown is represented using the signed convention from the
        strategy-engine contract: values are zero at a running equity peak and
        negative while the account is below that peak.

        Parameters
        ----------
        save_path:
            Image path to write, defaulting to ``drawdown.png``.  Pass ``None``
            when only an in-memory figure is wanted.  The parent directory is
            created when needed.

        Returns
        -------
        matplotlib.figure.Figure
            A figure containing drawdown as a percentage of the running peak.
        """

        plt = self._matplotlib_pyplot()
        times, _, drawdown = self._equity_data()
        x_values, x_label = self._plot_axis(times)

        figure, axis = plt.subplots(figsize=(10, 4))
        drawdown_percent = drawdown * 100.0
        axis.fill_between(x_values, drawdown_percent, 0.0, color="#dc2626", alpha=0.22)
        axis.plot(x_values, drawdown_percent, color="#b91c1c", linewidth=2, label="Drawdown")
        axis.axhline(0.0, color="#6b7280", linewidth=1)
        axis.set_title("Drawdown")
        axis.set_xlabel(x_label)
        axis.set_ylabel("Drawdown (%)")
        axis.grid(True, alpha=0.25)
        axis.legend(loc="best")
        figure.tight_layout()
        self._save_figure(figure, save_path)
        return figure

    # A descriptive alias is useful to callers that refer to the chart as a
    # "drawdown curve" and keeps the primary API concise.
    generate_drawdown_curve = generate_drawdown

    def save_plots(
        self,
        output_dir: _PathLike = ".",
        equity_filename: str = "equity_curve.png",
        drawdown_filename: str = "drawdown.png",
    ) -> Dict[str, Path]:
        """Save both standard report charts and return their file paths.

        Examples
        --------
        >>> report = PerformanceMetrics(trades, 10_000)
        >>> paths = report.save_plots("artifacts")
        >>> paths["equity_curve"].name
        'equity_curve.png'
        """

        directory = Path(output_dir)
        directory.mkdir(parents=True, exist_ok=True)
        equity_path = directory / equity_filename
        drawdown_path = directory / drawdown_filename
        self.generate_equity_curve(equity_path)
        self.generate_drawdown(drawdown_path)
        return {"equity_curve": equity_path, "drawdown": drawdown_path}

    # American spelling is retained as a small compatibility convenience for
    # API consumers that call these artifacts "artifacts" or "plots".
    save_charts = save_plots

    # ------------------------------------------------------------------
    # Metric implementations (the names are part of the requested API)
    # ------------------------------------------------------------------
    def _calculate_total_return(self) -> float:
        """Return ``(final capital - initial capital) / initial capital``."""

        _, equity, _ = self._equity_data()
        if equity.size == 0:
            return 0.0
        return float((equity[-1] - self.initial_capital) / self.initial_capital)

    def _calculate_annualized_return(self) -> float:
        """Annualise total return using ``(1 + R) ** (365 / days) - 1``."""

        total_return = self._calculate_total_return()
        if total_return == 0.0:
            return 0.0

        days = self._period_days()
        if days <= 0:
            return float(total_return)

        # A non-positive ending account cannot be annualised with a fractional
        # exponent.  A total loss is well-defined as -100%; a larger loss is
        # clipped to the same economically meaningful lower bound.
        if total_return <= -1.0:
            return -1.0

        try:
            annualized = np.expm1(np.log1p(total_return) * (365.0 / days))
        except (FloatingPointError, OverflowError, ValueError):
            return float("inf") if total_return > 0 else -1.0
        if not np.isfinite(annualized):
            return float("inf") if annualized > 0 else -1.0
        return float(annualized)

    def _calculate_sharpe_ratio(self) -> float:
        """Calculate ``(mean return - risk-free rate) / return std``.

        Return observations are trade P/L divided by initial capital.  The
        population standard deviation (``ddof=0``) is used because the ledger
        represents the complete backtest observations rather than a sample.
        A zero-volatility series has no measurable risk-adjusted signal and
        returns ``0.0`` instead of an infinite or NaN result.
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
        if drawdown.size == 0:
            return 0.0
        return float(np.min(drawdown))

    def _calculate_win_rate(self) -> float:
        """Return winning realised trades divided by realised trades."""

        records = self._records()
        if not records:
            return 0.0
        winning_trades = sum(record["pnl"] > 0.0 for record in records)
        return float(winning_trades / len(records))

    def _calculate_profit_factor(self) -> Optional[float]:
        """Return gross profit divided by gross loss.

        ``None`` is returned when trades exist but no loss exists, because the
        ratio is undefined and returning infinity would make JSON reports
        invalid or misleading.  An empty ledger returns ``0.0`` for a stable
        all-zero report.
        """

        records = self._records()
        if not records:
            return 0.0

        profits = np.asarray([record["pnl"] for record in records], dtype=float)
        gross_profit = float(profits[profits > 0.0].sum())
        gross_loss = float(-profits[profits < 0.0].sum())
        if gross_loss <= np.finfo(float).eps:
            return None
        factor = gross_profit / gross_loss
        return float(factor) if np.isfinite(factor) else None

    # ------------------------------------------------------------------
    # Normalisation and chart data helpers
    # ------------------------------------------------------------------
    def _records(self) -> List[Dict[str, Any]]:
        """Return realised, finite P/L records in input order."""

        if self._realised_records is not None:
            return self._realised_records

        records: List[Dict[str, Any]] = []
        for index, trade in enumerate(self.trades):
            mapping = self._as_mapping(trade, index)
            pnl = self._extract_pnl(mapping, index)
            # ``None`` means an open/unrealised trade.  It must not influence
            # win rate, profit factor, equity or annualisation.
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
                    "trade": mapping,
                }
            )

        self._realised_records = records
        return records

    @staticmethod
    def _as_mapping(trade: Any, index: int) -> Mapping[str, Any]:
        if isinstance(trade, Mapping):
            return trade
        # Supporting simple dataclass/namespace trade objects costs little and
        # produces a useful error for accidental scalar input.
        if hasattr(trade, "__dict__"):
            return vars(trade)
        raise TypeError(f"trade at index {index} must be a mapping or object with attributes")

    @staticmethod
    def _first_value(mapping: Mapping[str, Any], keys: Sequence[str]) -> Any:
        for key in keys:
            if key in mapping and mapping[key] is not None:
                return mapping[key]
        return None

    @classmethod
    def _extract_pnl(cls, mapping: Mapping[str, Any], index: int) -> Optional[float]:
        for key in _PNL_KEYS:
            if key not in mapping or mapping[key] is None:
                continue
            try:
                value = float(mapping[key])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"trade at index {index} has a non-numeric {key}") from exc
            if not np.isfinite(value):
                raise ValueError(f"trade at index {index} has a non-finite {key}")
            return value
        return None

    def _equity_data(self) -> Tuple[List[Any], np.ndarray, np.ndarray]:
        """Build and cache time labels, equity and signed drawdown arrays."""

        if self._equity_cache is not None:
            return self._equity_cache

        records = self._records()
        pnls = np.asarray([record["pnl"] for record in records], dtype=float)
        cumulative_pnl = np.cumsum(pnls) if pnls.size else np.asarray([], dtype=float)
        equity_values = np.concatenate(
            (
                np.asarray([self.initial_capital], dtype=float),
                self.initial_capital + cumulative_pnl,
            )
        )

        if records:
            first_start = records[0]["start_time"]
            first_end = records[0]["end_time"]
            initial_time = first_start if first_start is not None else first_end
            trade_times = [
                record["end_time"] if record["end_time"] is not None else record["start_time"]
                for record in records
            ]
            if initial_time is None and all(value is None for value in trade_times):
                times: List[Any] = list(range(len(records) + 1))
            elif initial_time is None:
                # If only later trades have dates, use the first available
                # label for the initial point to keep matplotlib's axis valid.
                initial_time = next(value for value in trade_times if value is not None)
                times = [initial_time] + trade_times
            else:
                times = [initial_time] + trade_times
        else:
            times = [0]

        # Running peaks are positive for a normal account.  The guard keeps
        # chart and metric output finite even for a ledger that loses all
        # capital or goes negative.
        peaks = np.maximum.accumulate(equity_values)
        with np.errstate(divide="ignore", invalid="ignore"):
            drawdown_values = np.divide(
                equity_values - peaks,
                peaks,
                out=np.zeros_like(equity_values),
                where=np.abs(peaks) > np.finfo(float).eps,
            )
        drawdown_values = np.minimum(drawdown_values, 0.0)
        self._equity_cache = (times, equity_values, drawdown_values)
        return self._equity_cache

    def _period_days(self) -> float:
        """Infer elapsed days from trade timestamps, with a documented fallback."""

        records = self._records()
        if not records:
            return 0.0

        start = records[0]["start_time"]
        if start is None:
            start = records[0]["end_time"]
        end = records[-1]["end_time"]
        if end is None:
            end = records[-1]["start_time"]

        elapsed = self._elapsed_days(start, end)
        if elapsed is not None and elapsed > 0:
            return float(elapsed)
        # No timestamps (or same-day timestamps): one observation/day is the
        # least surprising deterministic fallback for the requested formula.
        return float(max(len(records), 1))

    @staticmethod
    def _elapsed_days(start: Any, end: Any) -> Optional[float]:
        if start is None or end is None:
            return None

        # Numeric values are common for StrategyEngine RangeIndex timestamps
        # and for Unix timestamps.  Detect the latter by magnitude.
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
            # Small integer indexes are treated as day-like observations.
            return difference

        try:
            start_timestamp = pd.to_datetime(start, utc=True, errors="coerce")
            end_timestamp = pd.to_datetime(end, utc=True, errors="coerce")
            if pd.isna(start_timestamp) or pd.isna(end_timestamp):
                return None
            return float((end_timestamp - start_timestamp).total_seconds() / 86_400.0)
        except (TypeError, ValueError, OverflowError):
            return None

    @staticmethod
    def _plot_axis(times: Sequence[Any]) -> Tuple[Sequence[Any], str]:
        """Return matplotlib-safe x values and a human-readable axis label."""

        if not times:
            return [0], "Trade"
        if all(isinstance(value, (datetime, date, pd.Timestamp, np.datetime64)) for value in times):
            return times, "Date"
        if all(isinstance(value, (int, float, np.integer, np.floating)) for value in times):
            # RangeIndex-style times are observation numbers, not nanoseconds
            # from the Unix epoch.  Large numeric values are treated as Unix
            # seconds/milliseconds and retain their date axis.
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
        # Mixed timestamp types can make matplotlib's unit conversion fail.
        # Convert parseable strings to UTC timestamps as a single homogeneous
        # axis; otherwise use observation numbers and retain chart validity.
        parsed = pd.to_datetime(pd.Series(list(times)), utc=True, errors="coerce")
        if parsed.notna().all():
            return list(parsed), "Date"
        return list(range(len(times))), "Observation"

    @staticmethod
    def _matplotlib_pyplot():
        try:
            import matplotlib

            # A headless API/CI environment has no display server.  ``force``
            # is safe here because the backend is selected before pyplot.
            matplotlib.use("Agg", force=True)
            import matplotlib.pyplot as plt

            return plt
        except ImportError as exc:  # pragma: no cover - depends on install
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
