# Full-Stack Principal Engineering Audit

Audit date: 2026-08-09

## A. Executive summary

The repository is a coherent **research and simulation platform**, not a live
brokerage. The audited architecture consists of a strict TypeScript React/Vite
terminal, an Express analysis/backtesting API, a separate Express/WebSocket
market gateway, PostgreSQL/Redis adapters with local fallbacks, and a Python
PPO/TCN research/backtesting pipeline.

The most important remediation in this pass was not cosmetic: authentication
was only applied to a subset of sensitive routes, empty ledgers manufactured
sample positions/orders, runtime model metrics fabricated validation values,
several frontend analytics views generated plausible but unobserved performance,
and browser E2E tests swallowed failures or asserted `true`. These root causes
were removed. Simulation provenance is now explicit across market, order-book,
learning, paper-trading, and ledger boundaries.

**Production-readiness decision**

- **Research/simulation deployment:** `READY WITH MINOR ISSUES`, subject to a
  successful browser run in an environment that can install Playwright Chromium
  and a real container build in CI.
- **Live trading / regulated production:** `NOT READY`. There is deliberately no
  broker/OMS boundary, licensed complete feed, signed model card/promotion
  workflow, refresh-token revocation store, or production TLS/ingress overlay.

## B. Important problems found and remediated

| Priority | Problem / root cause | Impact | Fix | Verification |
|---|---|---|---|---|
| P0 | `AUTH_REQUIRED` protected only selected expensive routes | Paper/order/ledger APIs could bypass configured authentication | Global `/api` Bearer enforcement when enabled; only status/login/refresh remain public | Dedicated secured-mode integration tests cover 401/403/login/refresh/authorized analysis |
| P1 | Position/order ledgers generated sample records and APIs said `simulated:false` | Users could mistake fabricated state for real portfolio/order data | Ledgers now contain only explicitly inserted records; empty means empty; APIs return paper-simulation provenance | Ledger regression tests and authenticated API assertions |
| P1 | Model registry defaulted to accuracy `0.847`, derived precision/recall, drift `0.12`, latency `15ms` | Fabricated model quality/latency | Unknown evaluation metrics are `null`; latency/evaluation appear only after measurement | ModelRegistry regression tests |
| P1 | Performance UI generated synthetic equity, benchmark, monthly returns, alpha, drawdown and recovery time while claiming ledger derivation | Materially misleading analytics | Rebuilt component to derive every chart/table/metric from explicit realized paper outcomes; honest empty state | Strict typecheck and production build |
| P1 | Correlation UI displayed hard-coded matrix cells and coefficients | Unobserved analytics presented as measured | UI now renders only supplied coefficients; unavailable fields show `N/A`; simulation badge added | Strict typecheck/build |
| P1 | Existing E2E caught every error; WebSocket chaos test asserted `true` | CI could pass with a completely broken UI | Real Playwright config, automatic three-service startup, desktop/mobile journeys, overflow/touch checks, API flow and offline/reconnect assertions | `playwright test --list`; full local browser execution blocked by CDN networking and delegated to CI |
| P1 | Frontend direct API calls omitted Bearer token | Auth-enabled deployments broke backtest/paper/training flows | Shared authenticated JSON client, typed API service, token-aware dashboards and worker training request; login/logout UI | Typecheck/build + API auth tests |
| P1 | Gateway `/api/orderbook` was always simulated but unlabelled; Vite/Nginx routed it to the wrong backend | REST order book silently failed and fell back again | Explicit provenance and dedicated gateway routes in Vite/Nginx; WS messages also carry provenance | Gateway integration tests and HTTP smoke tests |
| P1 | Legacy paper endpoint accepted malformed quantities/prices/brackets | NaN/invalid business state | Server-side normalization, bounds, side-aware SL/TP validation, clear 400 errors | HTTP smoke and integration tests |
| P2 | API credentials were compared with ordinary string equality; auth had only general rate limiting | Timing/brute-force hardening gap | Timing-safe hashed comparison, strict Bearer grammar/algorithm, auth limiter, no-store token responses | Auth integration suite |
| P2 | Services lacked direct security headers; Nginx lacked CSP | Weaker defense in depth | Headers on both APIs; CSP/HSTS on Nginx | Integration header assertions / config inspection |
| P2 | Docker exposed databases/backends and frontend Nginx ran privileged on port 80 | Unnecessary attack surface | Only frontend exposed; internal services use `expose`; unprivileged Nginx on 8080; no-new-privileges; K8s non-root/seccomp/capability drops | YAML parsing; Docker engine unavailable locally |
| P2 | Legacy duplicate/dead components and CommonJS server remained tracked | Maintenance ambiguity and broken alternate entry point | Removed unused duplicate components, unused historical helper/test, placeholder WS adapter, and dead server entry | Typecheck/build/tests |
| P2 | Gateway Prometheus response joined with literal `\\n` | Invalid metrics exposition | Real newline output and regression assertion | Gateway test |
| P2 | EKS endpoint was public by default | Excessive control-plane exposure | Private access enabled; public access now explicit variable defaulting false; control-plane logs enabled | Terraform static review (Terraform CLI unavailable locally) |
| P3 | Reduced-motion and touch behavior incomplete | Accessibility/mobility issue | Mobile minimum controls and `prefers-reduced-motion`; dialog/icon labels improved | Typecheck/build; browser spec prepared |

## C. Completed work

- Mapped all workspaces, services, routes, persistence adapters, model contracts,
  Docker/Kubernetes/Terraform, CI/CD, tests, feature flags and simulation paths.
- Added fail-closed production auth defaults and complete frontend token plumbing.
- Added typed frontend API contracts and removed production `any` usage.
- Removed misleading/fabricated ledger, model, performance, correlation, latency,
  position, risk and notification values.
- Added explicit provenance to generated REST and WebSocket data.
- Added robust server input validation and accounting regression tests.
- Added actual CSV export, API connection test, command-palette filtering,
  loading/error/success/retry states and honest empty states.
- Hardened security headers, rate limiting, CORS behavior, container exposure,
  non-root execution and EKS API defaults.
- Added `.env.example`, reproducible browser configuration and updated operating
  documentation.
- Preserved and revalidated the Python 3-symbol × 3-strategy backtesting report.

## D. Validation matrix

| Validation | Status | Evidence |
|---|---|---|
| Frontend strict TypeScript | PASS | `npm run typecheck` |
| Lint | NOT AVAILABLE | Repository has no ESLint configuration; strict TypeScript, production build, incomplete-marker/unsafe-pattern scans, and tests were used instead. Adding a formatter/linter is a P3 follow-up, not hidden as a pass. |
| Vite/Playwright config TypeScript | PASS | `tsc -p robot trader/tsconfig.node.json --noEmit` |
| Production frontend build | PASS | `npm run build` |
| Frontend/domain unit tests | PASS | 41 tests |
| Analysis API/unit/integration/security tests | PASS | 145 tests including auth, model, ledger, P2 and Phase 3 suites |
| Gateway/real WebSocket integration tests | PASS | 7 tests covering normalized external data, fallback provenance, order book, Prometheus output and WS |
| Python unit/integration tests | PASS | 69 tests with 0 deprecation warnings |
| Python dependency/lock consistency | PASS | `uv lock --check`, `pip check` |
| npm dependency audit | PASS | 0 vulnerabilities (all and production dependencies) |
| Backtest reproducibility | PASS | 9 runs, 18 PNGs, hash/link/accounting checks |
| YAML parsing | PASS | Compose, Kubernetes and workflow documents |
| Auth fail-closed production import | PASS | production without secrets rejected; configured secure import succeeds |
| HTTP three-service smoke | PASS | frontend, proxied API, gateway, metrics and validation responses |
| Browser E2E execution | NOT AVAILABLE LOCALLY | Playwright specs/config list successfully; browser CDN TLS is blocked in this sandbox |
| Docker image build/runtime | NOT AVAILABLE LOCALLY | Docker CLI/daemon unavailable in this sandbox |
| Terraform validate/plan | NOT AVAILABLE LOCALLY | Terraform CLI and cloud credentials unavailable |
| GitHub workflow publication | REQUIRES USER ACTION | GitHub App token lacks workflow-write permission |

## E. Genuine remaining issues

1. **P0 for live trading — no broker/OMS.** Implement a broker sandbox first,
   durable idempotent order state machine, reconciliation, partial fills,
   cancel/replace, exchange calendars/limits and disaster recovery.
2. **P1 — licensed real-time data is absent.** Several flows intentionally use
   labelled digital twins and fixture news/macro inputs. A licensed instrument
   master and timestamped quality-controlled feed are business dependencies.
3. **P1 — model governance is incomplete.** The ONNX artifact still needs a
   signed model card, exact training data/schema/scaler hashes, calibration,
   approval and rollback record.
4. **P1 — identity lifecycle is minimal.** Single-admin JWT login has no durable
   refresh-token rotation/revocation, MFA, RBAC or external IdP. It is suitable
   only for a constrained research deployment.
5. **P1 — infrastructure overlays require operator input.** Replace image tags,
   configure TLS ingress/DNS, network policy, remote audit sink, managed secrets,
   backups and environment-specific Terraform state before deployment.
6. **P2 — process-local fallback state is not horizontally durable.** PostgreSQL
   is used for backtests/trades when available, but some UI/paper state remains
   process-local by design.
7. **P2 — final browser/container/Terraform execution requires an environment
   with browser CDN, Docker, Terraform and cloud credentials.** The repository
   now contains executable checks; this sandbox cannot supply those externals.
8. **P3 — no dedicated ESLint/formatter policy exists.** Strict TypeScript and
   tests pass, and production `any`/console placeholders were removed, but a
   future style/lint baseline should be agreed without mass cosmetic churn.

## F. Final status

**NOT READY for live trading.**

**READY WITH MINOR ISSUES for its documented research/simulation purpose** once
the prepared Playwright and container checks pass in CI. No known unauthenticated
API bypass, fabricated production metric, fabricated empty-ledger record, or
high-priority accounting defect remains in the audited research scope.
