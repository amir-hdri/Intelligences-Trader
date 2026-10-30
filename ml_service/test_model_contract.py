"""Contract tests for the ONNX artifacts this repository ships.

Two different models live under the same file name:

* ``ml_service/market_model.onnx`` is the PPO/TCN research artifact of this
  service — one input, five features per step, two outputs.
* ``robot trader/server/models/market_model.onnx`` is the serving artifact of
  the Node layer — one input, ten features per step, one output.

The Python pipeline only reproduces the first one, so the divergence is pinned
here: a swapped, retrained or renamed artifact fails the suite instead of
silently drifting.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import onnxruntime as ort

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
PYTHON_ARTIFACT = HERE / "market_model.onnx"
NODE_ARTIFACT = REPO_ROOT / "robot trader" / "server" / "models" / "market_model.onnx"

PYTHON_ARTIFACT_SHA256 = "9ec9c786a5441663c9c6aeaaebbddd833211bf44ad9d46e8c194ce3ebfac6c91"
NODE_ARTIFACT_SHA256 = "3a4f512cade7c39b73d54325650fca29bfb6cd28ea36f2f19ac9eb985391c006"


def _session(artifact: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(artifact), providers=["CPUExecutionProvider"])


def _sha256(artifact: Path) -> str:
    return hashlib.sha256(artifact.read_bytes()).hexdigest()


def test_python_artifact_declares_the_ppo_tcn_signature():
    session = _session(PYTHON_ARTIFACT)
    inputs = session.get_inputs()
    assert len(inputs) == 1
    assert inputs[0].name == "input"
    assert inputs[0].shape == ["batch_size", 30, 5]
    outputs = {output.name: output.shape for output in session.get_outputs()}
    assert outputs == {
        "dir_probabilities": ["batch_size", 3],
        "expected_position_size": ["batch_size", 1],
    }


def test_node_artifact_declares_the_serving_signature():
    session = _session(NODE_ARTIFACT)
    inputs = session.get_inputs()
    assert len(inputs) == 1
    assert inputs[0].name == "input"
    assert inputs[0].shape == ["batch_size", 30, 10]
    outputs = {output.name: output.shape for output in session.get_outputs()}
    assert outputs == {"output": [1, 3]}


def test_the_two_artifacts_are_distinct_files():
    assert _sha256(PYTHON_ARTIFACT) == PYTHON_ARTIFACT_SHA256
    assert _sha256(NODE_ARTIFACT) == NODE_ARTIFACT_SHA256
    assert _sha256(PYTHON_ARTIFACT) != _sha256(NODE_ARTIFACT)


def test_ml_service_entry_point_does_not_claim_the_node_serving_artifact():
    raw = (HERE / "main.py").read_text(encoding="utf-8")
    docstring = " ".join(raw.split()).lower()
    assert "five features" in docstring
    assert "two outputs" in docstring
    assert "for the node serving layer" not in docstring
