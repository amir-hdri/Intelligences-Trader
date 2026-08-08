import pytest
import numpy as np
from data_engineering import calculate_obi, calculate_obi_multi_level, rolling_zscore
from regime_detector import MarketRegimeDetector
from environment import TradingEnvironment
from circuit_breaker import CircuitBreaker, CircuitBreakerViolation

def test_obi_calculation():
    # Simple L2 mock book
    bids = [{'price': 100, 'quantity': 50}]
    asks = [{'price': 101, 'quantity': 150}]
    
    # OBI should be (50 - 150) / 200 = -0.5
    obi = calculate_obi(bids, asks)
    assert abs(obi - (-0.5)) < 1e-6
    
    # Test multi-level OBI
    bids_multi = [
        {'price': 100, 'quantity': 50},  # weight 1.0
        {'price': 99, 'quantity': 40}    # weight 0.5
    ]
    asks_multi = [
        {'price': 101, 'quantity': 150}, # weight 1.0
        {'price': 102, 'quantity': 100}  # weight 0.5
    ]
    
    # bid_qty_sum = 50 * 1.0 + 40 * 0.5 = 70
    # ask_qty_sum = 150 * 1.0 + 100 * 0.5 = 200
    # expected OBI = (70 - 200) / 270 = -130 / 270 = -0.48148
    obi_multi = calculate_obi_multi_level(bids_multi, asks_multi, levels=2)
    assert abs(obi_multi - (-130.0 / 270.0)) < 1e-5

def test_rolling_normalization():
    data = [10, 12, 11, 13, 12, 14, 15]
    z = rolling_zscore(data, window=5)
    assert len(z) == len(data)
    assert not any(np.isnan(val) for val in z)
    assert rolling_zscore([5, 5, 5], window=3) == [0.0, 0.0, 0.0]

    with pytest.raises(ValueError, match="positive integer"):
        rolling_zscore(data, window=0)


def test_obi_rejects_invalid_quantities():
    with pytest.raises(ValueError, match="non-negative"):
        calculate_obi([{"price": 100, "quantity": -1}], [{"price": 101, "quantity": 1}])

def test_hmm_regime_classification():
    prices = [100.0, 101.0, 100.5, 99.0, 98.0, 99.5, 101.0, 103.0, 104.0, 102.5, 101.0, 100.0, 101.5, 103.0, 102.0, 101.0]
    detector = MarketRegimeDetector(n_components=3)
    detector.fit(prices)

    assert detector.is_fitted
    regime = detector.predict_current_regime(prices)
    assert regime in [0, 1, 2]

    short_history_detector = MarketRegimeDetector().fit([100.0, 101.0, 100.5])
    assert short_history_detector.predict_regime([100.0, 101.0, 100.5]) == [1, 1, 1]

def test_trading_environment():
    # Construct small mock dataset
    market_data = []
    for k in range(50):
        market_data.append({
            'price': 100.0 + k * 0.1,
            'regime': 1,
            'obi': 0.1 * (k % 3 - 1),
            'time_to_expiry': 1.0 - (k / 50)
        })
        
    env = TradingEnvironment(market_data)
    state, info = env.reset()
    
    # Observation: [Regime, Drawdown, LastReturn, CurrentPosition, OBI]
    assert len(state) == 5
    assert state[0] == 1.0  # Regime
    assert state[1] == 0.0  # Initial Drawdown
    
    # Step into environment: Buy (direction class = 2, size = 0.5)
    next_state, reward, done, truncated, info = env.step(np.array([2.0, 0.5], dtype=np.float32))
    assert len(next_state) == 5
    assert not done
    assert info['balance'] > 0

def test_safety_circuit_breaker():
    # Initialize CircuitBreaker: starting balance 1,000,000, 3% daily drawdown threshold
    cb = CircuitBreaker(initial_equity=1000000.0, max_daily_drawdown_pct=0.03, max_position_pct=0.20)
    
    # Check regular order validation
    assert cb.validate_order(direction=2, size=0.10)  # BUY 10% is allowed
    assert cb.validate_order(direction=1, size=0.0)   # HOLD is a zero-size no-op
    with pytest.raises(CircuitBreakerViolation, match="HOLD orders"):
        cb.validate_order(direction=1, size=0.10)

    # Check position limit violation
    with pytest.raises(CircuitBreakerViolation, match="exceeds maximum limit"):
        cb.validate_order(direction=2, size=0.25)  # BUY 25% exceeds 20% limit
        
    # Check limit up/down rules
    symbol_info = {'last_price': 1000, 'limit_up': 1000, 'limit_down': 900}
    with pytest.raises(CircuitBreakerViolation, match="locked at LIMIT UP"):
        cb.validate_order(direction=2, size=0.10, symbol_info=symbol_info)
        
    # Check drawdown circuit breaker trigger
    cb.update_equity(980000.0)  # 2% drawdown, allowed
    
    with pytest.raises(CircuitBreakerViolation, match="Daily drawdown limit breached"):
        cb.update_equity(965000.0)  # 3.5% drawdown, should trigger HALT
        
    # Validation should now fail because system is halted
    assert cb.is_halted
    with pytest.raises(CircuitBreakerViolation, match="System is in HALT mode"):
        cb.validate_order(direction=2, size=0.05)
