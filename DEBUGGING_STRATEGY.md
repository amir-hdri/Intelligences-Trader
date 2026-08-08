# Debugging and observability strategy

## Correlation and structured logs

The analysis API accepts or creates `x-correlation-id` and returns it in the response. Structured Pino/Winston logs include request/model events. Future cross-service calls should forward this ID and create W3C trace context.

The current `/metrics` endpoints expose process-local request counts, 5xx counts, and average request duration. They are deliberately minimal. Production should replace them with `prom-client` histograms/counters and an OTLP SDK configured through environment variables.

## Concurrency

Browser analysis uses a bounded `WorkerPool` (maximum four workers):

- all idle workers are filled from the queue;
- each task has a timeout;
- worker errors reject the active task and replace the failed worker;
- shutdown rejects every pending task;
- stale market-load responses are discarded by sequence number.

`SharedArrayBuffer` is not required. Strategy weights are sent as immutable structured-clone payloads, avoiding shared-memory races and cross-origin-isolation requirements.

## WebSocket diagnostics

The gateway:

- validates symbol and payload size;
- sends heartbeat pings and terminates dead peers;
- avoids writes when buffered output exceeds 1 MiB;
- maintains per-client simulated price state;
- closes malformed subscriptions with policy code 1008.

The browser validates and normalizes every order-book payload, reconnects with capped exponential backoff plus jitter, and stops reconnecting after component disposal.

Recommended failure tests:

1. kill/restart the gateway while the terminal is open;
2. inject malformed JSON and malformed book levels;
3. throttle the browser/network and verify backpressure;
4. rapidly switch symbols and confirm stale HTTP results never replace the current symbol;
5. terminate a worker mid-task and verify its queued successor completes.

## Model debugging

Every promoted model needs:

- exact input/output names, dimensions, dtypes, and class ordering;
- feature and scaler schema hashes;
- finite-value/range assertions at training and inference;
- deterministic golden vectors compared between Python export and Node inference;
- latency and memory tests at representative batch sizes;
- calibration, confusion matrix, and cost-adjusted out-of-sample metrics.

Drift output currently measures normalized prediction entropy, which is an uncertainty indicator rather than proof of covariate drift. It only recommends offline retraining; it never fabricates or hot-reloads a model.

## Suggested production metrics

```promql
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
```

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
/
sum(rate(http_requests_total[5m])) by (service)
```

```promql
sum(rate(websocket_messages_dropped_total[5m])) by (reason)
```

```promql
histogram_quantile(0.99, sum(rate(model_inference_duration_seconds_bucket[5m])) by (le, model_version))
```

```promql
max(model_prediction_entropy_ema) by (model_version, symbol)
```

```promql
max(data_feed_staleness_seconds) by (source, symbol)
```

Alert rules and dashboard queries must reference metrics that are actually exported; do not document fictional metric names as implemented telemetry.
