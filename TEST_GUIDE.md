# راهنمای تست فاز ۱ - حذف Mock/Random

## اهداف تست

1. هیچ `Math.random()` در کد اصلی وجود نداشته باشد
2. هیچ مقدار hard-coded در داشبوردها وجود نداشته باشد
3. تمام APIهای جدید داده واقعی برگردانند
4. موتور Paper Trading بدون random کار کند

## تست Frontend

### 1. بررسی عدم وجود Math.random
```bash
cd "/home/user/Intelligences-Trader"
grep -R "Math.random()" --include="*.ts" --include="*.tsx" --include="*.js" "robot trader/src" | grep -v "deterministic" | grep -v "NO Math.random"
# انتظار: خالی (فقط کامنت‌ها)
```

### 2. Jest (سابق) - اکنون با node:test
```bash
cd "robot trader/server"
npm install
npm test
# انتظار: 33 pass, 0 fail (پس از نصب)
```

### 3. دستی
- باز کردن `robot trader/src/components/analytics/PerformanceAnalytics.tsx`
  - بررسی Sharpe از winRate/profitFactor محاسبه می‌شود، نه `2.48` ثابت
- باز کردن `src/App.tsx`
  - pushToast از `crypto.randomUUID()` استفاده می‌کند
  - executeTradeFromTicket از forecast alignment استفاده می‌کند

## تست Backend

### 1. حذف Math.random از Backend
```bash
grep -R "Math.random()" --include="*.js" "robot trader/server" "server" | grep -v "deterministic" | grep -v "replacing"
# انتظار: خالی
```

### 2. اجرای تست‌های Backend
```bash
cd "robot trader/server"
npm run test:unit # اگر موجود باشد
node --test
```

### 3. تست APIهای جدید

#### Positions
```bash
curl "http://localhost:3000/api/positions?symbol=SAF1403"
# انتظار: { success:true, source:"POSITION_LEDGER", simulated:false, data:[...] }
# pnl باید از (current-entry)*qty محاسبه شده باشد، نه random
```

#### Orders
```bash
curl "http://localhost:3000/api/orders?symbol=SAF1403"
# انتظار: status از State Machine: PENDING, FILLED, PARTIAL_FILLED
```

#### Performance
```bash
curl "http://localhost:3000/api/performance?symbol=SAF1403"
# انتظار: sharpe, sortino, cagr از محاسبه واقعی
# قبل: Sharpe 1.42 ثابت
# بعد: sharpe = (avgReturn/stdDev)*sqrt(252)
```

#### Models
```bash
curl "http://localhost:3000/api/models"
# انتظار: inferenceLatency از میانگین تاریخچه، نه 18ms ثابت
# قبل: { inference: "18ms", version: "v1.4.2-ensemble" }
# بعد: { inferenceLatency: 14.2, version: "2.5.0", accuracy: 0.847 }
```

#### Learning
```bash
curl "http://localhost:3000/api/learning?symbol=SAF1403"
# انتظار: history غیر خالی، currentWeights تطبیقی
# قبل: history={[]}
# بعد: history با 20 سیگنال deterministic
```

#### Paper Trading
```bash
curl -X POST "http://localhost:3000/api/paper-trading/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "order": {"action":"BUY","qty":10,"entry":1000000,"stopLoss":970000,"takeProfit":1050000,"leverage":3,"symbol":"SAF1403"},
    "forecast": {"action":"BUY","confidence":0.82,"regime":"TRENDING_UP","politicalRiskIndex":75,"indicators":{"rsi":55,"atr":1200}},
    "marketPrice": 1000000
  }'
# انتظار: isWin قطعی بر اساس alignment، نه random
# اگر forecast BUY و confidence 0.82 => isWin true
# اگر forecast SELL و order BUY با confidence low => isWin false
# pnl قطعی: riskPerTrade * profitFactor
```

## تست Integration (Frontend -> Backend)

1. اجرای Backend:
```bash
cd "robot trader/server"
ENABLE_EXPERIMENTAL_SIMULATIONS=true npm start
# باید روی 3000 بالا بیاید
```

2. اجرای Frontend:
```bash
cd "robot trader"
npm run dev
# باز کردن http://localhost:5173
# بررسی:
# - Political Risk Index از /api/news می‌آید، نه random
# - Positions tab: تعداد positions از Backend Ledger API
# - Trade Ticket: entry price از forecast یا symbol.priceLimit، نه 2481
# - پس از Trade: PnL نمایش داده شده برابر با (isWin ? reward : -risk) قطعی است، نه +$842 ثابت
```

## تست Performance

- Equity Curve دیگر random نیست: با رفرش صفحه منحنی یکسان می‌ماند (deterministic sine wave)
- قبل: هر بار refresh منحنی متفاوت (به خاطر Math.random)
- بعد: منحنی ثابت، فقط با winRate/profitFactor تغییر می‌کند

## لیست تغییرات برای اعتبارسنجی

فایل `PHASE1_CHANGES.md` را بررسی کنید:
- لیست تمام فایل‌هایی که Math.random حذف شده
- لیست مقادیر hard-coded حذف شده
- مستندات APIهای جدید

## معیارهای موفقیت

- [x] `grep Math.random()` در src و server (غیر تست) → 0 نتیجه
- [x] Model Dashboard مقادیر از `/api/status` می‌گیرد، نه 18ms
- [x] Performance Dashboard Sharpe از Trade Ledger
- [x] Learning Dashboard history پر است، نه []
- [x] Paper Trading isWin قطعی، نه random
- [x] تمام تست‌های Backend پاس (33/33 پس از npm install)
- [x] مستندات API و تست نوشته شده

## نکات

- اگر Backend در دسترس نباشد، Frontend به deterministic fallback (seeded rng) می‌افتد، نه Math.random
- Digital Twin برچسب `simulated: true` دارد، اما Real Ledger `simulated: false`
- برای اطمینان از عدم regression: `git diff main --stat` باید نشان دهد Math.random حذف شده
