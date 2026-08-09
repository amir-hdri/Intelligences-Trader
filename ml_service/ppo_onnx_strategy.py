"""Point-in-time adapter for the repository's pretrained PPO/TCN ONNX policy.

The exported model contract is documented in ``models.py``:

* input: ``[batch, 30, 5]``
* direction classes: ``0=short, 1=hold, 2=long``
* expected position size: a fraction in ``[0, 1]``

Historical OHLCV does not contain an L2 order book, so the fifth feature (OBI)
is set to the neutral value zero.  Every other feature is calculated causally;
appending future bars cannot alter an earlier model input or prediction.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional, Union

import numpy as np
import pandas as pd

_PathLike = Union[str, Path]


class PPOONNXStrategy:
    """Use a pretrained PPO/TCN ONNX policy as a StrategyEngine strategy.

    Parameters
    ----------
    model_path:
        Path to ``market_model.onnx``.  External tensor data (the companion
        ``.onnx.data`` file) must remain next to the model.
    min_position_size:
        Predictions below this expected size are treated as hold signals.
    session:
        Optional ONNX Runtime-compatible session, primarily for unit tests.
    """

    def __init__(
        self,
        model_path: _PathLike,
        min_position_size: float = 0.05,
        session: Optional[Any] = None,
    ) -> None:
        self.model_path = Path(model_path).expanduser().resolve()
        if not np.isfinite(min_position_size) or not 0.0 <= min_position_size <= 1.0:
            raise ValueError("min_position_size must be in [0, 1]")
        self.min_position_size = float(min_position_size)
        self.session = session if session is not None else self._create_session()

        inputs = self.session.get_inputs()
        outputs = self.session.get_outputs()
        if len(inputs) != 1 or len(outputs) < 2:
            raise ValueError("PPO/TCN ONNX model must expose one input and two outputs")
        self.input_name = inputs[0].name
        self.output_names = [output.name for output in outputs]
        shape = inputs[0].shape
        if len(shape) != 3:
            raise ValueError("PPO/TCN ONNX input must have [batch, sequence, features] shape")
        try:
            self.sequence_length = int(shape[1])
            self.feature_count = int(shape[2])
        except (TypeError, ValueError) as exc:
            raise ValueError("PPO/TCN sequence and feature dimensions must be fixed") from exc
        if self.feature_count != 5:
            raise ValueError("PPO/TCN model must consume exactly five state features")

        self.last_inference_summary: Dict[str, Any] = {}

    def _create_session(self) -> Any:
        if not self.model_path.is_file():
            raise FileNotFoundError(f"ONNX model not found: {self.model_path}")
        try:
            import onnxruntime as ort
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise ImportError(
                "onnxruntime is required for PPO/TCN backtests; install the ML service dependencies"
            ) from exc
        return ort.InferenceSession(
            str(self.model_path),
            providers=["CPUExecutionProvider"],
        )

    @staticmethod
    def _validate_data(data: Any) -> pd.DataFrame:
        if not isinstance(data, pd.DataFrame):
            raise ValueError("data must be a pandas.DataFrame")
        missing = [column for column in ("open", "close") if column not in data.columns]
        if missing:
            raise ValueError(f"data is missing required columns: {missing}")
        if data.empty:
            raise ValueError("data must contain at least one row")
        close = pd.to_numeric(data["close"], errors="coerce")
        open_ = pd.to_numeric(data["open"], errors="coerce")
        if (
            close.isna().any()
            or open_.isna().any()
            or not np.isfinite(close.to_numpy()).all()
            or not np.isfinite(open_.to_numpy()).all()
            or (close <= 0).any()
            or (open_ <= 0).any()
        ):
            raise ValueError("open and close must contain positive finite prices")
        return data

    @staticmethod
    def _causal_market_features(close: pd.Series) -> np.ndarray:
        """Build regime, drawdown and return without future observations."""

        close = close.astype(float)
        returns = close.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0)
        volatility = returns.rolling(20, min_periods=2).std(ddof=0).fillna(0.0)

        # Expanding quantiles use only observations available at each bar.  The
        # initial window remains the model's neutral regime (1).
        lower = volatility.expanding(min_periods=20).quantile(1.0 / 3.0)
        upper = volatility.expanding(min_periods=20).quantile(2.0 / 3.0)
        regime = pd.Series(1.0, index=close.index)
        established = lower.notna() & upper.notna()
        regime.loc[established & (volatility <= lower)] = 0.0
        regime.loc[established & (volatility >= upper)] = 2.0

        running_peak = close.cummax()
        drawdown = ((running_peak - close) / running_peak).clip(lower=0.0, upper=1.0)
        clipped_return = returns.clip(lower=-1.0, upper=1.0)
        return np.column_stack(
            (
                regime.to_numpy(dtype=np.float32),
                drawdown.to_numpy(dtype=np.float32),
                clipped_return.to_numpy(dtype=np.float32),
            )
        )

    def generate_signal(self, data: pd.DataFrame) -> pd.DataFrame:
        """Return causal model signals compatible with ``StrategyEngine``.

        Signal generation happens at each bar close.  ``next_open`` shifts the
        actual fill to the next bar.  The model's expected position size is
        preserved in ``size`` and consumed by ``simulate_orders``.
        """

        data = self._validate_data(data)
        close = pd.to_numeric(data["close"], errors="raise").astype(float)
        open_ = pd.to_numeric(data["open"], errors="raise").astype(float)
        market_features = self._causal_market_features(close)
        row_count = len(data)

        signals = np.zeros(row_count, dtype=np.int8)
        sizes = np.zeros(row_count, dtype=np.float32)
        probabilities = np.full((row_count, 3), np.nan, dtype=np.float32)
        # State feature four follows the model/environment contract and records
        # the previous target position.  OBI is neutral because OHLCV has no L2.
        positions = np.zeros(row_count, dtype=np.float32)
        current_position = 0.0
        class_counts = np.zeros(3, dtype=np.int64)

        for index in range(self.sequence_length - 1, row_count):
            positions[index] = current_position
            start = index - self.sequence_length + 1
            sequence = np.zeros((self.sequence_length, 5), dtype=np.float32)
            sequence[:, :3] = market_features[start : index + 1]
            sequence[:, 3] = positions[start : index + 1]
            # sequence[:, 4] intentionally remains neutral OBI=0.

            output = self.session.run(
                self.output_names,
                {self.input_name: sequence[np.newaxis, ...]},
            )
            direction_probabilities = np.asarray(output[0], dtype=np.float32).reshape(-1)
            expected_size = float(np.asarray(output[1], dtype=np.float32).reshape(-1)[0])
            if direction_probabilities.size != 3 or not np.isfinite(direction_probabilities).all():
                raise ValueError("PPO/TCN direction output must contain three finite probabilities")
            if not np.isfinite(expected_size):
                raise ValueError("PPO/TCN position-size output must be finite")

            expected_size = float(np.clip(expected_size, 0.0, 1.0))
            direction_class = int(np.argmax(direction_probabilities))
            class_counts[direction_class] += 1
            signal = (-1, 0, 1)[direction_class]
            if expected_size < self.min_position_size:
                signal = 0
                expected_size = 0.0

            probabilities[index] = direction_probabilities
            signals[index] = signal
            sizes[index] = expected_size
            if direction_class == 0 and expected_size > 0.0:
                current_position = -expected_size
            elif direction_class == 2 and expected_size > 0.0:
                current_position = expected_size
            if index + 1 < row_count:
                positions[index + 1] = current_position

        inferred = row_count - self.sequence_length + 1
        self.last_inference_summary = {
            "bars": row_count,
            "inference_bars": max(inferred, 0),
            "warmup_bars": min(self.sequence_length - 1, row_count),
            "sequence_length": self.sequence_length,
            "obi_assumption": "neutral_zero_no_l2_data",
            "short_signals": int(class_counts[0]),
            "hold_signals": int(class_counts[1]),
            "long_signals": int(class_counts[2]),
        }

        return pd.DataFrame(
            {
                "signal": signals,
                "size": sizes,
                "price": close,
                "next_open": open_.shift(-1),
                "prob_short": probabilities[:, 0],
                "prob_hold": probabilities[:, 1],
                "prob_long": probabilities[:, 2],
            },
            index=data.index,
        )


__all__ = ["PPOONNXStrategy"]
