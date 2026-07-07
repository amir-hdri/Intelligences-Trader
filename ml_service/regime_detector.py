import numpy as np
from hmmlearn import hmm

class MarketRegimeDetector:
    def __init__(self, n_components=3, covariance_type="full", random_state=42):
        self.n_components = n_components
        self.model = hmm.GaussianHMM(
            n_components=n_components, 
            covariance_type=covariance_type, 
            n_iter=100, 
            random_state=random_state
        )
        self.is_fitted = False
        self.low_vol_state = 0
        self.medium_vol_state = 1
        self.high_vol_state = 2

    def prepare_features(self, prices):
        """
        Extract log returns and rolling volatility features.
        """
        prices = np.array(prices)
        if len(prices) < 2:
            return np.zeros((1, 2))
            
        returns = np.diff(np.log(prices))
        
        # Calculate rolling volatility (window = 10)
        volatility = []
        for i in range(len(returns)):
            start = max(0, i - 9)
            volatility.append(np.std(returns[start:i+1]))
        volatility = np.array(volatility)
        
        # Replace zero standard deviation with a tiny value
        volatility[volatility == 0] = 1e-8
        
        # Stack returns and volatility
        features = np.column_stack((returns, volatility))
        return features

    def fit(self, prices):
        """
        Fit the Gaussian HMM on historical prices.
        """
        if len(prices) < 15:
            # Not enough data to fit, use default state mapping
            self.is_fitted = True
            return
            
        features = self.prepare_features(prices)
        self.model.fit(features)
        self.is_fitted = True
        
        # Sort states by volatility variance to map to standardized regimes:
        # Low Volatility (Range) -> Medium Volatility -> High Volatility (Shock)
        covars = self.model.covars_
        
        # Volatility is the second feature (index 1)
        vol_variances = []
        for c in covars:
            if c.ndim == 2:
                vol_variances.append(c[1, 1])
            else:
                vol_variances.append(c[1])  # diagonal covars
                
        vol_idx = np.argsort(vol_variances)
        
        self.low_vol_state = vol_idx[0]
        self.medium_vol_state = vol_idx[1]
        self.high_vol_state = vol_idx[2]

    def predict_regime(self, prices):
        """
        Predict states for the price series and map to [0, 1, 2].
        """
        if not self.is_fitted:
            raise ValueError("Model is not fitted yet.")
            
        if len(prices) < 3:
            return [1] * len(prices)
            
        features = self.prepare_features(prices)
        states = self.model.predict(features)
        
        # Map states to 0 (Low Vol), 1 (Medium Vol), 2 (High Vol)
        mapped_states = []
        for s in states:
            if s == self.low_vol_state:
                mapped_states.append(0)
            elif s == self.medium_vol_state:
                mapped_states.append(1)
            else:
                mapped_states.append(2)
                
        # Pad the first element (which diff removed) to preserve array size
        return [mapped_states[0]] + mapped_states

    def predict_current_regime(self, prices):
        """
        Get the regime classification for the latest price point.
        """
        mapped = self.predict_regime(prices)
        return mapped[-1] if mapped else 1
