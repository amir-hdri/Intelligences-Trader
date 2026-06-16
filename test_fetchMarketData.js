import { TseApiClient } from './robot trader/src/dataUtils.js';

const client = new TseApiClient({
  proxyUrl: "http://localhost:3000",
  apiKey: "test",
  isConnected: true,
  useDigitalTwin: true
});

client.fetchMarketData("SAF").then(data => console.log(data)).catch(err => console.error(err));
