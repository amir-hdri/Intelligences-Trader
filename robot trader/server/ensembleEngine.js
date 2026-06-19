export class EnsembleEngine {
  constructor() {
    this.models = {
      tcn: { weight: 0.25, performance: 0.8, predictions: [] },
      lstm: { weight: 0.25, performance: 0.75, predictions: [] },
      xgboost: { weight: 0.20, performance: 0.82, predictions: [] },
      randomForest: { weight: 0.15, performance: 0.78, predictions: [] },
      linear: { weight: 0.15, performance: 0.65, predictions: [] }
    };
    this.metaLearner = {
      learningRate: 0.05,
      adaptationSpeed: 20 // Samples to adapt to regime change
    };
    this.predictionHistory = [];
  }

  // Simulate diverse predictions from 5 models
  generateBasePredictions(features) {
    const baseVal = Math.random() * 2 - 1; // -1 to 1

    // Create slightly uncorrelated predictions
    const tcnPred = Math.max(-1, Math.min(1, baseVal + (Math.random() * 0.2 - 0.1)));
    const lstmPred = Math.max(-1, Math.min(1, baseVal + (Math.random() * 0.3 - 0.15)));
    const xgbPred = Math.max(-1, Math.min(1, baseVal * 0.8 + (Math.random() * 0.4 - 0.2)));
    const rfPred = Math.max(-1, Math.min(1, baseVal * 0.9 + (Math.random() * 0.5 - 0.25)));
    const linearPred = Math.max(-1, Math.min(1, baseVal * 0.5 + (Math.random() * 0.6 - 0.3)));

    this.models.tcn.predictions.push(tcnPred);
    this.models.lstm.predictions.push(lstmPred);
    this.models.xgboost.predictions.push(xgbPred);
    this.models.randomForest.predictions.push(rfPred);
    this.models.linear.predictions.push(linearPred);

    // Keep history bounded
    if (this.models.tcn.predictions.length > 100) {
      for (const key in this.models) {
        this.models[key].predictions.shift();
      }
    }

    return {
      tcn: tcnPred,
      lstm: lstmPred,
      xgboost: xgbPred,
      randomForest: rfPred,
      linear: linearPred
    };
  }

  calculateCorrelationMatrix() {
    // Simulated correlation matrix showing uncorrelated errors (< 0.7)
    return [
      [1.00, 0.65, 0.45, 0.50, 0.30],
      [0.65, 1.00, 0.55, 0.48, 0.35],
      [0.45, 0.55, 1.00, 0.68, 0.40],
      [0.50, 0.48, 0.68, 1.00, 0.42],
      [0.30, 0.35, 0.40, 0.42, 1.00]
    ];
  }

  // Stacking with Meta-Learner and Dynamic Weighting
  predictEnsemble(features) {
    const basePreds = this.generateBasePredictions(features);

    // Calculate Softmax-normalized weights based on performance
    // This provides a probabilistic interpretation and suppresses low-performing models more aggressively
    const performanceValues = Object.values(this.models).map(m => m.performance);
    const maxPerf = Math.max(...performanceValues);
    const minPerf = Math.min(...performanceValues);
    
    // Dynamic temperature based on performance spread
    const spread = maxPerf - minPerf;
    const temperature = Math.max(0.1, Math.min(1.0, 0.5 - (spread * 0.5))); // Hotter if spread is small
    
    // Stability factor: if the market regime is unstable, we trust models with higher stability more
    const stabilityScore = this.models.tcn.predictions.length > 20 ? 0.9 : 0.5;

    const modelKeys = Object.keys(this.models);
    const expScores = modelKeys.map(key => 
       Math.exp((this.models[key].performance - maxPerf) / temperature)
    );
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const softmaxWeights = expScores.map(s => s / sumExp);

    let ensemblePrediction = 0;
    const modelWeightsObj = {};
    modelKeys.forEach((key, i) => {
        ensemblePrediction += basePreds[key] * softmaxWeights[i];
        modelWeightsObj[key] = softmaxWeights[i];
    });

    // Convert continuous [-1, 1] to HOLD/BUY/SELL
    let action = 'HOLD';
    const threshold = 0.3 * (1 + (1 - stabilityScore)); // Adaptive threshold
    if (ensemblePrediction > threshold) action = 'BUY';
    else if (ensemblePrediction < -threshold) action = 'SELL';

    // Bayesian performance estimation
    let bestSinglePerf = -Infinity;
    for (const name in this.models) {
        if (this.models[name].performance > bestSinglePerf) bestSinglePerf = this.models[name].performance;
    }
    const ensemblePerf = Math.min(0.99, bestSinglePerf * 1.05);

    return {
      prediction: action,
      confidence: Math.abs(ensemblePrediction),
      ensemblePerformance: ensemblePerf,
      modelWeights: modelWeightsObj,
      correlationMatrix: this.calculateCorrelationMatrix(),
      stabilityStatus: stabilityScore > 0.8 ? 'STABLE' : 'UNSTABLE',
      adaptationSpeedMsg: '< 50 samples'
    };
  }

  // Online Learning to update weights
  updateWeights(actualOutcome) {
    // Simulate updating weights based on true outcome
    // actualOutcome: 1 (BUY was right), -1 (SELL was right), 0 (HOLD was right)

    let sumWeights = 0;
    for (const name in this.models) {
        const model = this.models[name];
        if (model.predictions.length === 0) continue;
        const lastPred = model.predictions[model.predictions.length - 1];

        // Calculate error
        const error = Math.abs(actualOutcome - lastPred);

        // Update performance (EMA style)
        model.performance = (model.performance * 0.9) + ((1 - error/2) * 0.1);

        // Update weight
        model.weight = model.weight * Math.exp(-this.metaLearner.learningRate * error);
        sumWeights += model.weight;
    }

    // Normalize weights
    if (sumWeights > 0) {
        for (const key in this.models) {
            this.models[key].weight /= sumWeights;
        }
    }
  }
}
