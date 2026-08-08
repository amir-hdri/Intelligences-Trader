import numpy as np
import torch
import torch.nn.functional as F
import torch.optim as optim
from environment import TradingEnvironment
from regime_detector import MarketRegimeDetector
from models import ActorCritic
from data_engineering import calculate_obi

def generate_synthetic_data(n_steps=1000):
    """
    Generate synthetic stock prices and order book data for training.
    """
    np.random.seed(42)
    # Merton Jump Diffusion style parameters
    dt = 1.0
    mu = 0.0001
    sigma = 0.01
    lambda_jump = 0.05
    mu_jump = -0.02
    sigma_jump = 0.05
    
    prices = [100.0]
    for _ in range(n_steps - 1):
        price = prices[-1]
        # Standard Brownian Motion component
        bm = np.random.normal(0, 1)
        # Poisson Jump component
        jump = 0
        if np.random.random() < lambda_jump:
            jump = np.random.normal(mu_jump, sigma_jump)
        
        # Next price calculation
        new_price = price * np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * bm + jump)
        prices.append(new_price)
        
    prices = np.array(prices)
    
    # Generate mock L2 order book data to compute OBI
    market_data = []
    for i, price in enumerate(prices):
        # Generate random bids and asks around the price
        bids = [{'price': price - 0.1 * k, 'quantity': np.random.randint(10, 100)} for k in range(1, 6)]
        asks = [{'price': price + 0.1 * k, 'quantity': np.random.randint(10, 100)} for k in range(1, 6)]
        
        obi = calculate_obi(bids, asks)
        
        market_data.append({
            'price': price,
            'bids': bids,
            'asks': asks,
            'obi': obi,
            'time_to_expiry': 1.0 - (i / n_steps)
        })
        
    return prices, market_data

def train_ppo(epochs=5, batch_size=32, lr=3e-4):
    if epochs < 1 or batch_size < 1 or lr <= 0:
        raise ValueError("epochs, batch_size, and learning rate must be positive")
    np.random.seed(42)
    torch.manual_seed(42)
    print("Generating synthetic market data...")
    prices, raw_market_data = generate_synthetic_data(1000)
    
    print("Fitting Hidden Markov Model (HMM) regime detector...")
    detector = MarketRegimeDetector(n_components=3)
    detector.fit(prices)
    regimes = detector.predict_regime(prices)
    
    # Add regime to market data
    for i in range(len(raw_market_data)):
        raw_market_data[i]['regime'] = regimes[i]
        
    # Initialize Environment
    env = TradingEnvironment(raw_market_data)
    
    # PPO Agent parameters
    state_dim = 5
    seq_len = 30
    agent = ActorCritic(state_dim=state_dim, seq_len=seq_len)
    optimizer = optim.Adam(agent.parameters(), lr=lr)
    
    print("Starting PPO Training loop...")
    for epoch in range(epochs):
        state, info = env.reset()
        
        # Buffer for sequence states
        state_buffer = []
        for _ in range(seq_len):
            state_buffer.append(state)
            
        states = []
        actions = []
        rewards = []
        log_probs = []
        values = []
        dones = []
        
        episode_reward = 0.0
        
        while not env.done:
            # Current sequence state shape: [seq_len, state_dim]
            seq_state = np.array(state_buffer[-seq_len:])
            
            # Sample action from model
            action, log_prob, val = agent.act(seq_state)
            
            # Step in environment
            next_state, reward, done, _, info = env.step(action)
            
            # Append to buffer
            state_buffer.append(next_state)
            
            # Store transition
            states.append(seq_state)
            actions.append(action)
            rewards.append(reward)
            log_probs.append(log_prob)
            values.append(val)
            dones.append(done)
            
            episode_reward += reward
            
            if done:
                break
                
        # Convert lists to PyTorch Tensors
        states_t = torch.FloatTensor(np.array(states))        # [T, SeqLen, Features]
        actions_t = torch.FloatTensor(np.array(actions))      # [T, 2]
        rewards_t = torch.FloatTensor(np.array(rewards))      # [T]
        log_probs_t = torch.FloatTensor(np.array(log_probs))  # [T]
        values_t = torch.FloatTensor(np.array(values))        # [T]
        dones_t = torch.FloatTensor(np.array(dones))          # [T]
        
        # Generalized Advantage Estimation (GAE-lambda)
        advantages = np.zeros(len(rewards), dtype=np.float32)
        gae = 0.0
        gamma = 0.99
        gae_lambda = 0.95
        for t in reversed(range(len(rewards))):
            not_done = 0.0 if dones[t] else 1.0
            next_value = values[t + 1] if t + 1 < len(values) else 0.0
            delta = rewards[t] + gamma * next_value * not_done - values[t]
            gae = delta + gamma * gae_lambda * not_done * gae
            advantages[t] = gae

        advantages_t = torch.from_numpy(advantages)
        returns_t = advantages_t + values_t

        # Normalize advantages without the single-sample unbiased-std NaN edge case.
        advantages_t = (advantages_t - advantages_t.mean()) / (advantages_t.std(unbiased=False) + 1e-8)
        
        # PPO Update step
        for i in range(0, len(states), batch_size):
            end = i + batch_size
            batch_states = states_t[i:end]
            batch_actions = actions_t[i:end]
            batch_advantages = advantages_t[i:end]
            batch_returns = returns_t[i:end]
            batch_old_log_probs = log_probs_t[i:end]
            
            # Evaluate new policy
            # batch_actions: [B, 2] -> index 0 is dir, index 1 is size
            dir_act = batch_actions[:, 0].long()
            size_act = batch_actions[:, 1]
            
            new_values, new_log_probs, entropy = agent.evaluate(batch_states, dir_act, size_act)
            
            # Calculate ratios
            ratios = torch.exp(new_log_probs - batch_old_log_probs)
            
            # PPO clip loss
            surr1 = ratios * batch_advantages
            surr2 = torch.clamp(ratios, 1.0 - 0.2, 1.0 + 0.2) * batch_advantages
            actor_loss = -torch.min(surr1, surr2).mean()
            
            # Critic loss (MSE)
            critic_loss = F.mse_loss(new_values.squeeze(-1), batch_returns)
            
            # Total PPO loss
            loss = actor_loss + 0.5 * critic_loss - 0.01 * entropy.mean()
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
        print(f"Epoch {epoch+1}/{epochs} completed. Episode Reward: {episode_reward:.4f}, Final Balance: {info['balance']:.2f}")

    # Export to ONNX
    onnx_path = "market_model.onnx"
    print(f"Training complete. Exporting model to {onnx_path}...")
    agent.export_to_onnx(onnx_path)
    print("ONNX model exported successfully.")

if __name__ == "__main__":
    train_ppo()
