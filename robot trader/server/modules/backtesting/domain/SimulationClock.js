/** Monotonic point-in-time clock used by every component in a run. */
export class SimulationClock {
  constructor() {
    this.currentTime = Number.NEGATIVE_INFINITY;
    this.sequence = 0;
  }

  advance(availableAt) {
    if (!Number.isFinite(availableAt)) throw new TypeError('Simulation time must be finite');
    if (availableAt < this.currentTime) throw new Error('Simulation clock cannot move backwards');
    this.currentTime = availableAt;
    this.sequence += 1;
    return this.currentTime;
  }

  now() {
    if (!Number.isFinite(this.currentTime)) throw new Error('Simulation clock has not started');
    return this.currentTime;
  }

  nextSequence() {
    this.sequence += 1;
    return this.sequence;
  }
}
