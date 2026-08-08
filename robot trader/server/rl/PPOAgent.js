import * as tf from '@tensorflow/tfjs';

export class PPOAgent {
  constructor(stateDim, actionDim, config = {}) {
    this.stateDim = stateDim;
    this.actionDim = actionDim; // Should be 1 for position size

    this.gamma = config.gamma || 0.99;
    this.clipRatio = config.clipRatio || 0.2;
    this.actorLr = config.actorLr || 3e-4;
    this.criticLr = config.criticLr || 1e-3;

    // Create Actor Network (outputs mean for normal distribution, std is fixed for simplicity or learned)
    this.actor = this.buildActor();
    this.actorOpt = tf.train.adam(this.actorLr);

    // Create Critic Network
    this.critic = this.buildCritic();
    this.criticOpt = tf.train.adam(this.criticLr);

    this.logStd = tf.variable(tf.fill([1, this.actionDim], -0.5)); // Learnable standard deviation
  }

  buildActor() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [this.stateDim] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    // Output is mean of normal distribution
    // Use sigmoid to bound between 0 and 1, then we can map to actual action space
    model.add(tf.layers.dense({ units: this.actionDim, activation: 'sigmoid' }));
    return model;
  }

  buildCritic() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [this.stateDim] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 }));
    return model;
  }

  getPolicyDistribution(stateTensor) {
    const mu = this.actor.predict(stateTensor);
    const std = tf.exp(this.logStd);
    return { mu, std };
  }

  sampleAction(state) {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      const { mu, std } = this.getPolicyDistribution(stateTensor);

      // Sample from normal distribution: mu + std * N(0, 1)
      const noise = tf.randomStandardNormal([1, this.actionDim]);
      let action = mu.add(std.mul(noise));

      // Clip action to [0, 1] bounds
      action = tf.clipByValue(action, 0, 1);

      // Calculate log probability of the chosen action
      const logProb = this.calculateLogProb(action, mu, std);

      return {
        action: action.arraySync()[0],
        logProb: logProb.arraySync()[0]
      };
    });
  }

  calculateLogProb(action, mu, std) {
    // Log prob of Normal distribution
    const variance = tf.square(std);
    const logScale = tf.log(std);
    const log2pi = tf.scalar(Math.log(2 * Math.PI));

    const squaredDiff = tf.square(action.sub(mu));
    const exponent = tf.div(squaredDiff, tf.mul(tf.scalar(2), variance)).neg();

    const logProb = exponent.sub(logScale).sub(tf.mul(tf.scalar(0.5), log2pi));
    return logProb;
  }

  computeAdvantages(rewards, values, dones) {
    const advantages = new Float32Array(rewards.length);
    const returns = new Float32Array(rewards.length);
    let gae = 0;
    const lmbda = 0.95;

    for (let t = rewards.length - 1; t >= 0; t--) {
      const nextValue = t + 1 < rewards.length ? values[t + 1] : 0;
      const done = dones[t] ? 1 : 0;
      const delta = rewards[t] + this.gamma * nextValue * (1 - done) - values[t];
      gae = delta + this.gamma * lmbda * (1 - done) * gae;
      advantages[t] = gae;
      returns[t] = advantages[t] + values[t];
    }

    return { advantages, returns };
  }

  async update(states, actions, oldLogProbs, advantages, returns) {
    const statesT = tf.tensor2d(states);
    const actionsT = tf.tensor2d(actions);
    const oldLogProbsT = tf.tensor2d(oldLogProbs);

    // Normalize advantages
    const advT = tf.tensor1d(advantages);
    const meanAdv = tf.mean(advT);
    const stdAdv = tf.sqrt(tf.mean(tf.square(advT.sub(meanAdv)))).add(1e-8);
    const normAdvT = advT.sub(meanAdv).div(stdAdv);

    const returnsT = tf.tensor1d(returns);

    // Update Actor
    const actorLossFunc = () => {
      const { mu, std } = this.getPolicyDistribution(statesT);
      const newLogProbs = this.calculateLogProb(actionsT, mu, std);

      const ratio = tf.exp(newLogProbs.sub(oldLogProbsT));

      const surr1 = ratio.mul(normAdvT.expandDims(1));
      const surr2 = tf.clipByValue(ratio, 1 - this.clipRatio, 1 + this.clipRatio).mul(normAdvT.expandDims(1));

      // Calculate Entropy: 0.5 + 0.5 * log(2 * pi) + log(std)
      const entropy = tf.mean(tf.add(tf.scalar(0.5 + 0.5 * Math.log(2 * Math.PI)), tf.log(std)));
      const entropyCoef = 0.01; // Entropy bonus coefficient

      const actorLoss = tf.neg(tf.mean(tf.minimum(surr1, surr2))).sub(entropy.mul(entropyCoef));
      return actorLoss;
    };

    const { value: actorLoss, grads: actorGrads } = this.actorOpt.computeGradients(actorLossFunc);
    this.actorOpt.applyGradients(actorGrads);

    // Update Critic
    const criticLossFunc = () => {
      const values = this.critic.predict(statesT).squeeze();
      const criticLoss = tf.mean(tf.square(returnsT.sub(values)));
      return criticLoss;
    };

    const { value: criticLoss, grads: criticGrads } = this.criticOpt.computeGradients(criticLossFunc);
    this.criticOpt.applyGradients(criticGrads);

    const aLoss = actorLoss.dataSync()[0];
    const cLoss = criticLoss.dataSync()[0];

    tf.dispose([statesT, actionsT, oldLogProbsT, advT, normAdvT, returnsT, actorLoss, criticLoss, ...Object.values(actorGrads), ...Object.values(criticGrads)]);

    return { actorLoss: aLoss, criticLoss: cLoss };
  }

  getValues(states) {
    return tf.tidy(() => {
      const statesT = tf.tensor2d(states);
      return this.critic.predict(statesT).reshape([states.length]).arraySync();
    });
  }
}
