# Intelligences-Trader ML research pipeline

This directory contains the Python research implementation for:

- a historical data loader and preprocessor (`data_loader.py`) connecting to Phase-1 database boundaries with point-in-time filtering, timeframe resampling, and causal normalization;
- a causal temporal convolutional actor-critic;
- PPO with categorical direction and Beta-distributed position size;
- a Gaussian-HMM volatility regime detector;
- order-book imbalance and rolling normalization features;
- an independent pre-trade circuit breaker.

## Reproducible setup

```bash
uv sync --locked
uv run pytest -q
```

PyTorch and ONNX are optional large dependencies:

```bash
uv sync --locked --extra training
uv run python train.py
```

The generated `market_model.onnx` is a research artifact. Before deployment, publish a model card containing the dataset and feature-schema hashes, scaler parameters, random seeds, training code commit, holdout dates, cost assumptions, calibration results, and approval signature. Do not promote a newly exported model merely because training completed.

## Action and observation contracts

Action: `[direction, size]`

- direction `0`: short
- direction `1`: hold/flat
- direction `2`: long
- size: capital fraction in `[0, 1]`

Observation: `[volatility_regime, drawdown, last_return, current_position, order_book_imbalance]`.

The safety circuit breaker is independent from the learned policy and must remain in the broker boundary for any future paper/live adapter.
