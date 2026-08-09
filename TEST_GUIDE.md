# راهنمای اعتبارسنجی Intelligences-Trader

این پروژه یک پلتفرم **پژوهشی و شبیه‌سازی** است و سفارش زنده ارسال نمی‌کند.
داده‌های تولیدشده، order book مصنوعی، fixture یادگیری و paper outcome باید همیشه
با `simulated: true` مشخص شوند. ledger خالی نباید رکورد نمونه تولید کند.

## اعتبارسنجی کامل Node/Frontend

```bash
npm ci
npm run typecheck
npm run build
npm test --workspaces --if-present
npm audit --audit-level=moderate
```

## تست واقعی مرورگر

```bash
npm run test:e2e:install --workspace app
npm run test:e2e --workspace app
```

Playwright سه سرویس را خودکار اجرا می‌کند و مسیرهای desktop/mobile، command
palette، تست اتصال API و قطع/اتصال مجدد WebSocket را بررسی می‌کند. تست E2E
نباید خطا را catch و به pass تبدیل کند.

## تست Python و Backtesting

```bash
cd ml_service
uv sync --locked
uv run pytest -q
uv run python run_backtests.py
git diff --exit-code -- backtest_results.csv backtest_report.md backtest_artifacts/
```

## تست دستی API امن

در حالت توسعه `/api/status` عمومی است. در production، اگر `AUTH_REQUIRED` خالی
باشد احراز هویت به‌طور پیش‌فرض فعال می‌شود.

```bash
cp .env.example .env
# مقادیر secret را با secret manager جایگزین کنید.
NODE_ENV=production AUTH_REQUIRED=true npm start --workspace server

curl http://localhost:3000/api/status
curl -i http://localhost:3000/api/positions       # 401
curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}'
curl http://localhost:3000/api/positions \
  -H 'authorization: Bearer ACCESS_TOKEN'
```

پاسخ positions خالی باید آرایه خالی باشد، نه داده‌ی ساخته‌شده:

```json
{
  "source": "PROCESS_LOCAL_PAPER_POSITION_LEDGER",
  "simulated": true,
  "simulationType": "PAPER_TRADING",
  "data": []
}
```

## Docker Compose

```bash
cp .env.example .env
docker compose config
docker compose up --build
```

فقط frontend روی `5173` منتشر می‌شود؛ backend، Redis و PostgreSQL روی شبکه‌ی
داخلی Compose باقی می‌مانند. در production مقادیر auth/database باید از secret
manager تزریق شوند.

## معیار پذیرش

- TypeScript strict و production build بدون خطا
- تمام تست‌های Node و Python پاس
- E2E واقعی desktop/mobile پاس
- `npm audit` بدون آسیب‌پذیری شناخته‌شده
- خروجی Backtesting deterministic
- `/api` در حالت امن بدون Bearer token قابل دسترسی نباشد
- هیچ metric یا ledger رکورد ساختگی را به‌عنوان داده واقعی معرفی نکند
- تمام fallbackها provenance صریح داشته باشند
