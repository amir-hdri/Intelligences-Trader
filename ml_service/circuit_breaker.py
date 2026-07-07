class CircuitBreakerViolation(Exception):
    pass

class CircuitBreaker:
    """
    An independent, rule-based Python safety layer (Circuit Breaker)
    sitting between the AI model and the Broker API to intercept and validate orders.
    """
    def __init__(self, initial_equity, max_daily_drawdown_pct=0.03, max_position_pct=0.20):
        self.initial_equity = initial_equity
        self.daily_starting_equity = initial_equity
        self.current_equity = initial_equity
        self.max_daily_drawdown_pct = max_daily_drawdown_pct
        self.max_position_pct = max_position_pct
        self.is_halted = False
        self.active_positions = 0.0  # Fraction in [-1.0, 1.0]

    def reset_daily_equity(self, new_equity):
        """
        Reset the baseline equity at the start of a new trading day.
        """
        self.daily_starting_equity = new_equity
        self.current_equity = new_equity
        self.is_halted = False

    def update_equity(self, current_equity):
        """
        Update the current account equity and verify drawdown limits.
        """
        self.current_equity = current_equity
        
        # Calculate daily drawdown
        daily_loss_pct = (self.daily_starting_equity - self.current_equity) / self.daily_starting_equity
        
        if daily_loss_pct >= self.max_daily_drawdown_pct:
            self.is_halted = True
            self.active_positions = 0.0
            raise CircuitBreakerViolation(
                f"HALT: Daily drawdown limit breached ({daily_loss_pct*100:.2f}% >= {self.max_daily_drawdown_pct*100:.2f}%). "
                "Liquidating all positions."
            )

    def validate_order(self, direction, size, symbol_info=None):
        """
        Validate an order before sending to the broker.
        direction: 0 (SHORT), 1 (HOLD), 2 (LONG)
        size: float in [0, 1] (fraction of account)
        """
        if self.is_halted:
            raise CircuitBreakerViolation("ORDER REJECTED: System is in HALT mode due to drawdown limits.")

        if direction == 1:  # HOLD/NO-OP
            return True

        # Check position size bounds
        if size < 0.0 or size > 1.0:
            raise CircuitBreakerViolation(f"ORDER REJECTED: Size {size} must be between 0.0 and 1.0.")

        # Check maximum allowed position limit (e.g., max 20% of capital)
        if size > self.max_position_pct:
            raise CircuitBreakerViolation(
                f"ORDER REJECTED: Position size ({size*100:.2f}%) exceeds maximum limit ({self.max_position_pct*100:.2f}%)."
            )

        # Enforce IME specifics (limit up/down)
        if symbol_info:
            last_price = symbol_info.get('last_price', 0.0)
            limit_up = symbol_info.get('limit_up', float('inf'))
            limit_down = symbol_info.get('limit_down', 0.0)
            
            if last_price >= limit_up and direction == 2:
                raise CircuitBreakerViolation("ORDER REJECTED: Symbol is locked at LIMIT UP. Cannot BUY.")
            if last_price <= limit_down and direction == 0:
                raise CircuitBreakerViolation("ORDER REJECTED: Symbol is locked at LIMIT DOWN. Cannot SELL.")

        return True
