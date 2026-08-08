"""Gymnasium environment used by the PPO position-sizing model."""

from collections.abc import Sequence

import gymnasium as gym
import numpy as np
from gymnasium import spaces


class TradingEnvironment(gym.Env):
    """Trading environment with transaction costs, margin checks, and DSR reward.

    Actions are ``[direction, size]`` where direction is encoded as 0=short,
    1=flat, and 2=long, and size is a capital fraction in ``[0, 1]``.
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        market_data: Sequence[dict],
        initial_balance: float = 10_000_000.0,
        transaction_fee: float = 0.001,
        eta: float = 0.02,
    ):
        super().__init__()
        if len(market_data) < 2:
            raise ValueError("market_data must contain at least two observations")
        if not np.isfinite(initial_balance) or initial_balance <= 0:
            raise ValueError("initial_balance must be positive")
        if not np.isfinite(transaction_fee) or not 0 <= transaction_fee < 1:
            raise ValueError("transaction_fee must be in [0, 1)")
        if not np.isfinite(eta) or not 0 < eta <= 1:
            raise ValueError("eta must be in (0, 1]")
        for row in market_data:
            price = float(row.get("price", 0))
            if not np.isfinite(price) or price <= 0:
                raise ValueError("every market observation must have a positive finite price")

        self.market_data = list(market_data)
        self.initial_balance = float(initial_balance)
        self.transaction_fee = float(transaction_fee)
        self.eta = float(eta)

        self.action_space = spaces.Box(
            low=np.array([0.0, 0.0], dtype=np.float32),
            high=np.array([2.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )
        self.observation_space = spaces.Box(
            low=np.array([0.0, 0.0, -1.0, -1.0, -1.0], dtype=np.float32),
            high=np.array([2.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )

        self.initial_margin_req = 0.15
        self.maintenance_margin_req = 0.10
        self.margin_call_penalty = -10.0
        self.reset()

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.balance = self.initial_balance
        self.peak_balance = self.initial_balance
        self.current_step = 0
        self.position = 0.0
        self.done = False
        self.A = 0.0
        self.B = 0.0
        return self._get_observation(), self._get_info()

    def _get_observation(self):
        step_data = self.market_data[self.current_step]
        drawdown = np.clip((self.peak_balance - self.balance) / self.peak_balance, 0.0, 1.0)
        if self.current_step > 0:
            previous_price = float(self.market_data[self.current_step - 1]["price"])
            current_price = float(step_data["price"])
            last_return = np.clip((current_price - previous_price) / previous_price, -1.0, 1.0)
        else:
            last_return = 0.0

        regime = np.clip(float(step_data.get("regime", 1)), 0.0, 2.0)
        obi = np.clip(float(step_data.get("obi", 0.0)), -1.0, 1.0)
        return np.array([regime, drawdown, last_return, self.position, obi], dtype=np.float32)

    def _get_info(self):
        return {
            "balance": self.balance,
            "position": self.position,
            "peak_balance": self.peak_balance,
            "step": self.current_step,
        }

    def step(self, action):
        if self.done:
            raise RuntimeError("step() called after the episode terminated; call reset()")

        action_array = np.asarray(action, dtype=np.float64).reshape(-1)
        if action_array.size != 2 or not np.isfinite(action_array).all():
            raise ValueError("action must contain finite [direction, size] values")

        direction = int(np.clip(np.rint(action_array[0]), 0, 2))
        size = float(np.clip(action_array[1], 0.0, 1.0))
        target_position = -size if direction == 0 else size if direction == 2 else 0.0

        current_price = float(self.market_data[self.current_step]["price"])
        next_price = float(self.market_data[self.current_step + 1]["price"])
        price_return = (next_price - current_price) / current_price

        position_change = abs(target_position - self.position)
        transaction_cost = self.balance * position_change * self.transaction_fee
        # The action is placed at the current price and therefore participates in
        # the current-to-next price movement.
        gross_return = target_position * price_return
        net_profit = self.balance * gross_return - transaction_cost
        self.balance = max(0.0, self.balance + net_profit)
        self.peak_balance = max(self.peak_balance, self.balance)

        margin_call_triggered = False
        if target_position != 0 and self.balance > 0:
            # Position size is posted margin. Futures notional is larger by the
            # inverse of the initial margin ratio.
            notional = self.balance * abs(target_position) / self.initial_margin_req
            posted_margin = notional * self.initial_margin_req
            maintenance_margin = notional * self.maintenance_margin_req
            free_balance = self.balance - posted_margin
            if free_balance < maintenance_margin:
                margin_call_triggered = True
                self.balance = max(0.0, self.balance - posted_margin * 0.1)
                target_position = 0.0

        self.position = target_position
        self.current_step += 1
        step_return = net_profit / self.initial_balance

        delta_A = step_return - self.A
        delta_B = step_return**2 - self.B
        variance = max(0.0, self.B - self.A**2)
        denominator = variance**1.5
        reward = (
            (self.B * delta_A - 0.5 * self.A * delta_B) / denominator
            if denominator > 1e-8
            else step_return
        )
        self.A += self.eta * delta_A
        self.B += self.eta * delta_B
        if margin_call_triggered:
            reward += self.margin_call_penalty

        self.done = self.current_step >= len(self.market_data) - 1 or self.balance <= 0
        return self._get_observation(), float(reward), self.done, False, self._get_info()
