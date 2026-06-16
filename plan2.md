Wait, if `fetchMarketData` fails, it falls back to `this.getLastPrice(symbolId)`. And `getLastPrice` calls `this.generateDigitalTwinData`.
And inside `generateDigitalTwinData`:
```typescript
386-    // If no history, generate initial history
387-    if (candles.length === 0) {
388:      let lastClose = symbolId.includes("SAF") ? 850000 : 150000;
```
If we remove `150000` from `fetchOrderBook` like this:
```typescript
<<<<<<< SEARCH
    // Simulated Order Book with Spoofing detection logic
    let lastPrice = 150000; // Default fallback
    try {
      const marketData = await this.fetchMarketData(symbolId);
      if (marketData && marketData.length > 0) {
        lastPrice = marketData[marketData.length - 1].close;
      } else {
        lastPrice = await this.getLastPrice(symbolId);
      }
    } catch (error) {
      console.warn("Failed to fetch real market data for order book, falling back to digital twin:", error);
      lastPrice = await this.getLastPrice(symbolId);
    }
=======
    // Simulated Order Book with Spoofing detection logic
    let lastPrice = await this.getLastPrice(symbolId); // Dynamic fallback
    try {
      const marketData = await this.fetchMarketData(symbolId);
      if (marketData && marketData.length > 0) {
        lastPrice = marketData[marketData.length - 1].close;
      }
    } catch (error) {
      console.warn("Failed to fetch real market data for order book, falling back to digital twin:", error);
    }
>>>>>>> REPLACE
```
It looks much better! But wait, `this.getLastPrice(symbolId)` doesn't need to be called twice.
Let's see if we should also replace the `150000` inside `generateDigitalTwinData` with a dynamic value, or if this issue ONLY asks about `fetchOrderBook`.
The description specifically says:
`async fetchOrderBook(symbolId: string): Promise<OrderBook> {`
`  // Simulated Order Book with Spoofing detection logic`
`  const lastPrice = 150000; // Mock base price`
`  const bids: OrderBookItem[] = [];`
`  const asks: OrderBookItem[] = [];`

Ah! The context in the issue is from an OLDER version of the code where `lastPrice` was a `const` and not inside a try-catch.
Wait! Let me look at the code again. Currently it is:
```typescript
    // Simulated Order Book with Spoofing detection logic
    let lastPrice = 150000; // Default fallback
    try {
      const marketData = await this.fetchMarketData(symbolId);
      if (marketData && marketData.length > 0) {
        lastPrice = marketData[marketData.length - 1].close;
      } else {
        lastPrice = await this.getLastPrice(symbolId);
      }
    } catch (error) {
      console.warn("Failed to fetch real market data for order book, falling back to digital twin:", error);
      lastPrice = await this.getLastPrice(symbolId);
    }
```
If we replace `let lastPrice = 150000; // Default fallback` with `let lastPrice = await this.getLastPrice(symbolId);`, then it resolves the issue. Or just define `let lastPrice = 0;` or `let lastPrice: number;`. Let's just define `let lastPrice: number;` and ensure it's properly assigned.

```typescript
<<<<<<< SEARCH
    // Simulated Order Book with Spoofing detection logic
    let lastPrice = 150000; // Default fallback
    try {
      const marketData = await this.fetchMarketData(symbolId);
      if (marketData && marketData.length > 0) {
        lastPrice = marketData[marketData.length - 1].close;
      } else {
        lastPrice = await this.getLastPrice(symbolId);
      }
    } catch (error) {
      console.warn("Failed to fetch real market data for order book, falling back to digital twin:", error);
      lastPrice = await this.getLastPrice(symbolId);
    }
=======
    // Simulated Order Book with Spoofing detection logic
    let lastPrice: number;
    try {
      const marketData = await this.fetchMarketData(symbolId);
      if (marketData && marketData.length > 0) {
        lastPrice = marketData[marketData.length - 1].close;
      } else {
        lastPrice = await this.getLastPrice(symbolId);
      }
    } catch (error) {
      console.warn("Failed to fetch real market data for order book, falling back to digital twin:", error);
      lastPrice = await this.getLastPrice(symbolId);
    }
>>>>>>> REPLACE
```
This entirely removes the hardcoded `150000`!
