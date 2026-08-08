"""
Intelligences-Trader ML Service Package.

Exports data/strategy utilities and the PerformanceMetrics reporting calculator.
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
from .performance_metrics import PerformanceMetrics

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
    "PerformanceMetrics",
]
