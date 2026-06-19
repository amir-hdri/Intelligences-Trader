# استراتژی اشکال‌زدایی غیرقطعی و ردیابی توزیع‌شده (Non-deterministic Debugging)

این سند شامل استراتژی‌ها و کوئری‌های PromQL برای شناسایی و تحلیل Heisenbug‌ها، Race Condition‌ها و مشکلات پرفورمنس در سیستم است.

## ۱. Correlation ID و لاگر Pino
یک Middleware در Express پیاده‌سازی شده که به هر درخواست یک UUID اختصاص می‌دهد (`x-correlation-id`). این شناسه تا درون `ONNX Runtime Session` (از طریق `RunOptions.logId`) نفوذ می‌کند و با استفاده از تنظیمات بهینه Pino در محیط‌های مختلف (Production vs Debug) ثبت می‌شود.

## ۲. تشخیص Race Condition
برای شناسایی رقابت بین Main Thread و Web Worker، از `SharedArrayBuffer` و توابع `Atomics` (مانند `Atomics.compareExchange`) استفاده شده است. این سیستم به عنوان یک پرچم (Flag) عمل می‌کند تا دسترسی همزمان به وضعیت (مانند Strategy Weights) را شناسایی کرده و به صورت یک هشدار (Warning) ثبت کند.

## ۳. Shadow Mode Protocol
در اندپوینت `/api/analyze`، استراتژی مدل TCN جدید در پس‌زمینه (بدون مسدود کردن فرآیند اصلی) اجرا می‌شود. نتایج با خروجی Rule-Based (که مستقیماً به کاربر ارسال می‌شود و Kill-Switch در آن عمل می‌کند) مقایسه شده و هرگونه انحراف (Deviation) بیش از ۵ درصد برای بررسی‌های بعدی لاگ می‌شود.

## ۴. کوئری‌های کلیدی Grafana (PromQL)

در ادامه ۵ کوئری مهم PromQL برای مانیتورینگ سیستم آورده شده است:

### الف) P99 Latency وب‌سوکت
مدت زمانی که طول می‌کشد ۹۹ درصد از درخواست‌ها از طریق وب‌سوکت پردازش شوند:
```promql
histogram_quantile(0.99, sum(rate(websocket_request_duration_seconds_bucket[5m])) by (le))
```

### ب) نرخ خطای ONNX Inference
نسبت خطاهای هنگام پردازش توسط مدل ONNX به کل درخواست‌های پردازش:
```promql
sum(rate(onnx_inference_errors_total[5m])) / sum(rate(onnx_inference_requests_total[5m]))
```

### ج) انحراف Confidence Score مدل
میانگین اختلاف اطمینان مدل TCN نسبت به استراتژی پایه‌ای (رصد شده در Shadow Mode):
```promql
avg_over_time(shadow_mode_confidence_deviation_percent[5m])
```
*(توجه: برای این کوئری، مقادیر انحراف باید توسط یک Metrics Exporter به Prometheus ارسال شوند).*

### د) نرخ رشد مموری در Worker (Memory Growth Rate)
تغییرات میزان استفاده از حافظه توسط Web Worker در هر ثانیه (برای شناسایی Memory Leak):
```promql
rate(process_resident_memory_bytes{job="web_worker"}[5m])
```

### و) پایداری آموزش و اکتشاف (PPO Entropy)
مانیتورینگ میزان Entropy در مدل PPO برای اطمینان از ادامه فرآیند اکتشاف (Exploration) و جلوگیری از همگرایی زودهنگام:
```promql
avg_over_time(ppo_actor_entropy[10m])
```

### ز) خطای کالیبراسیون مدل (Expected Calibration Error)
رصد میزان انحراف احتمال‌های پیش‌بینی شده از واقعیت (ECE) برای اطمینان از Reliability خروجی‌های مدل TCN:
```promql
rate(tcn_calibration_error_total[1h])
```

## ۵. Retraining Pipeline Tracer
با استفاده از لاگ‌های sequencer جدید در `ModelManager` (مانند `Retraining: Data preparation...`)، می‌توان کل چرخه حیات بازآموزی مدل را در پلتفرم‌های Log Aggregation (مانند ELK یا Loki) با یک Query ساده ردیابی کرد:
`{job="ai-backend"} |= "Retraining:"`
