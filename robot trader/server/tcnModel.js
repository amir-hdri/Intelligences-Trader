import * as tf from '@tensorflow/tfjs';

// Focal Loss implementation
export function focalLoss(alpha = 0.25, gamma = 2.0) {
  return (yTrue, yPred) => {
    return tf.tidy(() => {
      const epsilon = 1e-7;
      const yPredClipped = tf.clipByValue(yPred, epsilon, 1 - epsilon);
      const crossEntropy = tf.mul(yTrue, tf.log(yPredClipped));
      const weight = tf.mul(tf.pow(tf.sub(1, yPredClipped), gamma), alpha);
      const loss = tf.neg(tf.mul(weight, crossEntropy));
      return tf.mean(tf.sum(loss, -1));
    });
  };
}

// Build Temporal Convolutional Network with Residual Blocks and Attention
export function buildTCN(inputShape, numClasses) {
  if (!Array.isArray(inputShape) || inputShape.length !== 2 || inputShape.some(value => !Number.isInteger(value) || value < 1)) {
    throw new TypeError('inputShape must contain positive [sequenceLength, featureCount] integers');
  }
  if (!Number.isInteger(numClasses) || numClasses < 2) throw new TypeError('numClasses must be at least 2');
  const input = tf.input({ shape: inputShape });

  let x = input;
  const dilations = [1, 2, 4, 8];
  const numFilters = 32;

  for (const dilation of dilations) {
    // Residual block
    const shortcut = tf.layers.conv1d({
      filters: numFilters,
      kernelSize: 1,
      padding: 'same'
    }).apply(x);

    // Left-only padding followed by a valid convolution prevents future time
    // steps from leaking into causal TCN activations.
    let res = tf.layers.zeroPadding1d({ padding: [2 * dilation, 0] }).apply(x);
    res = tf.layers.conv1d({
      filters: numFilters,
      kernelSize: 3,
      padding: 'valid',
      dilationRate: dilation,
      activation: 'relu'
    }).apply(res);

    res = tf.layers.batchNormalization().apply(res);
    res = tf.layers.zeroPadding1d({ padding: [2 * dilation, 0] }).apply(res);
    res = tf.layers.conv1d({
      filters: numFilters,
      kernelSize: 3,
      padding: 'valid',
      dilationRate: dilation,
      activation: 'relu'
    }).apply(res);
    
    res = tf.layers.batchNormalization().apply(res);
    
    // Add shortcut to residue
    x = tf.layers.add().apply([shortcut, res]);
    x = tf.layers.dropout({ rate: 0.1 }).apply(x);
  }

  // Simple Global Attention Mechanism
  // x shape: [batch, time, filters]
  const query = tf.layers.dense({ units: numFilters }).apply(x);
  const key = tf.layers.dense({ units: numFilters }).apply(x);
  const value = tf.layers.dense({ units: numFilters }).apply(x);
  
  const score = tf.layers.dot({ axes: [2, 2] }).apply([query, key]);
  const weights = tf.layers.activation({ activation: 'softmax' }).apply(score);
  const attention = tf.layers.dot({ axes: [2, 1] }).apply([weights, value]);
  
  const flatten = tf.layers.flatten().apply(attention);
  const dense = tf.layers.dense({ units: 64, activation: 'relu' }).apply(flatten);
  const output = tf.layers.dense({ units: numClasses, activation: 'softmax' }).apply(dense);

  const model = tf.model({ inputs: input, outputs: output });
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: focalLoss(0.25, 2.0),
    metrics: ['accuracy']
  });

  return model;
}

// Fractional Differentiation to preserve long-term memory
export function fractionalDiff(series, d, window = 10) {
  if (!Array.isArray(series) || series.some(value => !Number.isFinite(value))) {
    throw new TypeError('series must contain only finite numbers');
  }
  if (!Number.isFinite(d) || d < 0 || d > 1) throw new RangeError('d must be between 0 and 1');
  if (!Number.isInteger(window) || window < 1) throw new RangeError('window must be a positive integer');
  const weights = [1];
  for (let k = 1; k < window; k++) {
    weights.push(-weights[k - 1] * (d - k + 1) / k);
  }

  const result = [];
  for (let i = 0; i < series.length; i++) {
    if (i < window - 1) {
      result.push(0);
      continue;
    }
    let sum = 0;
    for (let k = 0; k < window; k++) {
      sum += weights[k] * series[i - k];
    }
    result.push(sum);
  }
  return result;
}

// Purged K-Fold Cross Validation
export function purgedKFold(dataSize, k = 5, purgeWindow = 5) {
  if (!Number.isInteger(dataSize) || dataSize < 2) throw new RangeError('dataSize must be at least 2');
  if (!Number.isInteger(k) || k < 2 || k > dataSize) throw new RangeError('k must be between 2 and dataSize');
  if (!Number.isInteger(purgeWindow) || purgeWindow < 0) throw new RangeError('purgeWindow must be non-negative');
  const folds = [];
  const foldSize = Math.floor(dataSize / k);

  for (let i = 0; i < k; i++) {
    const valStart = i * foldSize;
    const valEnd = (i === k - 1) ? dataSize : (i + 1) * foldSize;

    const trainIndices = [];
    const valIndices = [];

    for (let j = 0; j < dataSize; j++) {
      if (j >= valStart && j < valEnd) {
        valIndices.push(j);
      } else if (j < valStart - purgeWindow || j >= valEnd + purgeWindow) {
        trainIndices.push(j);
      }
    }

    folds.push({ trainIndices, valIndices });
  }

  return folds;
}

// Calculate Maximum Drawdown
export function calculateMaxDrawdown(equityCurve) {
  if (!Array.isArray(equityCurve) || equityCurve.length === 0) return 0;
  if (equityCurve.some(value => !Number.isFinite(value) || value <= 0)) throw new TypeError('equityCurve values must be positive and finite');
  let peak = equityCurve[0];
  let maxDrawdown = 0;

  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
    }
    const drawdown = (peak - equityCurve[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

// Calculate Sharpe Ratio
export function calculateSharpeRatio(returns, riskFreeRate = 0) {
  if (!Array.isArray(returns) || returns.length === 0) return 0;
  if (returns.some(value => !Number.isFinite(value)) || !Number.isFinite(riskFreeRate)) {
    throw new TypeError('returns and riskFreeRate must be finite');
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  return (mean - riskFreeRate) / stdDev;
}

// Calculate Calibration Error
export function calculateCalibrationError(yTrue, yPredProbs) {
  if (!Array.isArray(yTrue) || !Array.isArray(yPredProbs) || yTrue.length !== yPredProbs.length) {
    throw new TypeError('Labels and probability rows must have equal lengths');
  }
  if (yTrue.length === 0) return 0;
  if (yPredProbs.some(row => !Array.isArray(row) || row.length === 0 || row.some(value => !Number.isFinite(value) || value < 0 || value > 1))) {
    throw new TypeError('Predicted probabilities must be finite values in [0, 1]');
  }
  const numBins = 10;
  let calibrationError = 0;
  
  const bins = Array.from({ length: numBins }, () => ({ count: 0, confSum: 0, correct: 0 }));

  for (let j = 0; j < yPredProbs.length; j++) {
    const maxProb = Math.max(...yPredProbs[j]);
    const predClass = yPredProbs[j].indexOf(maxProb);
    
    // Determine which bin the probability falls into
    let binIdx = Math.floor(maxProb * numBins);
    if (binIdx === numBins) binIdx = numBins - 1; // Handle prob = 1.0

    bins[binIdx].count++;
    bins[binIdx].confSum += maxProb;
    if (predClass === yTrue[j]) {
      bins[binIdx].correct++;
    }
  }

  for (let i = 0; i < numBins; i++) {
    const { count, confSum, correct } = bins[i];
    if (count > 0) {
      const binAccuracy = correct / count;
      const binConfidence = confSum / count;
      calibrationError += (count / yPredProbs.length) * Math.abs(binAccuracy - binConfidence);
    }
  }

  return calibrationError;
}
