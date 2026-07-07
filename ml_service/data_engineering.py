import numpy as np
import pandas as pd

def calculate_obi(bids, asks):
    """
    Calculate Order Book Imbalance (OBI).
    bids: list of dicts/tuples containing price and quantity, or a 2D array
    asks: list of dicts/tuples containing price and quantity, or a 2D array
    """
    if not bids or not asks:
        return 0.0
    
    # Get best bid and ask quantities
    v_bid = bids[0]['quantity'] if isinstance(bids[0], dict) else bids[0][1]
    v_ask = asks[0]['quantity'] if isinstance(asks[0], dict) else asks[0][1]
    
    denom = v_bid + v_ask
    if denom == 0:
        return 0.0
    return (v_bid - v_ask) / denom

def calculate_obi_multi_level(bids, asks, levels=5):
    """
    Calculate multi-level weighted Order Book Imbalance.
    Higher priority (more weight) is given to the levels closer to the spread.
    """
    if not bids or not asks:
        return 0.0
    
    levels = min(levels, len(bids), len(asks))
    if levels == 0:
        return 0.0
    
    bid_qty_sum = 0
    ask_qty_sum = 0
    
    # Linear weight decay: 1.0, 0.8, 0.6, 0.4, 0.2 ...
    for i in range(levels):
        weight = 1.0 - (i * (1.0 / levels))
        
        bid_qty = bids[i]['quantity'] if isinstance(bids[i], dict) else bids[i][1]
        ask_qty = asks[i]['quantity'] if isinstance(asks[i], dict) else asks[i][1]
        
        bid_qty_sum += bid_qty * weight
        ask_qty_sum += ask_qty * weight
        
    denom = bid_qty_sum + ask_qty_sum
    if denom == 0:
        return 0.0
    
    return (bid_qty_sum - ask_qty_sum) / denom

def rolling_zscore(series, window=100):
    """
    Calculate rolling Z-score to normalize time series features without Look-ahead Bias.
    """
    s = pd.Series(series)
    rolling_mean = s.rolling(window=window, min_periods=1).mean()
    rolling_std = s.rolling(window=window, min_periods=1).std().fillna(1e-8)
    z_scores = (s - rolling_mean) / rolling_std
    return z_scores.fillna(0.0).tolist()
