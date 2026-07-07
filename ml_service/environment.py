import gymnasium as gym
from gymnasium import spaces
import numpy as np

class TradingEnvironment(gym.Env):
    """
    State-of-the-art Gymnasium Environment for algorithmic trading on the Tehran Stock Exchange / IME.
    Implements dynamic margin management and Moody & Saffell's Differential Sharpe Ratio (DSR) reward.
    """
    metadata = {'render_modes': ['human']}
    
    def __init__(self, market_data, initial_balance=10000000.0, transaction_fee=0.001, eta=0.02):
        super(TradingEnvironment, self).__init__()
        
        # market_data must be a list of dictionaries, each containing:
        # 'price', 'volume', 'regime' (0, 1, 2), 'obi', 'time_to_expiry'
        self.market_data = market_data
        self.initial_balance = initial_balance
        self.transaction_fee = transaction_fee
        self.eta = eta  # Exponential smoothing parameter for DSR
        
        # Action space: Autoregressive:
        # action[0]: Direction (Continuous mapping to 3 discrete states: <-0.33: SHORT, >0.33: LONG, else HOLD)
        # action[1]: Position size (Continuous value in [0, 1], representing capital fraction)
        self.action_space = spaces.Box(
            low=np.array([-1.0, 0.0]), 
            high=np.array([1.0, 1.0]), 
            dtype=np.float32
        )
        
        # State: [Volatility Regime, Drawdown, Last Return, Current Position, OBI]
        self.observation_space = spaces.Box(
            low=np.array([0.0, 0.0, -1.0, -1.0, -1.0]), 
            high=np.array([2.0, 1.0, 1.0, 1.0, 1.0]), 
            dtype=np.float32
        )
        
        # Margin Management settings
        self.initial_margin_req = 0.15      # 15% initial margin
        self.maintenance_margin_req = 0.10  # 10% maintenance margin
        self.margin_call_penalty = -10.0    # Heavy reward penalty on margin calls
        
        self.reset()

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        
        self.balance = self.initial_balance
        self.peak_balance = self.initial_balance
        self.current_step = 0
        self.position = 0.0  # -1.0 (max short), 0.0 (flat), 1.0 (max long)
        self.done = False
        
        # DSR state variables
        self.A = 0.0  # Running mean of returns
        self.B = 0.0  # Running variance-like term
        
        state = self._get_observation()
        info = self._get_info()
        
        return state, info

    def _get_observation(self):
        step_data = self.market_data[self.current_step]
        
        # Calculate drawdown
        drawdown = (self.peak_balance - self.balance) / self.peak_balance
        drawdown = np.clip(drawdown, 0.0, 1.0)
        
        # Calculate last return
        if self.current_step > 0:
            last_price = self.market_data[self.current_step - 1]['price']
            current_price = step_data['price']
            last_return = (current_price - last_price) / last_price
        else:
            last_return = 0.0
            
        regime = float(step_data.get('regime', 1))
        obi = float(step_data.get('obi', 0.0))
        
        return np.array([regime, drawdown, last_return, self.position, OBI_value_rescale(obi)], dtype=np.float32)

    def _get_info(self):
        return {
            'balance': self.balance,
            'position': self.position,
            'peak_balance': self.peak_balance,
            'step': self.current_step
        }

    def step(self, action):
        # Decode action
        dir_val, size_val = action[0], action[1]
        
        # Map direction value to discrete state
        if dir_val < -0.33:
            target_position = -size_val  # SHORT
        elif dir_val > 0.33:
            target_position = size_val   # LONG
        else:
            target_position = 0.0        # HOLD
            
        current_price = self.market_data[self.current_step]['price']
        next_price = self.market_data[self.current_step + 1]['price']
        price_return = (next_price - current_price) / current_price
        
        # Position transaction cost
        position_change = abs(target_position - self.position)
        tx_cost = self.balance * position_change * self.transaction_fee
        
        # Net Return calculation
        gross_return = self.position * price_return
        net_profit = self.balance * gross_return - tx_cost
        
        # Apply balance change
        self.balance += net_profit
        self.peak_balance = max(self.peak_balance, self.balance)
        
        # Margin Management checks
        margin_call_triggered = False
        if target_position != 0.0:
            contract_value = self.balance * abs(target_position)
            initial_margin = contract_value * self.initial_margin_req
            maintenance_margin = contract_value * self.maintenance_margin_req
            
            # If our free balance drops below maintenance requirement
            free_balance = self.balance - initial_margin
            if free_balance < maintenance_margin:
                margin_call_triggered = True
                # Penalize and auto-liquidate position
                self.balance -= initial_margin * 0.1  # Liquidation penalty fee
                target_position = 0.0
        
        self.position = target_position
        self.current_step += 1
        
        # Calculate step return for DSR
        step_return = net_profit / self.initial_balance
        
        # DSR Reward Calculation
        # A_t = A_{t-1} + eta * (R_t - A_{t-1})
        # B_t = B_{t-1} + eta * (R_t^2 - B_{t-1})
        # DSR = (B_{t-1} * delta_A_t - 0.5 * A_{t-1} * delta_B_t) / (B_{t-1} - A_{t-1}^2)^(1.5)
        delta_A = step_return - self.A
        delta_B = (step_return ** 2) - self.B
        
        denominator = (self.B - (self.A ** 2)) ** 1.5
        if denominator > 1e-8:
            reward = (self.B * delta_A - 0.5 * self.A * delta_B) / denominator
        else:
            reward = step_return
            
        # Update DSR moving averages
        self.A += self.eta * delta_A
        self.B += self.eta * delta_B
        
        # Inject margin call penalty
        if margin_call_triggered:
            reward += self.margin_call_penalty
            
        # Check termination
        if self.current_step >= len(self.market_data) - 1 or self.balance <= 0:
            self.done = True
            
        observation = self._get_observation()
        info = self._get_info()
        
        return observation, float(reward), self.done, False, info

def OBI_value_rescale(val):
    return np.clip(val, -1.0, 1.0)
