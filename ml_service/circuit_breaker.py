"""Independent pre-trade safety controls."""

import math


class CircuitBreakerViolation(Exception):
    """Raised when an equity or order safety invariant is violated."""


class CircuitBreaker:
    """Rule-based safety layer placed between a model and a broker API."""

    def __init__(self, initial_equity, max_daily_drawdown_pct=0.03, max_position_pct=0.20):
        if not math.isfinite(initial_equity) or initial_equity <= 0:
            raise ValueError("initial_equity must be a positive finite number")
        if not math.isfinite(max_daily_drawdown_pct) or not 0 < max_daily_drawdown_pct <= 1:
            raise ValueError("max_daily_drawdown_pct must be in (0, 1]")
        if not math.isfinite(max_position_pct) or not 0 < max_position_pct <= 1:
            raise ValueError("max_position_pct must be in (0, 1]")

        self.initial_equity = float(initial_equity)
        self.daily_starting_equity = float(initial_equity)
        self.current_equity = float(initial_equity)
        self.max_daily_drawdown_pct = float(max_daily_drawdown_pct)
        self.max_position_pct = float(max_position_pct)
        self.is_halted = False
        self.active_positions = 0.0

    def reset_daily_equity(self, new_equity):
        if not math.isfinite(new_equity) or new_equity <= 0:
            raise ValueError("new_equity must be a positive finite number")
        self.daily_starting_equity = float(new_equity)
        self.current_equity = float(new_equity)
        self.is_halted = False
        self.active_positions = 0.0

    def update_equity(self, current_equity):
        if not math.isfinite(current_equity) or current_equity < 0:
            raise ValueError("current_equity must be a non-negative finite number")
        self.current_equity = float(current_equity)
        daily_loss_pct = (self.daily_starting_equity - self.current_equity) / self.daily_starting_equity
        if daily_loss_pct >= self.max_daily_drawdown_pct:
            self.is_halted = True
            self.active_positions = 0.0
            raise CircuitBreakerViolation(
                f"HALT: Daily drawdown limit breached ({daily_loss_pct * 100:.2f}% >= "
                f"{self.max_daily_drawdown_pct * 100:.2f}%). Liquidating all positions."
            )

    def validate_order(self, direction, size, symbol_info=None):
        """Validate ``direction`` (0 short, 1 hold, 2 long) and capital fraction."""
        if self.is_halted:
            raise CircuitBreakerViolation("ORDER REJECTED: System is in HALT mode due to drawdown limits.")
        if direction not in (0, 1, 2):
            raise CircuitBreakerViolation("ORDER REJECTED: Direction must be 0 (SHORT), 1 (HOLD), or 2 (LONG).")
        if not math.isfinite(size) or not 0 <= size <= 1:
            raise CircuitBreakerViolation(f"ORDER REJECTED: Size {size} must be between 0.0 and 1.0.")
        if direction == 1:
            if size != 0:
                raise CircuitBreakerViolation("ORDER REJECTED: HOLD orders must have size 0.")
            return True
        if size <= 0:
            raise CircuitBreakerViolation("ORDER REJECTED: Executable orders must have a positive size.")
        if size > self.max_position_pct:
            raise CircuitBreakerViolation(
                f"ORDER REJECTED: Position size ({size * 100:.2f}%) exceeds maximum limit "
                f"({self.max_position_pct * 100:.2f}%)."
            )

        if symbol_info:
            try:
                last_price = float(symbol_info["last_price"])
                limit_up = float(symbol_info["limit_up"])
                limit_down = float(symbol_info["limit_down"])
            except (KeyError, TypeError, ValueError) as exc:
                raise CircuitBreakerViolation("ORDER REJECTED: Incomplete or invalid symbol limits.") from exc
            if not all(math.isfinite(value) for value in (last_price, limit_up, limit_down)):
                raise CircuitBreakerViolation("ORDER REJECTED: Symbol limits must be finite.")
            if limit_down > limit_up:
                raise CircuitBreakerViolation("ORDER REJECTED: Symbol price limits are inconsistent.")
            if last_price >= limit_up and direction == 2:
                raise CircuitBreakerViolation("ORDER REJECTED: Symbol is locked at LIMIT UP. Cannot BUY.")
            if last_price <= limit_down and direction == 0:
                raise CircuitBreakerViolation("ORDER REJECTED: Symbol is locked at LIMIT DOWN. Cannot SELL.")

        return True
