import { PositionSizingEnv } from './PositionSizingEnv.js';
import { PPOAgent } from './PPOAgent.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.js';
import { createSeededRng } from '../utils/deterministic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function trainPPO() {
  logger.info("Starting PPO Training for Position Sizing with Curriculum Learning...");

  const env = new PositionSizingEnv();
  const stateDim = env.getState().length;
  const actionDim = 1;

  const agent = new PPOAgent(stateDim, actionDim, {
    gamma: 0.99,
    clipRatio: 0.2,
    actorLr: 3e-4,
    criticLr: 1e-3
  });

  const totalEpisodes = 10000;
  const batchSize = 64;

  let curriculumLevel = 0;
  const curriculumThresholds = [3000, 7000];

  let states = [];
  let actions = [];
  let logProbs = [];
  let rewards = [];
  let values = [];
  let dones = [];

  let historyRewards = [];

  for (let ep = 1; ep <= totalEpisodes; ep++) {
    if (ep > curriculumThresholds[0] && curriculumLevel === 0) {
      curriculumLevel = 1;
      logger.info("--- Moving to Medium Curriculum (Added Volatility) ---");
    } else if (ep > curriculumThresholds[1] && curriculumLevel === 1) {
      curriculumLevel = 2;
      logger.info("--- Moving to Hard Curriculum (Market Shocks / COVID-19 Crash simulator) ---");
    }

    const marketData = generateMarketDataForCurriculum(curriculumLevel, 100);
    let state = env.reset(marketData);

    let epReward = 0;

    while (!env.done) {
      const { action, logProb } = agent.sampleAction(state);
      const val = agent.getValues([state])[0];

      const { state: nextState, reward, done } = env.step(action);

      states.push(state);
      actions.push(action);
      logProbs.push(logProb);
      rewards.push(reward);
      values.push(val);
      dones.push(done);

      state = nextState;
      epReward += reward;

      if (states.length >= batchSize || done) {
        const { advantages, returns } = agent.computeAdvantages(rewards, values, dones);
        const validValues = values.slice(0, rewards.length);
        await agent.update(states, actions, logProbs, advantages, returns);
        states = [];
        actions = [];
        logProbs = [];
        rewards = [];
        values = [];
        dones = [];
      }
    }

    historyRewards.push(epReward);

    if (ep % 100 === 0) {
      const avgReward = historyRewards.slice(-100).reduce((a, b) => a + b, 0) / 100;
      logger.info(`Episode: ${ep}, Curriculum Level: ${curriculumLevel}, Avg Reward (last 100): ${avgReward.toFixed(4)}`);

      if (ep % 1000 === 0) {
         try {
             const modelsDir = path.join(__dirname, 'models');
             if (!fs.existsSync(modelsDir)) {
                 fs.mkdirSync(modelsDir);
             }
             await agent.actor.save(`file://${path.join(modelsDir, 'actor')}`);
             await agent.critic.save(`file://${path.join(modelsDir, 'critic')}`);
         } catch (e) {
             logger.error("Error saving model", e);
         }
      }
    }
  }

  logger.info("Training Complete.");
}

function generateMarketDataForCurriculum(level, length) {
  const data = [];
  let price = 100;
  const baseRng = createSeededRng(`curriculum-${level}-${length}`);

  for (let i = 0; i < length; i++) {
    let change;
    let isShock = false;
    let volatility;
    const rng = createSeededRng(`curr-${level}-${i}-${baseRng()}`);

    if (level === 0) {
      volatility = 0.005;
      const trend = Math.sin(i / 10);
      change = 1 + trend * volatility;
    } else if (level === 1) {
      volatility = 0.015;
      change = 1 + (rng() * 2 - 1) * volatility;
    } else {
      isShock = rng() < 0.05;
      if (isShock && rng() < 0.5) {
         volatility = 0.1;
         change = 1 - volatility;
      } else {
         volatility = 0.02;
         change = 1 + (rng() * 2 - 1) * volatility;
      }
    }

    price *= change;

    data.push({
      price: price,
      volatilityRegime: (volatility > 0.01) ? 1 : 0,
      marketDirection: change > 1 ? 1 : -1,
      timeToExpiry: 1 - (i / length),
      correlation: rng() * 2 - 1
    });
  }
  return data;
}

if (process.argv[1] && process.argv[1].endsWith('train.js')) {
    trainPPO();
}

export { trainPPO, generateMarketDataForCurriculum };
