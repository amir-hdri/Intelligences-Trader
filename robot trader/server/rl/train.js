import { PositionSizingEnv } from './PositionSizingEnv.js';
import { PPOAgent } from './PPOAgent.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function trainPPO() {
  console.log("Starting PPO Training for Position Sizing with Curriculum Learning...");

  const env = new PositionSizingEnv();
  const stateDim = env.getState().length;
  const actionDim = 1;

  const agent = new PPOAgent(stateDim, actionDim, {
    gamma: 0.99,
    clipRatio: 0.2,
    actorLr: 3e-4,
    criticLr: 1e-3
  });

  const totalEpisodes = 10000; // Target convergence in < 10000
  const batchSize = 64;

  let curriculumLevel = 0; // 0: Easy, 1: Medium, 2: Hard
  const curriculumThresholds = [3000, 7000]; // Episodes to switch levels

  let states = [];
  let actions = [];
  let logProbs = [];
  let rewards = [];
  let values = [];
  let dones = [];

  let historyRewards = [];

  for (let ep = 1; ep <= totalEpisodes; ep++) {
    // Manage Curriculum
    if (ep > curriculumThresholds[0] && curriculumLevel === 0) {
      curriculumLevel = 1;
      console.log("--- Moving to Medium Curriculum (Added Volatility) ---");
    } else if (ep > curriculumThresholds[1] && curriculumLevel === 1) {
      curriculumLevel = 2;
      console.log("--- Moving to Hard Curriculum (Market Shocks / COVID-19 Crash simulator) ---");
    }

    // Generate specific market data based on curriculum
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

      // PPO Update
      if (states.length >= batchSize || done) {
        // Compute Advantages and Returns
        const { advantages, returns } = agent.computeAdvantages(rewards, values, dones);

        // Ensure values arrays are properly sized
        const validValues = values.slice(0, rewards.length);

        await agent.update(states, actions, logProbs, advantages, returns);

        // Reset buffers
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
      console.log(`Episode: ${ep}, Curriculum Level: ${curriculumLevel}, Avg Reward (last 100): ${avgReward.toFixed(4)}`);

      // Save model periodically
      if (ep % 1000 === 0) {
         try {
             // Create models directory if it doesn't exist
             const modelsDir = path.join(__dirname, 'models');
             if (!fs.existsSync(modelsDir)) {
                 fs.mkdirSync(modelsDir);
             }
             await agent.actor.save(`file://${path.join(modelsDir, 'actor')}`);
             await agent.critic.save(`file://${path.join(modelsDir, 'critic')}`);
         } catch (e) {
             console.error("Error saving model", e);
         }
      }
    }
  }

  console.log("Training Complete.");
}

function generateMarketDataForCurriculum(level, length) {
  const data = [];
  let price = 100;

  for (let i = 0; i < length; i++) {
    let change;
    let isShock = false;
    let volatility;

    if (level === 0) {
      // Easy: Stable, clear trends
      volatility = 0.005;
      const trend = Math.sin(i / 10); // Sine wave trend
      change = 1 + trend * volatility;
    } else if (level === 1) {
      // Medium: Random walk with standard volatility
      volatility = 0.015;
      change = 1 + (Math.random() * 2 - 1) * volatility;
    } else {
      // Hard: Include market shocks (e.g. COVID crash)
      isShock = Math.random() < 0.05; // 5% chance of severe shock
      if (isShock && Math.random() < 0.5) {
         // Massive drop
         volatility = 0.1;
         change = 1 - volatility;
      } else {
         volatility = 0.02;
         change = 1 + (Math.random() * 2 - 1) * volatility;
      }
    }

    price *= change;

    data.push({
      price: price,
      volatilityRegime: (volatility > 0.01) ? 1 : 0,
      marketDirection: change > 1 ? 1 : -1,
      timeToExpiry: 1 - (i / length),
      correlation: Math.random() * 2 - 1 // Simplified
    });
  }
  return data;
}

// Allow importing or running directly
if (process.argv[1] && process.argv[1].endsWith('train.js')) {
    trainPPO();
}

export { trainPPO, generateMarketDataForCurriculum };
