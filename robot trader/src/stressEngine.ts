import { MarketCandle } from './types';

export interface StressScenario {
    name: string;
    description: string;
    marketDropPct: number;
    volatilityMultiplier: number;
    durationDays: number;
}

export interface StressEngineResult {
    probabilityOfRuin: number; // percentage
    maximumDrawdown: number; // percentage
    recoveryTimeDays: number; // estimation
    capitalAdequacy: number; // ratio
    simulationsRun: number;
}

export class StressEngine {
    private initialCapital: number;
    private winRate: number;
    private profitFactor: number;
    private averageWin: number;
    private averageLoss: number;

    // Scenarios
    public static readonly SCENARIOS: StressScenario[] = [
        { name: '2008 Financial Crisis', description: 'Severe prolonged market crash', marketDropPct: 50, volatilityMultiplier: 3, durationDays: 250 },
        { name: '2020 COVID Crash', description: 'Rapid extreme drop and recovery', marketDropPct: 35, volatilityMultiplier: 5, durationDays: 60 },
        { name: 'Flash Crash', description: 'Intraday severe liquidity crisis', marketDropPct: 15, volatilityMultiplier: 10, durationDays: 1 },
    ];

    constructor(initialCapital: number, winRate: number = 0.55, profitFactor: number = 1.8, averageWin: number = 200, averageLoss: number = 110) {
        this.initialCapital = initialCapital;
        this.winRate = winRate;
        this.profitFactor = profitFactor;
        this.averageWin = averageWin;
        this.averageLoss = averageLoss;
    }

    private simulatePath(numTrades: number): { currentDrawdown: number; isRuined: boolean } {
        let capital = this.initialCapital;
        let peak = capital;
        let currentDrawdown = 0;
        let isRuined = false;

        for (let t = 0; t < numTrades; t++) {
            const isWin = Math.random() < this.winRate;
            const pnl = isWin ? this.averageWin : -this.averageLoss;

            capital += pnl;

            if (capital > peak) {
                peak = capital;
            }

            const drawdown = (peak - capital) / peak;
            if (drawdown > currentDrawdown) {
                currentDrawdown = drawdown;
            }

            if (capital <= 0) {
                isRuined = true;
                break;
            }
        }

        return { currentDrawdown, isRuined };
    }

    /**
     * Run Monte Carlo Simulation to calculate Probability of Ruin and Expected Drawdowns
     * @param numSimulations Number of random walk paths (default 10000)
     * @param numTrades Number of trades per simulation path (default 250)
     */
    public runMonteCarlo(numSimulations: number = 10000, numTrades: number = 250): StressEngineResult {
        let ruinCount = 0;
        let maxDrawdownOverall = 0;
        let totalDrawdowns = 0;

        for (let i = 0; i < numSimulations; i++) {
            const { currentDrawdown, isRuined } = this.simulatePath(numTrades);

            if (isRuined) {
                ruinCount++;
            }

            if (currentDrawdown > maxDrawdownOverall) {
                maxDrawdownOverall = currentDrawdown;
            }
            totalDrawdowns += currentDrawdown;
        }

        const expectedLoss = Math.abs(this.averageLoss * numTrades * (1 - this.winRate));
        const capitalAdequacy = expectedLoss > 0 ? this.initialCapital / expectedLoss : 10;

        return {
            probabilityOfRuin: (ruinCount / numSimulations) * 100,
            maximumDrawdown: maxDrawdownOverall * 100,
            recoveryTimeDays: (maxDrawdownOverall * 100) / (this.winRate * 2), // Rough heuristic
            capitalAdequacy: capitalAdequacy,
            simulationsRun: numSimulations
        };
    }

    /**
     * Test against specific Historical or Hypothetical Scenarios
     */
    public runStressScenario(scenario: StressScenario): StressEngineResult {
        // Adjust parameters based on scenario
        const adjustedWinRate = this.winRate * (1 - (scenario.volatilityMultiplier * 0.05)); // Volatility reduces edge slightly
        const adjustedAverageLoss = this.averageLoss * (1 + (scenario.marketDropPct / 100)); // Larger losses in crash

        const stressEngine = new StressEngine(this.initialCapital, adjustedWinRate, this.profitFactor, this.averageWin, adjustedAverageLoss);
        // Run a shorter monte carlo tailored to the duration of the crisis
        return stressEngine.runMonteCarlo(5000, scenario.durationDays);
    }
}
