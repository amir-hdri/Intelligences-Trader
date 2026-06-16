import { analyzeMarketMTF, performWalkForwardBacktest, trainModelEpoch } from '../dataUtils';


self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    let result;
    switch (type) {
      case 'analyzeMarketMTF':
        // Demonstrate Race Condition Detection via Atomics and SharedArrayBuffer
        if (payload.sharedBuffer) {
           const flagArray = new Int32Array(payload.sharedBuffer);
           // Try to acquire the simulated 'lock' (0 means free, 1 means busy)
           // In a real scenario, this detects if the main thread is simultaneously mutating strategy weights.
           const previousVal = Atomics.compareExchange(flagArray, 0, 0, 1);
           if (previousVal !== 0) {
               console.warn('[Heisenbug Detector] Race condition detected! Main thread is holding the weights lock while worker attempts to analyze.');
           }

           result = analyzeMarketMTF(payload.data, payload.symbolId, payload.context, payload.weights);

           // Release the lock (always release since we set it to 1)
           Atomics.store(flagArray, 0, 0);
        } else {
           result = analyzeMarketMTF(payload.data, payload.symbolId, payload.context, payload.weights);
        }
        break;

      case 'performWalkForwardBacktest':
        result = performWalkForwardBacktest(payload.candles);
        break;
      case 'trainModelEpoch':
        result = await trainModelEpoch(payload.candles, payload.symbolId);
        break;
      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }
    self.postMessage({ id, result });
  } catch (error: any) {
    self.postMessage({ id, error: error.message || 'Unknown worker error' });
  }
};
