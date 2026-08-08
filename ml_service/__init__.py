"""
Intelligences-Trader ML Service Package.

Exports DataLoader and data preprocessing utilities.
"""

from .data_loader import DataLoader, load_historical_data, preprocess_data
from .strategy_engine import (
    StrategyEngine,
    generate_signals,
    simulate_orders,
    execute_strategy,
    MovingAverageCrossoverStrategy,
    MeanReversionStrategy,
    MLBasedStrategy,
)

__all__ = [
    "DataLoader",
    "load_historical_data",
    "preprocess_data",
    "StrategyEngine",
    "generate_signals",
    "simulate_orders",
    "execute_strategy",
    "MovingAverageCrossoverStrategy",
    "MeanReversionStrategy",
    "MLBasedStrategy",
]
