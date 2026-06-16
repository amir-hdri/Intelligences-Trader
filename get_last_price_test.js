import assert from 'node:assert';

console.log('We want to change `let lastPrice = 150000;` to `let lastPrice;` or fetch the fallback from getLastPrice BEFORE trying fetchMarketData?');
console.log('Ah wait, we can just change it to: let lastPrice = await this.getLastPrice(symbolId);');
