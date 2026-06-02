import * as tf from '@tensorflow/tfjs-node';

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

// Build Temporal Convolutional Network
export function buildTCN(inputShape, numClasses) {
  const input = tf.input({ shape: inputShape });

  let x = input;
  const dilations = [1, 2, 4];

  for (const dilation of dilations) {
    const conv = tf.layers.conv1d({
      filters: 32,
      kernelSize: 3,
      padding: 'same',
      dilationRate: 1,
      activation: 'relu'
    }).apply(x);
    x = conv;
  }

  const flatten = tf.layers.flatten().apply(x);
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
  if (returns.length === 0) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  return (mean - riskFreeRate) / stdDev;
}

// Calculate Calibration Error
export function calculateCalibrationError(yTrue, yPredProbs) {
  // A simple ECE (Expected Calibration Error) approximation
  const numBins = 10;
  let calibrationError = 0;

  for (let i = 0; i < numBins; i++) {
    const binStart = i / numBins;
    const binEnd = (i + 1) / numBins;

    let binCount = 0;
    let binConfSum = 0;
    let binCorrect = 0;

    for (let j = 0; j < yPredProbs.length; j++) {
      const maxProb = Math.max(...yPredProbs[j]);
      const predClass = yPredProbs[j].indexOf(maxProb);

      if (maxProb >= binStart && maxProb < binEnd) {
        binCount++;
        binConfSum += maxProb;
        if (predClass === yTrue[j]) {
          binCorrect++;
        }
      }
    }

    if (binCount > 0) {
      const binAccuracy = binCorrect / binCount;
      const binConfidence = binConfSum / binCount;
      calibrationError += (binCount / yPredProbs.length) * Math.abs(binAccuracy - binConfidence);
    }
  }

  return calibrationError;
}
