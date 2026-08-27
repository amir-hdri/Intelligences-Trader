# راهنمای اعتبارسنجی Intelligences-Trader

این پروژه یک پلتفرم **پژوهشی و شبیه‌سازی** است و سفارش زنده ارسال نمی‌کند.
داده‌های تولیدشده، order book مصنوعی، fixture یادگیری و paper outcome باید همیشه
با `simulated: true` مشخص شوند. ledger خالی نباید رکورد نمونه تولید کند.

## اعتبارسنجی کامل Node/Frontend
 
```bash
npm ci
npm run typecheck                  # بررسی تایپ‌اسکریپت (0 خطا)
npm run build                      # بیلد پروداکشن کلاینت با Vite
npm test --workspaces --if-present  # اجرای 152 تست بک‌اند و پروکسی
npm test --workspace app           # اجرای 41 تست کلاینت فرانت‌اند
npm audit --audit-level=moderate   # بررسی امنیتی پکیج‌ها (0 آسیب‌پذیری)
```

## تست Python و خط لوله هوش مصنوعی

```bash
cd ml_service
uv sync --locked
uv run pytest -q                   # اجرای 69 تست با 0 هشدار Deprecation
uv run python run_backtests.py     # بازتولید گزارش متنی و نمودارهای PNG بک‌تست
git diff --exit-code -- backtest_results.csv backtest_report.md backtest_artifacts/
```

## استخراج گراف دانش و بررسی معماری (Graphify)

```bash
$(cat graphify-out/.graphify_python) -m graphify.cli export html
# باز کردن فایل تعاملی در مرورگر: graphify-out/graph.html
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
