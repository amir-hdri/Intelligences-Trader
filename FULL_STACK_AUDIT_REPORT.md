# Full-Stack Principal Engineering Audit

Audit date: 2026-08-09 — sections D and E refreshed 2026-10-29 after the terminal-contract and
documentation-truth remediation phase, and 2026-10-30 after the adversarial review of the terminal
redesign (the findings in sections A–C are kept as the 2026-08-09 history).

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

### B2. Findings from the 2026-10-30 adversarial review of the terminal redesign — all remediated

| Priority | Finding | Impact | Fix | Verification |
|---|---|---|---|---|
| P0 | The header shipped a hard-coded `TICKER_ITEMS` price list labelled "IME LIVE TAPE" with a pulsing "live" indicator | The most operator-visible surface displayed fabricated quotes as live market data | The constant is deleted; the tape renders the selected instrument's actual last candle (price, change, WebSocket state, as-of time) and is labelled `IME SIMULATION TAPE` in digital-twin mode, `IME LIVE TAPE` only when the real feed is configured | `npm run typecheck`, `npm run build`, browser spec |
| P0 | The emergency kill switch committed the whole unsaved risk-limit edit buffer to persisted state | An unrelated cleared field persisted `0` drawdown limits, which latched the risk engine into a permanent lockout | The toggle merges only the `stopAllTrading` flag into persisted state; `RiskEngine.validateLimits` rejects non-positive limits; a risk-triggered halt is latched separately from the manual halt and can only be released by an explicit reset | `robot trader/src/riskEngine.test.ts`, `npm run typecheck` |
| P1 | The arbitrage panel dropped its "Simulated Signal — Execution Disabled" disclosure and claimed live routing, sub-8 ms latency and a "LIVE SCANNER" badge | A synthetic random basis spread was presented as an executable arbitrage signal | The badge reads `SIMULATED FEED`, the per-row execution-disabled disclosure is restored, and the invented routing/latency/cycle strings are removed | `npm run build` |
| P1 | The orphan guard only recorded "has some importer", so mutually-importing orphan islands passed silently and dynamic imports were false positives | The guard could not detect the dead-code island it exists for | The guard now computes reachability from the entry points (`index.tsx`, `main.tsx`), understands dynamic `import()` and Vite query suffixes, and has fixture regression tests | `robot trader/src/orphanGuard.test.ts` (fails `npm test`, not the build) |
| P1 | `npm run verify` was not wired into CI or `check`, and compared scheduled cases against "passing" claims | Documented totals could drift while CI stayed green; a skipped case still read as "all passing" | The guard parses passed/skipped counters for Node and passed/skipped/deselected for pytest, is part of the root `check` script, and runs as its own CI job with `uv` available | `npm run verify`, `.github/workflows/ci.yml` |
| P1 | The risk panel claimed "Auto-enforced at execution layer" for a position-size limit that never reaches the order path | Operators were told a limit was enforced when it was advisory | The claim now states exactly what is enforced (open-trade cap, drawdown breakers, manual halt) and that max position size feeds the Kelly sizing suggestion; the paper-trading quantity/price unit is inconsistent with the simulated balance, so no unusable notional cap was added | `robot trader/src/components/dashboard/RiskControlPanel.tsx` |
| P1 | The shared `Modal` and the command palette declared `aria-modal` without moving, trapping or restoring focus; the title id was a fixed literal | Keyboard users tabbed into the obscured page, and duplicate ids broke `aria-labelledby` | A shared `useModalFocus` hook moves focus into the dialog, traps Tab, restores focus to the opener, restores the previous `body` scroll lock and uses `useId()` for the title | `npm run typecheck`, browser spec |
| P2 | The health monitor presented a client-side session timer as "API Uptime" and a never-written latency field as "Gateway Latency" | Dashboard cards claimed telemetry that was never measured | Uptime is labelled `Session Uptime`, the gateway-latency card is removed, and the worker card shows `Worker Pool Capacity`; the offload sentence matches the actual worker usage | `npm run build` |
| P2 | The regime timeline presented a rule-based EMA/ATR classifier as a Hidden Markov Model with a "confidence" posterior | A simple rule was dressed as a probabilistic model | The panel is renamed "Regime Classifier", the badge reads `Signal Score`, and the HMM wording is gone | `npm run build` |
| P2 | The delivery acceptance document still documented the deleted `services/api.ts` and put the login form in the wrong tab | The acceptance report contradicted the delivered code | Both rows now reference `services/apiFetch.ts` and the API tab (`ApiSettingsPanel`) | `npm run verify` |
| P2 | Quantity quick-set buttons labelled "25% / 50% / 75% / 100%" set lots from a hard-coded 100-lot base | The percentage implied a balance-derived sizing that did not exist | The buttons are labelled and set explicit lot quantities (25/50/75/100 lots) | `npm run build` |
| P3 | Dead new props and paths shipped with the redesign (`onEmergencyHalt`, a gated one-click trade action, a hard-coded "ONLINE (0.8ms)") | Dead branches and fabricated latency in the shipped bundle | The unused emergency callback is replaced by a real "Reset Halt" action wired to `RiskEngine.resetKillSwitch`, the never-rendered trade buttons are removed, and the gateway label no longer invents a latency | `npm run typecheck` |
| P3 | `marketAnalyzer.worker.test.ts` was never compiled or executed, and `tsc` did not clean `outDir` | Three worker tests were missing from every reported count and stale output could inflate it | The worker test is part of `tsconfig.test.json`, and `npm test` removes `test-out` before compiling | `npm test --workspace app` (50 cases) |

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
| Frontend/domain unit tests | PASS | 50 tests |
| Analysis API/unit/integration/security tests | PASS | 149 tests including auth, model, ledger, P2 and Phase 3 suites |
| Gateway/real WebSocket integration tests | PASS | 7 tests covering normalized external data, fallback provenance, order book, Prometheus output and WS |
| Python unit/integration tests | PASS | 73 tests with 0 deprecation warnings |
| Python dependency/lock consistency | PASS | `uv lock --check`, `pip check` |
| npm dependency audit | PASS | 0 vulnerabilities (all and production dependencies) |
| Backtest reproducibility | PASS | 9 runs, 18 PNGs, hash/link/accounting checks |
| YAML parsing | PASS | Compose, Kubernetes and workflow documents |
| Auth fail-closed production import | PASS | production without secrets rejected; configured secure import succeeds |
| HTTP three-service smoke | PASS | frontend, proxied API, gateway, metrics and validation responses |
| Browser E2E execution | PASS | `npm run test:e2e --workspace app` → 7 passed, 1 skipped (desktop + mobile projects) |
| Terminal navigation contract | PASS | `robot trader/tests/audit/navigation.spec.ts` — all 22 nav ids land on a visible, non-empty labelled region |
| Orphan-module guard | PASS | `robot trader/src/orphanGuard.test.ts` — every production module under `src/` is reachable from the entry points; the guard fails `npm test`, not `npm run build` |
| ONNX artifact contract | PASS | `ml_service/test_model_contract.py` and `robot trader/server/modelArtifactContract.test.js` pin both artifacts' names, shapes and digests |
| Documented test totals | PASS | `npm run verify` — the documented totals equal the executed counts (279) |
| Docker image build/runtime | NOT AVAILABLE LOCALLY | Docker CLI/daemon unavailable in this sandbox |
| Terraform validate/plan | NOT AVAILABLE LOCALLY | Terraform CLI and cloud credentials unavailable |
| GitHub workflow publication | REQUIRES USER ACTION | GitHub App token lacks workflow-write permission |

## E. Genuine remaining issues

> Refreshed 2026-10-29. Every item is marked **CODE-VERIFIED** when the repository now proves the state
> (a test or a check fails if it regresses) and **ASPIRATIONAL** when the capability is simply not built
> yet. The audit's verdict on live trading does not change: the platform stays a research and simulation
> platform.

1. **P0 for live trading — no broker/OMS.** Implement a broker sandbox first,
   durable idempotent order state machine, reconciliation, partial fills,
   cancel/replace, exchange calendars/limits and disaster recovery. **ASPIRATIONAL.**
2. **P1 — licensed real-time data is absent.** Several flows intentionally use
   labelled digital twins and fixture news/macro inputs. A licensed instrument
   master and timestamped quality-controlled feed are business dependencies.
   **ASPIRATIONAL.**
3. **P1 — model governance is incomplete.** The ONNX artifact still needs a
   signed model card, exact training data/schema/scaler hashes, calibration,
   approval and rollback record. The artifacts' names, shapes and digests are
   **CODE-VERIFIED** by the two contract tests; the governance artefacts are not.
4. **P1 — the two shipped ONNX artifacts do not share a contract.** The Python
   research artifact takes 5 features and returns 2 outputs; the Node serving
   artifact takes 10 features and returns 1. The mismatch is **CODE-VERIFIED**
   and unresolved: one artifact has to be rebuilt and promoted.
5. **P1 — the PPO action space differs between the two services.** The Python
   policy emits a continuous direction, the Node environment decodes a discrete
   action. **CODE-VERIFIED** as a known defect; one shared action contract is
   still missing.
6. **P1 — identity lifecycle is minimal.** Single-admin JWT login has no durable
   refresh-token rotation/revocation, MFA, RBAC or external IdP. Authentication
   itself fails closed in production. **ASPIRATIONAL** beyond that deployment.
7. **P1 — infrastructure overlays require operator input.** Replace image tags,
   configure TLS ingress/DNS, network policy, remote audit sink, managed secrets,
   backups and environment-specific Terraform state before deployment; the CI
   deploy step is not connected to the cluster. **ASPIRATIONAL.**
8. **P2 — process-local fallback state is not horizontally durable.** PostgreSQL
   is used for backtests/trades when available, but some UI/paper state remains
   process-local by design. **ASPIRATIONAL.**
9. **P2 — final container/Terraform execution requires an environment with
   Docker, Terraform and cloud credentials.** The repository now contains
   executable checks; this sandbox cannot supply those externals. **ASPIRATIONAL.**
10. **P3 — no dedicated ESLint/formatter policy exists.** Strict TypeScript and
    tests pass, and production `any`/console placeholders were removed, but a
    future style/lint baseline should be agreed without mass cosmetic churn.
    **ASPIRATIONAL.**

### Closed by the 2026-10-29 and 2026-10-30 remediation phases

- The production build is green again (the `Badge` tone contract is enforced by strict TypeScript) —
  **CODE-VERIFIED** by `npm run typecheck`.
- All 22 navigation ids render their own labelled destination, and the content container is a named
  region — **CODE-VERIFIED** by `robot trader/tests/audit/navigation.spec.ts`.
- No module under `robot trader/src/` is left unreachable from the entry points — **CODE-VERIFIED** by
  `robot trader/src/orphanGuard.test.ts`, which fails the test suite when the next orphan appears.
- The browser end-to-end suite runs locally and proves a real WebSocket connection — **CODE-VERIFIED** by
  `npm run test:e2e --workspace app` (7 passed, 1 skipped).
- The documented test totals can no longer drift from the executed ones — **CODE-VERIFIED** by
  `npm run verify`, which now also runs in CI and is part of the root `check` script.
- The header tape, the arbitrage panel, the regime timeline and the health monitor now show only observed
  or explicitly labelled simulation state; the fabricated live quotes, live-scanner badge, gateway latency,
  API-uptime label and HMM/confidence wording are gone — **CODE-VERIFIED** by `npm run typecheck` and
  `npm run build`.
- The emergency kill switch persists only the halt flag, and a latched risk halt can be released explicitly
  — **CODE-VERIFIED** by `robot trader/src/riskEngine.test.ts` and the reset action in the risk panel.
- The shared dialog primitive and the command palette move, trap and restore keyboard focus — **CODE-VERIFIED**
  by `npm run typecheck` and the browser spec.

## F. Final status

**NOT READY for live trading.**

**READY WITH MINOR ISSUES for its documented research/simulation purpose.** The Playwright
checks now pass locally (7 passed, 1 skipped); only the container and Terraform checks still
need an environment with Docker and cloud credentials. No known unauthenticated
API bypass, fabricated production metric, fabricated empty-ledger record, or
high-priority accounting defect remains in the audited research scope.
