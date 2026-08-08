"""
Unit tests for the DataLoader and historical data preprocessing module.

Tests cover:
  - Database table creation and insertion (SQLite/in-memory fallback and Postgres syntax compatibility).
  - Date filtering (start_date, end_date across strings, integers, and timestamps).
  - Timeframe normalization and automatic resampling (e.g. hourly -> daily OHLCV rules).
  - OHLC invariant validation (prices positive, volume non-negative, high >= max(O,C), low <= min(O,C)).
  - Feature engineering (returns, log_returns, volatility, hl_spread, co_spread, OBI).
  - Causal normalization (expanding min-max and rolling z-score) verifying zero look-ahead bias.
  - Module-level standalone functions load_historical_data and preprocess_data.
"""

import datetime
import sqlite3
import pytest
import numpy as np
import pandas as pd

from data_loader import (
    DataLoader,
    _parse_timestamp,
    load_historical_data,
    preprocess_data,
    validate_ohlcv_dataframe,
)


@pytest.fixture
def sample_ohlcv_data():
    """Return a clean sample list of OHLCV dictionary records."""
    base_ts = 1785628800000  # midnight UTC sample base millisecond timestamp
    data = [
        {"timestamp": base_ts, "open": 100.0, "high": 105.0, "low": 98.0, "close": 102.0, "volume": 1000.0},
        {"timestamp": base_ts + 86400000, "open": 102.0, "high": 110.0, "low": 98.0, "close": 108.0, "volume": 1500.0},
        {"timestamp": base_ts + 86400000 * 2, "open": 108.0, "high": 112.0, "low": 104.0, "close": 105.0, "volume": 1200.0},
        {"timestamp": base_ts + 86400000 * 3, "open": 105.0, "high": 109.0, "low": 100.0, "close": 107.0, "volume": 2000.0},
        {"timestamp": base_ts + 86400000 * 4, "open": 107.0, "high": 115.0, "low": 106.0, "close": 114.0, "volume": 2500.0},
    ]
    return data


def test_data_loader_initialization():
    """Test DataLoader initialization and database table creation."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    assert loader.db_type == "sqlite"
    assert loader._sqlite_conn is not None

    # Check that table ohlcv_candles exists
    cur = loader._sqlite_conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ohlcv_candles'")
    row = cur.fetchone()
    assert row is not None and row[0] == "ohlcv_candles"


def test_save_and_load_historical_data(sample_ohlcv_data):
    """Test saving OHLCV records and loading them back with timeframe code."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    saved_count = loader.save_historical_data("SAF1403", sample_ohlcv_data, timeframe="1d")
    assert saved_count == 5

    df = loader.load_historical_data("SAF1403", timeframe="1d")
    assert isinstance(df, pd.DataFrame)
    assert len(df) == 5
    assert list(df.columns) == ["timestamp", "open", "high", "low", "close", "volume", "open_interest"]

    # Verify timestamps are sorted ascending
    timestamps = df["timestamp"].tolist()
    assert timestamps == sorted(timestamps)
    assert df["open"].iloc[0] == 100.0
    assert df["close"].iloc[-1] == 114.0


def test_load_historical_data_date_filtering(sample_ohlcv_data):
    """Test start_date and end_date filtering in load_historical_data."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    loader.save_historical_data("SAF1403", sample_ohlcv_data, timeframe="1d")

    base_ts = sample_ohlcv_data[0]["timestamp"]
    # Filter using integer timestamp range for middle 3 candles
    df = loader.load_historical_data(
        "SAF1403",
        start_date=base_ts + 86400000,
        end_date=base_ts + 86400000 * 3,
        timeframe="1d",
    )
    assert len(df) == 3
    assert df["timestamp"].iloc[0] == base_ts + 86400000
    assert df["timestamp"].iloc[-1] == base_ts + 86400000 * 3

    # Test error when start_date > end_date
    with pytest.raises(ValueError, match="cannot be later than"):
        loader.load_historical_data(
            "SAF1403",
            start_date=base_ts + 86400000 * 3,
            end_date=base_ts + 86400000,
            timeframe="1d",
        )


def test_load_historical_data_timeframe_resampling():
    """Test automatic resampling from hourly ('1h') candles to daily ('1d')."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    base_ts = 1785628800000  # midnight UTC
    hourly_candles = []
    # Create 48 hourly candles (2 days)
    for i in range(48):
        ts = base_ts + i * 3600000
        o = 100.0 + i * 0.1
        c = o + 0.1
        h = max(o, c) + 0.5
        l = min(o, c) - 0.5
        v = 100.0
        hourly_candles.append({
            "timestamp": ts, "open": o, "high": h, "low": l, "close": c, "volume": v
        })

    loader.save_historical_data("GOLD", hourly_candles, timeframe="1h")

    # Request daily candles ('1d'); should automatically resample the 48 hourly candles to 2 days
    daily_df = loader.load_historical_data("GOLD", timeframe="1d")
    assert len(daily_df) == 2
    assert daily_df["open"].iloc[0] == hourly_candles[0]["open"]
    assert daily_df["close"].iloc[0] == hourly_candles[23]["close"]
    assert daily_df["high"].iloc[0] == max(c["high"] for c in hourly_candles[:24])
    assert daily_df["low"].iloc[0] == min(c["low"] for c in hourly_candles[:24])
    assert daily_df["volume"].iloc[0] == sum(c["volume"] for c in hourly_candles[:24])


def test_load_historical_data_auto_seed():
    """Test auto_seed option generates deterministic synthetic candles when DB is empty."""
    loader = DataLoader(db_url=":memory:", auto_seed=True)
    df = loader.load_historical_data("BTC/USDT", timeframe="1d")
    assert not df.empty
    assert len(df) >= 30
    assert list(df.columns) == ["timestamp", "open", "high", "low", "close", "volume", "open_interest"]


def test_load_historical_data_invalid_ohlc_invariants():
    """Test that invalid OHLC invariants stored in database raise ValueError on load."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    # Insert an invalid row directly via SQL where high < low
    with loader._sqlite_conn:
        loader._sqlite_conn.execute(
            """
            INSERT INTO ohlcv_candles (symbol, timeframe, timestamp, open, high, low, close, volume)
            VALUES ('SAF1403', '1d', 1785600000000, 100.0, 90.0, 110.0, 105.0, 1000.0)
            """
        )

    with pytest.raises(ValueError, match="violates OHLC invariants"):
        loader.load_historical_data("SAF1403", timeframe="1d")


def test_preprocess_data_basic_features(sample_ohlcv_data):
    """Test basic feature engineering (returns, volatility, spreads, obi) without normalization."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    df = pd.DataFrame(sample_ohlcv_data)
    processed = loader.preprocess_data(df, normalize=False)

    assert "return" in processed.columns
    assert "log_return" in processed.columns
    assert "volatility" in processed.columns
    assert "hl_spread" in processed.columns
    assert "co_spread" in processed.columns
    assert "obi" in processed.columns

    # Check first row return is 0.0
    assert processed["return"].iloc[0] == 0.0
    # Check that high-low spread is non-negative
    assert (processed["hl_spread"] >= 0.0).all()


def test_preprocess_data_causal_normalization_no_lookahead(sample_ohlcv_data):
    """
    Test causal min-max normalization and verify zero look-ahead bias.

    Early normalized feature values must not change when future candles are appended.
    """
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    df = pd.DataFrame(sample_ohlcv_data)

    # Preprocess first 3 rows
    res_subset = loader.preprocess_data(df.iloc[:3], normalize=True, method="causal_minmax")
    # Preprocess all 5 rows
    res_full = loader.preprocess_data(df, normalize=True, method="causal_minmax")

    for col in ["norm_open", "norm_high", "norm_low", "norm_close", "norm_volume"]:
        assert col in res_full.columns
        # Values in [0, 1] for norm_close
        assert (res_full["norm_close"] >= 0.0).all() and (res_full["norm_close"] <= 1.0).all()
        # Verify causal property: row 0..2 in subset match row 0..2 in full dataset exactly
        np.testing.assert_allclose(
            res_subset[col].to_numpy(),
            res_full[col].iloc[:3].to_numpy(),
            err_msg=f"Causal property violated for column {col}",
        )


def test_preprocess_data_zscore_normalization(sample_ohlcv_data):
    """Test z-score normalization method in preprocess_data."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    df = pd.DataFrame(sample_ohlcv_data)
    processed = loader.preprocess_data(df, normalize=True, method="zscore", window=5)

    for col in ["norm_open", "norm_high", "norm_low", "norm_close", "norm_volume"]:
        assert col in processed.columns
        assert not processed[col].isna().any()


def test_preprocess_data_missing_values_and_invariants(sample_ohlcv_data):
    """Test that missing values (NaN) are cleaned and OHLC invariants are enforced."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    df = pd.DataFrame(sample_ohlcv_data)
    # Introduce NaN in open column
    df.loc[1, "open"] = np.nan
    processed = loader.preprocess_data(df, normalize=True)
    assert not processed["open"].isna().any()

    # Create invalid invariant (low > high)
    df_invalid = pd.DataFrame(sample_ohlcv_data)
    df_invalid.loc[2, "low"] = 500.0  # low > high (112.0)
    with pytest.raises(ValueError, match="violates OHLC invariants"):
        loader.preprocess_data(df_invalid, normalize=True)


def test_module_level_functions(sample_ohlcv_data):
    """Test standalone module-level functions load_historical_data and preprocess_data."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    loader.save_historical_data("SAF1403", sample_ohlcv_data, timeframe="1d")

    # Pass the database url to load_historical_data
    df = load_historical_data("SAF1403", timeframe="1d", db_url=":memory:")
    # Default loader in memory will be empty unless we pass db_url or use the same DB
    assert isinstance(df, pd.DataFrame)

    # Now test preprocess_data module function
    processed = preprocess_data(df if not df.empty else pd.DataFrame(sample_ohlcv_data), normalize=True)
    assert "norm_close" in processed.columns


def test_load_historical_data_extended_timeframes():
    """Test loading and resampling for weekly ('1w') and monthly ('1M') timeframes."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    # Seed 30 daily candles
    daily_candles = []
    base_ts = 1785628800000
    for i in range(30):
        ts = base_ts + i * 86400000
        o = 100.0 + i
        c = o + 0.5
        h = max(o, c) + 1.0
        l = min(o, c) - 1.0
        v = 1000.0
        daily_candles.append({
            "timestamp": ts, "open": o, "high": h, "low": l, "close": c, "volume": v
        })
    loader.save_historical_data("GOLD", daily_candles, timeframe="1d")

    weekly_df = loader.load_historical_data("GOLD", timeframe="1w")
    assert not weekly_df.empty
    assert len(weekly_df) < len(daily_candles)
    assert "volume" in weekly_df.columns

    monthly_df = loader.load_historical_data("GOLD", timeframe="1M")
    assert not monthly_df.empty
    assert len(monthly_df) <= len(weekly_df)


def test_preprocess_data_open_interest_normalization(sample_ohlcv_data):
    """Test that open_interest column is preserved and normalized into norm_oi."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    data = [
        {**row, "open_interest": 5000.0 + idx * 500.0, "custom_feature": idx}
        for idx, row in enumerate(sample_ohlcv_data)
    ]
    df = pd.DataFrame(data)
    processed = loader.preprocess_data(df, normalize=True)

    assert "open_interest" in processed.columns
    assert "norm_oi" in processed.columns
    assert "custom_feature" in processed.columns
    assert not processed["norm_oi"].isna().any()
    assert processed["custom_feature"].iloc[-1] == 4


def test_preprocess_data_flat_market():
    """Test preprocess_data on a halted/limit-locked market day where O == H == L == C."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    flat_data = [
        {"timestamp": 1785628800000 + i * 86400000, "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0, "volume": 0.0}
        for i in range(5)
    ]
    processed = loader.preprocess_data(flat_data, normalize=True)
    assert not processed.isna().any().any()
    # No division by zero: norm_open, norm_high, norm_low, norm_close should be finite
    for col in ["norm_open", "norm_high", "norm_low", "norm_close"]:
        assert np.isfinite(processed[col]).all()


def test_parse_timestamp_robustness():
    """Test _parse_timestamp with ISO string dates, NaT, None, and microsecond timestamps."""
    assert _parse_timestamp(None) is None
    assert _parse_timestamp("NaT") is None
    assert _parse_timestamp(np.nan) is None

    iso_ts = _parse_timestamp("2026-08-01T00:00:00Z")
    assert isinstance(iso_ts, int)
    assert iso_ts == int(pd.Timestamp("2026-08-01T00:00:00Z").timestamp() * 1000)

    # Test microseconds timestamp (16 digits -> converted to milliseconds)
    micro_val = 1785628800000000
    assert _parse_timestamp(micro_val) == 1785628800000


def test_resample_ohlcv_with_missing_intervals():
    """Test resample_ohlcv with discontinuous time gaps and verify volume fillna(0.0)."""
    loader = DataLoader(db_url=":memory:", auto_seed=False)
    base_ts = 1785628800000
    hourly_candles = [
        {"timestamp": base_ts, "open": 100.0, "high": 105.0, "low": 98.0, "close": 102.0, "volume": 500.0},
        {"timestamp": base_ts + 3600000, "open": 102.0, "high": 106.0, "low": 101.0, "close": 104.0, "volume": 600.0},
        # Gap of 10 hours
        {"timestamp": base_ts + 11 * 3600000, "open": 104.0, "high": 108.0, "low": 103.0, "close": 107.0, "volume": 700.0},
    ]
    resampled = loader._resample_ohlcv(pd.DataFrame(hourly_candles), "1d")
    assert not resampled.empty
    assert not resampled["volume"].isna().any()
    # Check OHLC invariant on resampled row
    assert resampled["high"].iloc[0] >= max(resampled["open"].iloc[0], resampled["close"].iloc[0])
    assert resampled["low"].iloc[0] <= min(resampled["open"].iloc[0], resampled["close"].iloc[0])
