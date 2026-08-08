"""
DataLoader Module for Historical OHLCV Market Data and Preprocessing.

This module provides the DataLoader class and module-level functions for:
  - Loading historical OHLCV data from the Phase-1 database boundary
    (PostgreSQL when configured, with an SQLite/in-memory development fallback).
  - Filtering historical candles by symbol, timeframe (e.g. daily, hourly, weekly,
    monthly), and date ranges (start_date, end_date).
  - Automatic timeframe resampling when requested timeframes (e.g. '1d' or '1w')
    are derived from lower timeframes (e.g. '1h' or '1m').
  - Validating strict OHLC invariants (high >= max(open, close),
    low <= min(open, close), positive prices, and non-negative volume).
  - Preprocessing and feature engineering (returns, volatility, spreads, OBI,
    open_interest normalization).
  - Causal normalization for ML models (expanding min-max and rolling z-score)
    guaranteeing zero look-ahead bias.
  - Command-line interface (CLI) for data extraction and preprocessing tests.
"""

from collections.abc import Sequence
import datetime
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional, Union

import numpy as np
import pandas as pd

try:
    from data_engineering import calculate_obi, rolling_zscore
except ImportError:
    from ml_service.data_engineering import calculate_obi, rolling_zscore

try:
    import psycopg2
    from psycopg2.extras import execute_values
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False


def _parse_timestamp(
    val: Optional[Union[str, int, float, datetime.date, datetime.datetime, pd.Timestamp]]
) -> Optional[int]:
    """
    Convert a date or timestamp input into an integer timestamp in milliseconds UTC.

    Args:
        val: Input timestamp as string, integer/float timestamp, date/datetime object,
             or pandas Timestamp.

    Returns:
        Integer timestamp in milliseconds since epoch UTC, or None if val is None/NaT.
    """
    if val is None:
        return None
    if pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        if np.isnan(val) or not np.isfinite(val):
            return None
        # If timestamp is in microseconds (16 digits), convert to milliseconds
        if val >= 1e14:
            return int(val // 1000)
        # If timestamp is in seconds (10 digits), convert to milliseconds
        if val < 1e11:
            return int(val * 1000)
        return int(val)
    if isinstance(val, (datetime.datetime, datetime.date, pd.Timestamp)):
        ts = pd.to_datetime(val, utc=True)
        if pd.isna(ts):
            return None
        return int(ts.timestamp() * 1000)
    if isinstance(val, str):
        val_str = val.strip()
        if not val_str or val_str.lower() in ("nat", "nan", "none", "null"):
            return None
        try:
            num = float(val_str)
            if np.isnan(num) or not np.isfinite(num):
                return None
            if num >= 1e14:
                return int(num // 1000)
            if num < 1e11:
                return int(num * 1000)
            return int(num)
        except ValueError:
            pass
        ts = pd.to_datetime(val_str, utc=True, errors="coerce")
        if pd.isna(ts):
            return None
        return int(ts.timestamp() * 1000)
    raise TypeError(f"Unsupported timestamp format: {type(val)}")


def _normalize_timeframe(timeframe: str) -> str:
    """
    Normalize timeframe string to canonical format ('1d', '1h', '1m', '1w', '1M', etc.).

    Args:
        timeframe: User-provided timeframe string (e.g. 'daily', 'hourly', '1d', 'weekly').

    Returns:
        Canonical timeframe code string.
    """
    if not isinstance(timeframe, str) or not timeframe.strip():
        raise ValueError("timeframe must be a non-empty string")
    if timeframe.strip() == "1M":
        return "1M"
    normalized = timeframe.strip().lower()
    mapping = {
        "d": "1d",
        "daily": "1d",
        "day": "1d",
        "1day": "1d",
        "days": "1d",
        "1d": "1d",
        "w": "1w",
        "weekly": "1w",
        "week": "1w",
        "1week": "1w",
        "weeks": "1w",
        "1w": "1w",
        "monthly": "1M",
        "month": "1M",
        "1month": "1M",
        "months": "1M",
        "h": "1h",
        "hourly": "1h",
        "hour": "1h",
        "1hour": "1h",
        "hours": "1h",
        "1h": "1h",
        "2h": "2h",
        "2hour": "2h",
        "2hours": "2h",
        "4h": "4h",
        "4hour": "4h",
        "4hours": "4h",
        "m": "1m",
        "minute": "1m",
        "min": "1m",
        "1min": "1m",
        "minutes": "1m",
        "1m": "1m",
        "5m": "5m",
        "5min": "5m",
        "15m": "15m",
        "15min": "15m",
        "30m": "30m",
        "30min": "30m",
        "30minutes": "30m",
    }
    return mapping.get(normalized, normalized)


def _get_resample_rule(timeframe: str) -> Optional[str]:
    """
    Map canonical timeframe code to pandas frequency resample rule.

    Args:
        timeframe: Canonical timeframe string (e.g. '1d', '1h', '1w').

    Returns:
        Pandas frequency string ('1D', '1h', '1W') or None if unsupported.
    """
    mapping = {
        "1d": "1D",
        "1w": "W",
        "1M": "ME",  # pandas >=2.2 month end frequency
        "4h": "4h",
        "2h": "2h",
        "1h": "1h",
        "30m": "30min",
        "15m": "15min",
        "5m": "5min",
        "1m": "1min",
    }
    return mapping.get(timeframe)


def validate_ohlcv_dataframe(df: pd.DataFrame) -> None:
    """
    Validate that an OHLCV DataFrame obeys financial and mathematical invariants.

    Checks:
      - Presence of required columns: 'open', 'high', 'low', 'close', 'volume'.
      - All values are finite numbers.
      - Positive prices (open > 0, high > 0, low > 0, close > 0).
      - Non-negative volume (volume >= 0).
      - OHLC invariants: high >= max(open, close) and low <= min(open, close).

    Args:
        df: Pandas DataFrame containing OHLCV columns.

    Raises:
        ValueError: If any invariant is violated.
    """
    required_cols = ["open", "high", "low", "close", "volume"]
    missing = [col for col in required_cols if col not in df.columns]
    if missing:
        raise ValueError(f"DataFrame is missing required OHLCV columns: {missing}")

    if df.empty:
        return

    for col in required_cols:
        values = pd.to_numeric(df[col], errors="coerce").to_numpy()
        if not np.isfinite(values).all():
            raise ValueError(f"Column '{col}' contains non-finite values (NaN, Inf)")

    open_vals = df["open"].to_numpy(dtype=np.float64)
    high_vals = df["high"].to_numpy(dtype=np.float64)
    low_vals = df["low"].to_numpy(dtype=np.float64)
    close_vals = df["close"].to_numpy(dtype=np.float64)
    vol_vals = df["volume"].to_numpy(dtype=np.float64)

    if (open_vals <= 0).any() or (high_vals <= 0).any() or (low_vals <= 0).any() or (close_vals <= 0).any():
        raise ValueError("OHLCV prices must be strictly positive (> 0)")

    if (vol_vals < 0).any():
        raise ValueError("OHLCV volume must be non-negative (>= 0)")

    max_oc = np.maximum(open_vals, close_vals)
    min_oc = np.minimum(open_vals, close_vals)
    invalid_high = high_vals < max_oc
    invalid_low = low_vals > min_oc

    if invalid_high.any() or invalid_low.any():
        idx = np.where(invalid_high | invalid_low)[0][0]
        raise ValueError(
            f"Candle at index {idx} violates OHLC invariants: "
            f"open={open_vals[idx]}, high={high_vals[idx]}, low={low_vals[idx]}, close={close_vals[idx]}"
        )


class DataLoader:
    """
    DataLoader for loading, filtering, and preprocessing historical OHLCV data.

    Connects to the Phase-1 database boundary (PostgreSQL when DATABASE_URL is set,
    or SQLite/in-memory for local development and testing). Supports timeframe
    filtering and resampling, date range queries, synthetic seeding, and causal
    feature normalization for machine learning models.
    """

    def __init__(
        self,
        db_url: Optional[str] = None,
        auto_seed: bool = False,
    ) -> None:
        """
        Initialize the DataLoader.

        Args:
            db_url: Database connection URL or path. If None, checks the DATABASE_URL
                    environment variable. If not set or disabled, defaults to SQLite.
            auto_seed: Whether to generate deterministic synthetic data when loading
                       from an empty database for a requested symbol.
        """
        self.auto_seed = auto_seed
        self.db_url = db_url or os.getenv("DATABASE_URL")
        self.db_disabled = os.getenv("DATABASE_DISABLED", "false").lower() == "true"

        self.db_type = "sqlite"
        self._sqlite_conn: Optional[sqlite3.Connection] = None

        if self.db_url and not self.db_disabled and self.db_url.startswith(("postgres://", "postgresql://")):
            if PSYCOPG2_AVAILABLE:
                self.db_type = "postgres"
            else:
                self.db_type = "sqlite"
                self.db_url = ":memory:"
        else:
            self.db_type = "sqlite"
            if not self.db_url or self.db_url.startswith(("postgres://", "postgresql://")):
                self.db_url = ":memory:"

        if self.db_type == "sqlite":
            path = self.db_url
            if path.startswith("sqlite:///"):
                path = path[10:]
            self._sqlite_conn = sqlite3.connect(path, check_same_thread=False)

        self._init_db()

    def _init_db(self) -> None:
        """Create the ohlcv_candles table if it does not already exist."""
        if self.db_type == "sqlite" and self._sqlite_conn:
            with self._sqlite_conn:
                self._sqlite_conn.execute("""
                    CREATE TABLE IF NOT EXISTS ohlcv_candles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT NOT NULL,
                        timeframe TEXT NOT NULL,
                        timestamp BIGINT NOT NULL,
                        open REAL NOT NULL,
                        high REAL NOT NULL,
                        low REAL NOT NULL,
                        close REAL NOT NULL,
                        volume REAL NOT NULL,
                        open_interest REAL DEFAULT 0.0,
                        UNIQUE(symbol, timeframe, timestamp)
                    )
                """)
                self._sqlite_conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_ohlcv_query
                    ON ohlcv_candles(symbol, timeframe, timestamp)
                """)
        elif self.db_type == "postgres" and self.db_url:
            try:
                with psycopg2.connect(self.db_url) as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            CREATE TABLE IF NOT EXISTS ohlcv_candles (
                                id SERIAL PRIMARY KEY,
                                symbol VARCHAR(64) NOT NULL,
                                timeframe VARCHAR(16) NOT NULL,
                                timestamp BIGINT NOT NULL,
                                open DOUBLE PRECISION NOT NULL,
                                high DOUBLE PRECISION NOT NULL,
                                low DOUBLE PRECISION NOT NULL,
                                close DOUBLE PRECISION NOT NULL,
                                volume DOUBLE PRECISION NOT NULL,
                                open_interest DOUBLE PRECISION DEFAULT 0.0,
                                CONSTRAINT unq_symbol_tf_ts UNIQUE(symbol, timeframe, timestamp)
                            );
                            CREATE INDEX IF NOT EXISTS idx_ohlcv_query
                            ON ohlcv_candles(symbol, timeframe, timestamp);
                        """)
                    conn.commit()
            except Exception:
                self.db_type = "sqlite"
                self._sqlite_conn = sqlite3.connect(":memory:", check_same_thread=False)
                self._init_db()

    def save_historical_data(
        self,
        symbol: str,
        data: Union[pd.DataFrame, List[Dict[str, Any]], Dict[str, Any]],
        timeframe: str = "1d",
        replace: bool = True,
    ) -> int:
        """
        Save historical OHLCV candles to the database.

        Args:
            symbol: Trading instrument symbol (e.g. 'SAF1403').
            data: OHLCV candles as a DataFrame or list of dicts.
            timeframe: Timeframe code (e.g. '1d', '1h').
            replace: Whether to replace existing records with same (symbol, timeframe, timestamp).

        Returns:
            Number of saved records.

        Raises:
            ValueError: If symbol is empty or candles violate OHLC invariants.
        """
        if not symbol or not isinstance(symbol, str):
            raise ValueError("symbol must be a non-empty string")
        tf = _normalize_timeframe(timeframe)

        if isinstance(data, pd.DataFrame):
            df = data.copy()
        elif isinstance(data, dict):
            df = pd.DataFrame(data)
        elif isinstance(data, list):
            df = pd.DataFrame(data)
        else:
            raise TypeError(f"Unsupported data type: {type(data)}")

        if df.empty:
            return 0

        validate_ohlcv_dataframe(df)

        rows: List[tuple] = []
        for _, row in df.iterrows():
            ts = int(row["timestamp"])
            o = float(row["open"])
            h = float(row["high"])
            l = float(row["low"])
            c = float(row["close"])
            v = float(row["volume"])
            oi = float(row.get("open_interest", row.get("openInterest", 0.0)))
            rows.append((symbol.upper(), tf, ts, o, h, l, c, v, oi))

        if self.db_type == "sqlite" and self._sqlite_conn:
            sql = """
                INSERT OR REPLACE INTO ohlcv_candles
                (symbol, timeframe, timestamp, open, high, low, close, volume, open_interest)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """ if replace else """
                INSERT OR IGNORE INTO ohlcv_candles
                (symbol, timeframe, timestamp, open, high, low, close, volume, open_interest)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            with self._sqlite_conn:
                self._sqlite_conn.executemany(sql, rows)
            return len(rows)

        elif self.db_type == "postgres" and self.db_url:
            sql = """
                INSERT INTO ohlcv_candles
                (symbol, timeframe, timestamp, open, high, low, close, volume, open_interest)
                VALUES %s
                ON CONFLICT (symbol, timeframe, timestamp) DO UPDATE
                SET open = EXCLUDED.open, high = EXCLUDED.high,
                    low = EXCLUDED.low, close = EXCLUDED.close,
                    volume = EXCLUDED.volume, open_interest = EXCLUDED.open_interest
            """ if replace else """
                INSERT INTO ohlcv_candles
                (symbol, timeframe, timestamp, open, high, low, close, volume, open_interest)
                VALUES %s
                ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING
            """
            with psycopg2.connect(self.db_url) as conn:
                with conn.cursor() as cur:
                    execute_values(cur, sql, rows)
                conn.commit()
            return len(rows)

        return 0

    def seed_synthetic_data(
        self,
        symbol: str = "SAF1403",
        days: int = 365,
        timeframe: str = "1d",
        seed: int = 42,
    ) -> pd.DataFrame:
        """
        Generate deterministic synthetic OHLCV data using a seeded PRNG and save to DB.

        Follows Phase-1 data boundary rules: no unseeded Math.random/random.random calls.

        Args:
            symbol: Trading instrument symbol.
            days: Number of days of history to generate.
            timeframe: Target timeframe code ('1d' or '1h').
            seed: PRNG seed for reproducible generation.

        Returns:
            Pandas DataFrame containing the generated OHLCV candles.
        """
        tf = _normalize_timeframe(timeframe)
        rng = np.random.RandomState(seed)
        now_ms = int(time.time() * 1000)

        step_ms = 86_400_000 if tf == "1d" else 3_600_000
        n_steps = days if tf == "1d" else days * 24

        base_price = 1000.0 if "GOLD" not in symbol.upper() else 45_000_000.0
        mu = 0.0001
        sigma = 0.01

        prices = [base_price]
        for _ in range(n_steps):
            price = prices[-1]
            ret = rng.normal(mu, sigma)
            prices.append(max(10.0, price * np.exp(ret)))

        candles = []
        for idx in range(n_steps):
            ts = now_ms - (n_steps - idx) * step_ms
            o = prices[idx]
            c = prices[idx + 1]
            high_ext = rng.uniform(0.001, 0.01) * max(o, c)
            low_ext = rng.uniform(0.001, 0.01) * min(o, c)
            h = max(o, c) + high_ext
            l = max(0.01, min(o, c) - low_ext)
            v = float(rng.randint(1000, 10000))
            oi = float(rng.randint(2000, 10000))

            candles.append({
                "timestamp": int(ts),
                "open": float(round(o, 2)),
                "high": float(round(h, 2)),
                "low": float(round(l, 2)),
                "close": float(round(c, 2)),
                "volume": v,
                "open_interest": oi,
            })

        df = pd.DataFrame(candles)
        self.save_historical_data(symbol, df, timeframe=tf)
        return df

    def _query_candles(
        self,
        symbol: str,
        timeframe: str,
        start_ts: Optional[int],
        end_ts: Optional[int],
    ) -> pd.DataFrame:
        """Execute database SELECT query for OHLCV rows matching filters."""
        sql = """
            SELECT timestamp, open, high, low, close, volume, open_interest
            FROM ohlcv_candles
            WHERE symbol = ? AND timeframe = ?
        """
        params: List[Any] = [symbol.upper(), timeframe]

        if start_ts is not None:
            sql += " AND timestamp >= ?"
            params.append(start_ts)
        if end_ts is not None:
            sql += " AND timestamp <= ?"
            params.append(end_ts)

        sql += " ORDER BY timestamp ASC"

        if self.db_type == "sqlite" and self._sqlite_conn:
            df = pd.read_sql_query(sql, self._sqlite_conn, params=params)
        elif self.db_type == "postgres" and self.db_url:
            pg_sql = sql.replace("?", "%s")
            with psycopg2.connect(self.db_url) as conn:
                df = pd.read_sql(pg_sql, conn, params=params)
        else:
            df = pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume", "open_interest"])

        return df

    def _resample_ohlcv(self, df: pd.DataFrame, target_timeframe: str) -> pd.DataFrame:
        """
        Resample lower-timeframe OHLCV candles to a higher timeframe.

        Args:
            df: Source DataFrame of lower-timeframe candles.
            target_timeframe: Target canonical timeframe ('1d', '1h', etc.).

        Returns:
            Resampled DataFrame with OHLCV rules applied.
        """
        rule = _get_resample_rule(target_timeframe)
        if not rule or df.empty:
            return df

        df_copy = df.copy()
        df_copy["datetime"] = pd.to_datetime(df_copy["timestamp"], unit="ms", utc=True)
        df_copy = df_copy.set_index("datetime")

        agg_dict = {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }
        if "open_interest" in df_copy.columns:
            agg_dict["open_interest"] = "last"
        elif "openInterest" in df_copy.columns:
            agg_dict["openInterest"] = "last"

        resampled = df_copy.resample(rule, label="left", closed="left").agg(agg_dict).dropna(subset=["open", "close"])
        if resampled.empty:
            return pd.DataFrame(columns=df.columns)

        resampled["volume"] = resampled["volume"].fillna(0.0)
        # Guarantee strict OHLC invariants after resampling
        resampled["high"] = resampled[["open", "high", "low", "close"]].max(axis=1)
        resampled["low"] = resampled[["open", "high", "low", "close"]].min(axis=1)

        resampled["timestamp"] = (resampled.index.astype(np.int64) // 1_000_000).astype(int)
        resampled = resampled.reset_index(drop=True)

        cols = ["timestamp", "open", "high", "low", "close", "volume"]
        if "open_interest" in resampled.columns:
            resampled["open_interest"] = resampled["open_interest"].fillna(0.0)
            cols.append("open_interest")
        elif "openInterest" in resampled.columns:
            resampled["openInterest"] = resampled["openInterest"].fillna(0.0)
            cols.append("openInterest")

        return resampled[cols]

    def load_historical_data(
        self,
        symbol: str,
        start_date: Optional[Union[str, int, float, datetime.date, datetime.datetime, pd.Timestamp]] = None,
        end_date: Optional[Union[str, int, float, datetime.date, datetime.datetime, pd.Timestamp]] = None,
        timeframe: str = "1d",
    ) -> pd.DataFrame:
        """
        Load historical OHLCV data from database with date and timeframe filtering.

        Args:
            symbol: Trading instrument symbol (e.g. 'SAF1403', 'GOLD').
            start_date: Optional start date or timestamp (inclusive).
            end_date: Optional end date or timestamp (inclusive).
            timeframe: Requested timeframe ('1d', '1h', '1m', '1w', 'daily', etc.).

        Returns:
            Pandas DataFrame with columns: ['timestamp', 'open', 'high', 'low', 'close', 'volume'].
            Sorted by timestamp in ascending order.
        """
        if not symbol or not isinstance(symbol, str):
            raise ValueError("symbol must be a non-empty string")

        tf = _normalize_timeframe(timeframe)
        start_ts = _parse_timestamp(start_date)
        end_ts = _parse_timestamp(end_date)
        if start_ts is not None and end_ts is not None and start_ts > end_ts:
            raise ValueError(f"start_date ({start_date}) cannot be later than end_date ({end_date})")

        df = self._query_candles(symbol, tf, start_ts, end_ts)

        # If zero rows found, check if lower timeframe candles exist and can be resampled
        if df.empty:
            lower_timeframes = ["1d", "4h", "2h", "1h", "30m", "15m", "5m", "1m"]
            for lower_tf in lower_timeframes:
                if lower_tf == tf:
                    continue
                df_lower = self._query_candles(symbol, lower_tf, start_ts, end_ts)
                if not df_lower.empty:
                    df = self._resample_ohlcv(df_lower, tf)
                    break

        # If still empty and auto_seed is enabled, seed synthetic data and query again
        if df.empty and self.auto_seed:
            self.seed_synthetic_data(symbol=symbol, timeframe=tf)
            df = self._query_candles(symbol, tf, start_ts, end_ts)

        if not df.empty:
            df = df.sort_values("timestamp", ascending=True).reset_index(drop=True)
            validate_ohlcv_dataframe(df)

        return df

    def preprocess_data(
        self,
        data: Union[pd.DataFrame, List[Dict[str, Any]], Dict[str, Any], np.ndarray],
        normalize: bool = True,
        method: str = "causal_minmax",
        window: int = 100,
    ) -> pd.DataFrame:
        """
        Preprocess historical data and calculate ML features with causal normalization.

        Performs:
          - Data cleaning and missing value handling (ffill/bfill).
          - Strict OHLC invariant validation.
          - Feature engineering: returns, log_returns, volatility, spreads, OBI.
          - Causal normalization (expanding min-max or rolling z-score) with zero
            look-ahead bias.

        Args:
            data: Input historical OHLCV data (DataFrame, list of dicts, or dict of arrays).
            normalize: Whether to append normalized ML feature columns.
            method: Normalization method ('causal_minmax' default, or 'zscore').
            window: Rolling window size when method='zscore'.

        Returns:
            Preprocessed pandas DataFrame containing OHLCV and engineered feature columns.
        """
        if isinstance(data, pd.DataFrame):
            df = data.copy()
        elif isinstance(data, (dict, list)):
            df = pd.DataFrame(data)
        elif isinstance(data, np.ndarray):
            df = pd.DataFrame(data)
        else:
            raise TypeError(f"Unsupported data type for preprocess_data: {type(data)}")

        if df.empty:
            return df

        required_cols = ["open", "high", "low", "close", "volume"]
        missing = [col for col in required_cols if col not in df.columns]
        if missing:
            raise ValueError(f"Data is missing required OHLCV columns: {missing}")

        # Clean missing values
        df[required_cols] = df[required_cols].ffill().bfill()
        validate_ohlcv_dataframe(df)

        open_col = df["open"].astype(np.float64)
        high_col = df["high"].astype(np.float64)
        low_col = df["low"].astype(np.float64)
        close_col = df["close"].astype(np.float64)
        vol_col = df["volume"].astype(np.float64)

        # Feature engineering
        returns = close_col.pct_change().fillna(0.0)
        log_returns = np.log(close_col / close_col.shift(1).replace(0, np.nan)).fillna(0.0)

        rolling_std = returns.rolling(window=min(20, len(df)), min_periods=1).std(ddof=0).fillna(0.0)
        hl_spread = (high_col - low_col) / close_col.replace(0, np.nan)
        co_spread = (close_col - open_col) / open_col.replace(0, np.nan)

        df["return"] = returns
        df["log_return"] = log_returns
        df["volatility"] = rolling_std
        df["hl_spread"] = hl_spread.fillna(0.0)
        df["co_spread"] = co_spread.fillna(0.0)

        # Order-book imbalance feature if L2 order book data is present
        if "bids" in df.columns and "asks" in df.columns:
            obi_vals = []
            for _, row in df.iterrows():
                try:
                    obi_vals.append(calculate_obi(row.get("bids", []), row.get("asks", [])))
                except Exception:
                    obi_vals.append(0.0)
            df["obi"] = obi_vals
        elif "obi" not in df.columns:
            df["obi"] = 0.0

        if not normalize:
            return df.reset_index(drop=True)

        # Open interest normalization when present
        if "open_interest" in df.columns:
            oi_col = df["open_interest"].astype(np.float64).fillna(0.0)
            df["norm_oi"] = np.log1p(np.maximum(0.0, oi_col)) / 20.0
        elif "openInterest" in df.columns:
            oi_col = df["openInterest"].astype(np.float64).fillna(0.0)
            df["norm_oi"] = np.log1p(np.maximum(0.0, oi_col)) / 20.0

        # Causal normalization without look-ahead bias
        if method == "causal_minmax":
            running_low = low_col.expanding(min_periods=1).min()
            running_high = high_col.expanding(min_periods=1).max()
            price_range = (running_high - running_low).replace(0.0, 1.0)
            price_range = price_range.mask(price_range < 1e-8, 1.0)

            df["norm_open"] = (open_col - running_low) / price_range
            df["norm_high"] = (high_col - running_low) / price_range
            df["norm_low"] = (low_col - running_low) / price_range
            df["norm_close"] = (close_col - running_low) / price_range
            df["norm_volume"] = np.log1p(vol_col) / 20.0

        elif method == "zscore":
            df["norm_open"] = rolling_zscore(open_col.tolist(), window=window)
            df["norm_high"] = rolling_zscore(high_col.tolist(), window=window)
            df["norm_low"] = rolling_zscore(low_col.tolist(), window=window)
            df["norm_close"] = rolling_zscore(close_col.tolist(), window=window)
            df["norm_volume"] = rolling_zscore(vol_col.tolist(), window=window)
        else:
            raise ValueError(f"Unknown normalization method: {method}")

        return df.reset_index(drop=True)


# Standalone module-level singleton and functions

_default_loader: Optional[DataLoader] = None


def _get_default_loader() -> DataLoader:
    """Return or initialize the default module-level DataLoader singleton."""
    global _default_loader
    if _default_loader is None:
        _default_loader = DataLoader(db_url=":memory:", auto_seed=False)
    return _default_loader


def load_historical_data(
    symbol: str,
    start_date: Optional[Union[str, int, float, datetime.date, datetime.datetime, pd.Timestamp]] = None,
    end_date: Optional[Union[str, int, float, datetime.date, datetime.datetime, pd.Timestamp]] = None,
    timeframe: str = "1d",
    db_url: Optional[str] = None,
) -> pd.DataFrame:
    """
    Load historical OHLCV data from database with timeframe and date filtering.

    Args:
        symbol: Instrument symbol (e.g. 'SAF1403').
        start_date: Optional start date or timestamp.
        end_date: Optional end date or timestamp.
        timeframe: Requested timeframe ('1d', '1h', '1w', 'daily', etc.).
        db_url: Optional explicit database URL/path.

    Returns:
        Pandas DataFrame containing filtered OHLCV candles.
    """
    if db_url is not None:
        loader = DataLoader(db_url=db_url)
        return loader.load_historical_data(symbol, start_date, end_date, timeframe)
    return _get_default_loader().load_historical_data(symbol, start_date, end_date, timeframe)


def preprocess_data(
    data: Union[pd.DataFrame, List[Dict[str, Any]], Dict[str, Any], np.ndarray],
    normalize: bool = True,
    method: str = "causal_minmax",
    window: int = 100,
) -> pd.DataFrame:
    """
    Preprocess historical OHLCV data and optionally normalize features for ML models.

    Args:
        data: Input historical OHLCV data.
        normalize: Whether to apply causal normalization.
        method: Normalization method ('causal_minmax' default, or 'zscore').
        window: Window size when method='zscore'.

    Returns:
        Preprocessed DataFrame with engineered features and normalized columns.
    """
    return _get_default_loader().preprocess_data(
        data=data, normalize=normalize, method=method, window=window
    )


def main() -> int:
    """CLI entrypoint for testing data loading and preprocessing from command line."""
    import argparse

    parser = argparse.ArgumentParser(description="Intelligences-Trader ML Service DataLoader CLI")
    parser.add_argument("--symbol", type=str, default="SAF1403", help="Instrument symbol (e.g. SAF1403, GOLD)")
    parser.add_argument("--timeframe", type=str, default="1d", help="Timeframe (e.g. 1d, 1h, 1w, 1m)")
    parser.add_argument("--start-date", type=str, default=None, help="Start date/timestamp filter")
    parser.add_argument("--end-date", type=str, default=None, help="End date/timestamp filter")
    parser.add_argument("--seed", action="store_true", help="Seed synthetic data for symbol")
    parser.add_argument("--days", type=int, default=365, help="Number of days to seed")
    parser.add_argument("--seed-val", type=int, default=42, help="PRNG seed value")
    parser.add_argument("--preprocess", action="store_true", help="Run preprocess_data on loaded candles")
    parser.add_argument("--normalize", action="store_true", help="Apply causal normalization")
    parser.add_argument("--method", type=str, default="causal_minmax", choices=["causal_minmax", "zscore"])
    parser.add_argument("--output", type=str, default=None, help="Output file path")
    parser.add_argument("--format", type=str, choices=["json", "csv"], default="json")
    parser.add_argument("--db-url", type=str, default=None, help="Database URL/path")

    args = parser.parse_args()
    loader = DataLoader(db_url=args.db_url, auto_seed=args.seed)

    if args.seed:
        loader.seed_synthetic_data(symbol=args.symbol, days=args.days, timeframe=args.timeframe, seed=args.seed_val)

    df = loader.load_historical_data(
        symbol=args.symbol,
        start_date=args.start_date,
        end_date=args.end_date,
        timeframe=args.timeframe,
    )

    if args.preprocess:
        df = loader.preprocess_data(df, normalize=args.normalize, method=args.method)

    if args.format == "csv":
        out_str = df.to_csv(index=False)
    else:
        out_str = df.to_json(orient="records", indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(out_str)
        print(f"Successfully wrote {len(df)} records to {args.output}")
    else:
        print(out_str)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
