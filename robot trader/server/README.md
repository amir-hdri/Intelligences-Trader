# AI & Quant Analysis Backend

The core intelligence layer of the Intelligences-Trader ecosystem, powered by **TensorFlow.js**, **ONNX Runtime**, and **Node.js**.

---

## 🧠 Model Architectures

### 1. **Temporal Convolutional Network (TCN)**
- **Purpose:** Time-series classification for identifying trend direction and market regimes.
- **Optimizations:** 
  - **Focal Loss:** Addresses class imbalance in financial datasets by down-weighting easy examples and focusing on hard, rare signals.
  - **ECE Calibration:** Real-time Expected Calibration Error monitoring to ensure predicted probabilities reflect true likelihoods.

### 2. **PPO Reinforcement Learning Agent**
- **Purpose:** Continuous action space control for optimal position sizing (Kelly Criterion simulation).
- **Key Feature:** **Entropy Bonus** integration to prevent policy collapse and ensure the agent continues exploring multi-modal strategies in volatile markets.

### 3. **Hierarchical Ensemble Engine**
- **Architecture:** Uses a **Meta-Learner** approach to fuse signals from TCN, LSTM, XGBoost, and Rule-based engines.
- **Fusing Logic:** **Softmax Attention** mechanism with dynamic temperature scaling based on the variance of base-model performances.

---

## 📡 Advanced Frameworks

### **Federated Learning (FedAvg)**
Simulates decentralized intelligence where multiple trading nodes (Clients A-E) train local models and securely aggregate weights.
- **Privacy:** Implements Gaussian Differential Privacy to protect local data footprints.
- **Optimization:** Momentum-based client updates for faster convergence in non-IID financial data environments.

### **Explainable AI (XAI)**
Provides mathematical justification for every neural signal.
- **SHAP:** Calculates feature importance by ensuring the sum of attributions equals the total prediction delta from the base value.
- **LIME:** Generates local linear surrogate models to interpret complex non-linear decision boundaries.

---

## 📈 Optimization & MLOps

### **HPO (Hyperparameter Optimization)**
- Implements a simulated **TPE (Tree-structured Parzen Estimator)** to find optimal ATR multipliers, RSI thresholds, and neural weights.

### **Drift & Retraining**
- **Entropy Monitoring:** Detects "Concept Drift" when prediction uncertainty crosses an EMA-smoothed threshold.
- **Auto-Retrain Sequencer:** An asynchronous pipeline that prepares fresh datasets and updates the global model without system downtime.

---

## 🛠 Usage & Testing

```bash
# Start the AI backend
npm start

# Run comprehensive AI test suite
npm test
```
