"""Feature engineering utilities shared by training and inference."""

from collections.abc import Sequence
from typing import Any

import numpy as np
import pandas as pd


def _is_empty(book: Any) -> bool:
    return book is None or len(book) == 0


def _quantity(level: Any) -> float:
    try:
        value = level["quantity"] if isinstance(level, dict) else level[1]
        quantity = float(value)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError("Each order-book level must contain a numeric quantity") from exc
    if not np.isfinite(quantity) or quantity < 0:
        raise ValueError("Order-book quantities must be non-negative finite numbers")
    return quantity


def calculate_obi(bids: Sequence, asks: Sequence) -> float:
    """Calculate top-of-book imbalance in the closed interval ``[-1, 1]``."""
    if _is_empty(bids) or _is_empty(asks):
        return 0.0

    bid_quantity = _quantity(bids[0])
    ask_quantity = _quantity(asks[0])
    denominator = bid_quantity + ask_quantity
    return 0.0 if denominator == 0 else (bid_quantity - ask_quantity) / denominator


def calculate_obi_multi_level(bids: Sequence, asks: Sequence, levels: int = 5) -> float:
    """Calculate linearly depth-weighted multi-level order-book imbalance."""
    if not isinstance(levels, int) or levels < 1:
        raise ValueError("levels must be a positive integer")
    if _is_empty(bids) or _is_empty(asks):
        return 0.0

    level_count = min(levels, len(bids), len(asks))
    bid_quantity = 0.0
    ask_quantity = 0.0
    for index in range(level_count):
        weight = 1.0 - index / level_count
        bid_quantity += _quantity(bids[index]) * weight
        ask_quantity += _quantity(asks[index]) * weight

    denominator = bid_quantity + ask_quantity
    return 0.0 if denominator == 0 else (bid_quantity - ask_quantity) / denominator


def rolling_zscore(series: Sequence[float], window: int = 100) -> list[float]:
    """Normalize a time series using only the current and preceding observations."""
    if not isinstance(window, int) or window < 1:
        raise ValueError("window must be a positive integer")
    values = pd.to_numeric(pd.Series(series, dtype="float64"), errors="coerce")
    if values.isna().any() or not np.isfinite(values.to_numpy()).all():
        raise ValueError("series must contain only finite numeric values")

    rolling_mean = values.rolling(window=window, min_periods=1).mean()
    rolling_std = values.rolling(window=window, min_periods=1).std(ddof=0)
    safe_std = rolling_std.mask(rolling_std < np.finfo(float).eps, 1.0)
    return ((values - rolling_mean) / safe_std).tolist()
