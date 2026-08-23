"""Intelligences-Trader — ML service entry point.

Runs the PPO training pipeline (synthetic market data → HMM regime detection →
actor-critic PPO training → ONNX export). This is the canonical way to
(re)produce `market_model.onnx` for the Node serving layer.

Usage:
    python main.py
"""
from train import train_ppo


def main():
    train_ppo()


if __name__ == "__main__":
    main()
