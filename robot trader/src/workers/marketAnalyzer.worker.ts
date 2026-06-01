import { analyzeMarketMTF, performWalkForwardBacktest, trainModelEpoch } from '../dataUtils';

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    let result;
    switch (type) {
      case 'analyzeMarketMTF':
        result = analyzeMarketMTF(payload.data, payload.symbolId, payload.context);
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
