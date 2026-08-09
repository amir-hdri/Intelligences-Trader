# Historical snapshot attribution

These files are immutable, filtered research snapshots; they are not a live
market-data feed and no warranty of accuracy is made.

- `BTCUSDT_1d.csv` and `ETHUSDT_1d.csv` are derived from Binance spot-kline
  snapshots in `congde/web3-quant-sandbox` at commit
  `e6731d872ff0c807559d2741249248b9ff9dd6a6`, distributed by that repository
  under the MIT License. See `MIT-source-license.txt`.
- `AAPL_1d.csv` is derived from the Yahoo Finance snapshot in
  `FarhanAli97/Apple-AAPL-Stock-Data-1980-to-December-2024` at commit
  `35431ef9c6a0f1408d3a9218ef4c47034704c126`, distributed by that repository
  under Apache License 2.0. See `APACHE-2.0.txt`.

Changes made here: rows were filtered to 2023-10-27 through 2024-11-29,
columns were reduced/normalized to timestamp/date/OHLCV, timestamps were
normalized to Unix milliseconds, and numeric formatting was normalized.
Upstream URLs and hashes of the resulting files are in `manifest.json`.
