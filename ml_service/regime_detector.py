"""Hidden-Markov volatility regime detection."""

import numpy as np
from hmmlearn import hmm


class MarketRegimeDetector:
    def __init__(self, n_components=3, covariance_type="full", random_state=42):
        if n_components != 3:
            raise ValueError("MarketRegimeDetector currently requires exactly three components")
        self.n_components = n_components
        self.model = hmm.GaussianHMM(
            n_components=n_components,
            covariance_type=covariance_type,
            n_iter=200,
            random_state=random_state,
        )
        self.is_fitted = False
        self.uses_fallback = False
        self.low_vol_state = 0
        self.medium_vol_state = 1
        self.high_vol_state = 2

    def prepare_features(self, prices):
        prices = np.asarray(prices, dtype=np.float64)
        if prices.ndim != 1 or not np.isfinite(prices).all() or np.any(prices <= 0):
            raise ValueError("prices must be a one-dimensional sequence of positive finite values")
        if len(prices) < 2:
            return np.zeros((1, 2), dtype=np.float64)

        returns = np.diff(np.log(prices))
        volatility = np.array(
            [np.std(returns[max(0, index - 9) : index + 1]) for index in range(len(returns))],
            dtype=np.float64,
        )
        volatility = np.maximum(volatility, np.finfo(np.float64).eps)
        return np.column_stack((returns, volatility))

    def fit(self, prices):
        prices = np.asarray(prices, dtype=np.float64)
        self.prepare_features(prices)  # validates even when the fallback is used
        if len(prices) < 15:
            self.is_fitted = True
            self.uses_fallback = True
            return self

        features = self.prepare_features(prices)
        self.model.fit(features)
        self.is_fitted = True
        self.uses_fallback = False

        # The second observed feature is rolling volatility. Ordering states by
        # its learned mean is more direct than ordering covariance uncertainty.
        volatility_means = self.model.means_[:, 1]
        ordered_states = np.argsort(volatility_means)
        self.low_vol_state = int(ordered_states[0])
        self.medium_vol_state = int(ordered_states[1])
        self.high_vol_state = int(ordered_states[2])
        return self

    def predict_regime(self, prices):
        if not self.is_fitted:
            raise ValueError("Model is not fitted yet.")
        prices = np.asarray(prices, dtype=np.float64)
        self.prepare_features(prices)
        if len(prices) < 3 or self.uses_fallback:
            return [1] * len(prices)

        states = self.model.predict(self.prepare_features(prices))
        state_mapping = {
            self.low_vol_state: 0,
            self.medium_vol_state: 1,
            self.high_vol_state: 2,
        }
        mapped_states = [state_mapping[int(state)] for state in states]
        return [mapped_states[0], *mapped_states]

    def predict_current_regime(self, prices):
        mapped = self.predict_regime(prices)
        return mapped[-1] if mapped else 1
