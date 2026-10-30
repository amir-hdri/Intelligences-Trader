"""Intelligences-Trader — ML service entry point.

Runs the PPO training pipeline (synthetic market data → HMM regime detection →
actor-critic PPO training → ONNX export). The exported `market_model.onnx` is
this service's research artifact: one input with five features per step and two
outputs (`dir_probabilities` and `expected_position_size`).

The Node serving layer ships a different artifact under the same file name — one
input with ten features per step and one output — and this pipeline does not
produce it. The two contracts are pinned by `test_model_contract.py`.

Usage:
    python main.py
"""
from train import train_ppo


def main():
    train_ppo()


if __name__ == "__main__":
    main()
