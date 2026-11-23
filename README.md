<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

## Quick Start — المهندس بشار

```bash
# جهاز جديد (Windows: powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1)
sh scripts/bootstrap.sh                  # Node≥20 + Ollama + install + doctor + check
sh scripts/bootstrap.sh --pull-models    # يسحب النماذج صراحةً فقط عند الطلب
npm install
cp .env.example .env.local   # أضف GEMINI_API_KEY اختيارياً للتوليد السحابي
npm run dev                  # http://127.0.0.1:3000
npm test                     # 146 اختبار وحدة/تكامل
npm run test:e2e             # 13 اختبار متصفح حقيقية (Playwright)
npm run check                # lint + test + secrets + doctor
```

- **ترخيص وحوكمة:** [MIT License](LICENSE) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md). `ai_pipeline.ts` منطقة محظورة التعديل؛ كل استنتاج محلي يمر عبر `local_synthesis.ts` → `llama-bridge.generate()`.
- **بدون مفتاح Gemini:** يعمل الاستوديو بالكامل عبر النماذج المحلية (Ollama) والمسار الحتمي.
- **تشغيل محلي أولاً:** `OMEGA_LOCAL_FIRST=1 npm run dev`
- انظر قسم [Local quantized coding models](#local-quantized-coding-models-ollama) لاختيار النماذج.

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/32d8febd-36c0-45ba-bb01-9c2d32ff7416

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Local quantized coding models (Ollama)

The studio ships a curated catalog of **34 lightweight / quantized coding models** (0.5B → 8B, plus a few heavier locally-installed variants), exposed at:

```bash
curl http://localhost:3000/api/models          # catalog + installed flags
curl -X POST http://localhost:3000/api/models/probe   # re-detect Ollama models
```

Requirements: Ollama running locally (`OLLAMA_HOST`, default `http://127.0.0.1:11434`). Detection is automatic at startup; `/api/status` reports `localModels.online`.

To actually generate with a local model:
1. Open **خط الإنتاج → مشروع جديد → توزيع النماذج غير المتماثل**.
2. Set **البنّاء الأساسي (Builder Alpha)** to any tag marked `✓` (installed), e.g. `qwen2.5-coder:3b`.
3. Tick **تفعيل التوليد العصبي** and launch. The pipeline calls `/api/generate` on Ollama with JSON mode, then still runs the real OS verifier on the result.

Setting `OMEGA_LOCAL_FIRST=1` routes **all six agent roles** to the best installed model that fits available RAM — no Gemini key required. If Ollama is unreachable, the pipeline falls back to the deterministic synthesizer.

Model files can be downloaded explicitly (never automatically) with `OMEGA_ALLOW_MODEL_PULL=1` and `POST /api/models/pull` — or simply `ollama pull <tag>` yourself.

```bash
npm run test:omega   # includes catalog, routing and mocked Ollama client tests
```

## Neural Offline Voice (Piper TTS)

GENESIS-OMEGA now ships an offline-first neural voice bridge. The server discovers a local
Piper executable and an Arabic `.onnx` voice, synthesizes WAV files into a SHA-256 cache,
and serves them securely at `/api/voice/audio/<file>.wav`.

### Enable it

1. Put the Arabic voice files (`*.onnx` and `*.onnx.json`) in `models/piper/`.
2. Make `piper` (`piper.exe` on Windows) available in `PATH`, or set:

   ```bash
   OMEGA_PIPER_BIN=C:\path\to\piper.exe
   OMEGA_PIPER_MODEL=C:\path\to\ar_JO-kareem-medium.onnx
   ```

3. Restart the server. `GET /api/status` will report `piper_tts.offline_neural_ready: true`.

### Playback fallback chain

1. **Piper offline neural TTS** — no internet, local WAV cached by `SHA-256(model|length_scale|text)`.
2. **Gemini neural TTS** — only when `GEMINI_API_KEY` is configured.
3. **Web Speech API** — browser Arabic voice, selected automatically.
4. **Text reply** — the dialogue UI always renders the answer even if audio is unavailable.

`prosody.rate` is translated to Piper's `length_scale` (lower = faster), and the HUD
shows whether the current reply used Piper, Gemini, or Web Speech. Starting the
microphone cancels any active playback for instant barge-in.

### Verify

```bash
npm run test:piper
npx tsc --noEmit
```

Cache location: `data/voice_cache/` (bounded automatically to keep the app lightweight).

## Toolchain requirements & doctor

All 18 ecosystems in the catalog have a working local toolchain on this machine.
To verify requirements at any time:

```bash
npm run doctor
```

It probes every compiler/runtime, prints versions or exact install commands, and exits
non-zero when something is missing. Current coverage: **18/18 ecosystems, 24/24 domains**.

On Windows the following were installed and registered in the machine `PATH`:

| Tool | Command | Install source |
|---|---|---|
| Python, Node, Go, Java 21, .NET 8, PowerShell 7, Git `sh` | `python3`, `node`, `go`, `javac`, `dotnet`, `pwsh`, `sh` | preinstalled / winget |
| Rust | `cargo`, `rustc` | `Rustlang.Rustup` |
| PHP 8.3 | `php` | `PHP.PHP.8.3` |
| Ruby 3.3 | `ruby` | `RubyInstallerTeam.RubyWithDevKit.3.3` |
| Lua 5.4 | `lua` | `DEVCOM.Lua` |
| C / C++ / Fortran | `gcc`, `g++`, `gfortran` | `BrechtSanders.WinLibs.MCF.UCRT` |
| Free Pascal | `fpc` | `FreePascal.FreePascalCompiler` |
| Dart | `dart` | `Google.DartSDK` |
| GnuCOBOL | `cobc` | MSYS2 `mingw-w64-ucrt-x86_64-gnucobol` |

> MinGW's original install path contained spaces, which breaks `collect2` linking.
> A no-spaces copy is registered at `C:\mingw64\bin`. The verifier also sets
> `COB_CONFIG_DIR` automatically so GnuCOBOL works when spawned directly.

## Solution catalog (24 engineering domains)

The studio now ships a domain-aware architect that emits **complete projects**, not generic
scaffolds. Open the **كتالوج الحلول** tab in the UI, or use the API:

```bash
curl http://localhost:3000/api/solutions/domains
curl -X POST http://localhost:3000/api/solutions/generate \
  -H 'Content-Type: application/json' \
  -d '{"domain":"rest-api","title":"Inventory API","prompt":"Arabic CRUD service"}'
```

Each generated bundle contains the real implementation, unit/self tests, `README.md`,
`SETUP_GUIDE.md`, `.env.example`, a locked-down `.gitignore`, and a CI workflow. The
`/api/solutions/generate` response includes a `verification` object produced by the same
OS-level verifier used for projects — it reports only tests that actually ran.

Coverage includes REST APIs, CLI tools, CSV/ETL pipelines, dependency-free ML inference,
security scanning, database migrations, static-site generation, realtime event hubs,
typed TypeScript services, Go microservices, Rust system tools, shell/PowerShell
automation, C/C++ engines, JVM/.NET services, PHP/Ruby backends, Pascal, Fortran, COBOL,
Lua game logic, and Flutter apps. Each of the 18 ecosystems in `ECOSYSTEM_CATALOG` has at
least one dedicated domain.

Selecting one of the new engineering templates in **خط الإنتاج** automatically injects a
`[Solution Domain: …]` tag, so the project pipeline generates the domain-specific bundle
instead of the generic scaffold. `POST /api/projects` also accepts an explicit
`solutionDomain` field.

## Enterprise work orders (v2.0)

The **أوامر الشركة** tab drives a persisted finite-state machine:
`BACKLOG → SPEC_BLUEPRINT → IMPLEMENTATION → OS_VERIFICATION → SECURITY_AUDIT →
SELF_HEALING → VERIFIED_COMMIT`, with `FAILED_CLOSED` recording the exact error code
and stage. Ten engineering departments classify each order deterministically and map
it to a local brain (`architect`/`coder`/`healer`/`auditor`). Every transition is
broadcast over the existing SSE stream (`work_order` topic on `/api/events`).

```bash
curl http://localhost:3000/api/enterprise/departments          # 10 departments + contracts
curl -X POST http://localhost:3000/api/enterprise/work-orders \
  -H 'Content-Type: application/json' \
  -d '{"title":"Inventory API","problemStatement":"typed REST API with SQLite and tests","run":true}'
curl http://localhost:3000/api/enterprise/work-orders          # persisted list
curl http://localhost:3000/api/enterprise/work-orders/<id>     # single order + audit log
```

The same tab also maintains **existing** local repositories (v2.0 Phase 3). The audit is
strictly read-only (SHA-256 manifest + real OS verification + secret scan); evolution
(`harden-only` / `develop-feature` / `full-evolve`) applies local-brain `SEARCH/REPLACE`
patches inside an isolated copy and only writes to the originals after the atomic
promotion gate passes — otherwise the files stay byte-for-byte identical.

```bash
curl -X POST http://localhost:3000/api/enterprise/ingest \
  -H 'Content-Type: application/json' -d '{"path":"E:\\code\\my-repo"}'   # baseline audit
curl -X POST http://localhost:3000/api/enterprise/ingest/evolve \
  -H 'Content-Type: application/json' -d '{"path":"E:\\code\\my-repo","mode":"harden-only"}'
curl http://localhost:3000/api/enterprise/ingest/runs                     # last 20 runs
```

## Two-way bilingual voice control (v2.0 Phase 5)

The **voice panel** works in Arabic and English with `Auto (AR/EN)`, `العربية` or `English` selected explicitly. Spoken language is detected from Unicode script; deterministic routing executes real work orders (`WorkOrderEngine`), repository audit/hardening (`validateRepoRoot` + `repo_ingest`) and self-healing (`healProject`). General engineering questions are answered only by the guarded local bridge (`local_synthesis` → `llama-bridge.generate()`, fail-closed, no cloud).

```bash
curl -X POST http://localhost:3000/api/voice/converse \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"Genesis, build an API service","preferredLang":"auto"}'
curl -X POST http://localhost:3000/api/voice/converse \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"أصلح المشروع رقم 1","preferredLang":"ar"}'
curl http://localhost:3000/api/status | jq '.voice'   # offline_stt_ready, bilingual_tts
```

- **TTS:** Piper discovers Arabic (`OMEGA_PIPER_MODEL_AR` / `models/piper/ar_*.onnx`) and English (`OMEGA_PIPER_MODEL_EN` / `models/piper/en_*.onnx`) voices; WAV files are cached by SHA-256(lang|model|prosody|text). Web Speech is the browser fallback.
- **STT:** `POST /api/voice/transcribe` uses local Whisper (`OMEGA_WHISPER_BIN`) or Vosk (`OMEGA_VOSK_MODEL`) with an 8 MiB cap, sanitized child environment and temp-file cleanup; without either it returns `503 STT_NOT_CONFIGURED` and the browser uses `SpeechRecognition`.
- **HUD:** push-to-talk, hands-free continuous conversation, instant barge-in, live state/engine badges, transcript history and a text-input fallback. All labels are in `src/lib/i18n.ts`.
- **Events:** each conversation publishes `event: voice` on `/api/events`.

## v3 security & pair-programming

The Enterprise tab now exposes the dependency graph, taint findings and the cryptographic ledger. Voice or REST can query all of them:

```bash
curl -X POST http://localhost:3000/api/enterprise/graph \
  -H 'Content-Type: application/json' \
  -d '{"path":"E:\\code\\my-repo","targetFile":"src/index.ts"}'
curl -X POST http://localhost:3000/api/security/taint-scan \
  -H 'Content-Type: application/json' -d '{"path":"E:\\code\\my-repo"}'
curl http://localhost:3000/api/security/ledger
```

`POST /api/security/taint-scan` traces untrusted sources into CWE-78/89/22/94/79 sinks across eight languages. `GET /api/security/ledger` returns recent entries plus `verifyLedgerIntegrity()`: each entry is `SHA256(prevHash|seq|timestamp|actor|action|target|outcomeHash)` with genesis hash `0…0`, so edits, deletions and reordering are detectable. Voice supports “What is the blast radius of …?” / «ما تأثير تعديل ملف…» and “Verify audit ledger integrity” / «افحص سلامة سجل التدقيق».

## v4 runtime & grounding

Four dedicated Ollama brains are shipped as tracked Modelfile templates in `models/brains/` (`omega-architect`, `omega-coder`, `omega-healer`, `omega-auditor`). Create them explicitly with `sh scripts/bootstrap.sh --create-brains` (or `-CreateBrains` on Windows); bootstrap also applies process-local Ollama performance tuning. Heavy `*.gguf`/`*.onnx` weights remain ignored.

```bash
curl http://localhost:3000/api/runtime/metrics
```

The metrics endpoint reports only measured data: SHA-256 cache hits/misses and saved milliseconds, blocked hallucination count, stagnation breaks, dedicated-brain resolution, and cleaned workspaces. Generated code is grounded against real imports/symbols before compilation, unchanged files reuse cached graph/taint results, and the healing loop stops on repeated error signatures.

## Verification & integrity policy

- `npm test` runs **every** unit/integration test file under `src/lib/*.test.ts` (32 files, 146 cases). Browser tests are separate: `npm run test:e2e` (13 cases, including v4 runtime telemetry). It is the
  canonical check; `npm run lint` / `npx tsc --noEmit` must also pass with zero errors.
- Verification reports count **only tests the OS runner actually executed**. When no test
  suite exists in a generated project, the report says so explicitly instead of inventing
  a passing number. Benchmarks are likewise produced only by real HTTP measurements —
  no benchmark data is seeded into a fresh store.
- Folder watches are genuinely continuous: the shortest enabled `intervalSec` drives a
  background scan, and `changedFiles` lists only files whose SHA-256 actually changed.

## Real Git release (no more script-only export)

`POST /api/projects/:id/deploy` performs a **real** Git release from the verified export bundle.
It materializes the project to `data/exports/<slug>`, then runs an argument-vector `git`
sequence (init/config/add/commit/remote/push) with a sanitized child environment: host API keys,
tokens and `GIT_DIR`/`GIT_SSH_COMMAND`-style overrides are removed, `GIT_TERMINAL_PROMPT=0`
prevents interactive hangs, and the remote URL must pass the allow-list before it is used.
The response includes every command, its real exit status, output, duration and the resulting
commit SHA; `dryRun: true` performs the local commit but only previews the push.

In the UI open **تصدير ونشر**, choose **نشر عبر مستودع Git**, then explicitly tick
**تنفيذ الدفع فعلياً الآن** (and optionally **Dry Run**). Pushing is opt-in by design — it is a
real external side effect. Local bare-repository remotes are rejected by default; for on-prem or
test use, set `OMEGA_ALLOW_LOCAL_GIT_REMOTE=1` on the server.

```bash
npm run test:deploy   # real init/commit/push against a temporary bare repository
```

## Autonomous self-healing agent (Synthesizer & Healer)

The studio now closes the loop: instead of only reporting a failed verification, it can repair the
project by itself. The agent lives in `src/lib/healer.ts` and runs a strict
**diagnose → patch → real OS verification → accept/reject** cycle:

1. **Diagnose** — root causes are extracted from the *actual* verifier output (Python `SyntaxError`
   with file/line, `ModuleNotFoundError`, `ImportError`, invalid JSON, failed assertions, toolchain
   failures) and from the static security scanners (hardcoded secrets, `eval`/`exec`, `shell=True`,
   dangerous red-team calls). Nothing is invented.
2. **Patch** — conservative, single-cause candidates: JSON trailing-comma removal, targeted Python
   syntax repair, compatibility modules for missing imports, environment-variable substitution for
   leaked credentials, and neutralization of unsafe primitives.
3. **Verify** — every candidate is materialized into its own isolated workspace and executed by the
   same OS runner used by the main pipeline (`verifyProjectWorkspace`). Temporary workspaces are
   deleted after each attempt.
4. **Accept** — a patch is promoted only when the measured score (or test pass count at equal score)
   strictly improves. Rejected patches never touch the stored project. The full audit trail — issues,
   patch label, changed files, before/after scores and raw verifier output — is stored in
   `project.healing`.

Use it from the **الإصلاح الذاتي** tab or the **إصلاح ذاتي** toolbar button, via voice
(«يا جينيسيس أصلح المشروع رقم 1»), or through the API:

```bash
curl -X POST http://localhost:3000/api/projects/1/heal \
  -H 'Content-Type: application/json' -d '{"maxIterations":4}'
```

`npm run test:healer` includes an end-to-end test that genuinely breaks a Python project, runs the
OS verifier, heals it and confirms the repaired suite passes on disk.

## Optional API authentication

Set `OMEGA_API_KEY` to enable authentication for **every** `/api/*` and `/sandbox/*` route.
The browser then shows a login screen, posts the key once to `/api/auth/login`, and receives a
random in-memory session token in an `HttpOnly; SameSite=Strict` cookie — the raw key is never
sent back to the browser or stored in local/session storage. Comparisons are constant-time and
failed logins are throttled per client. `POST /api/auth/logout` clears the session, and
`GET /api/auth/status` reports `{ authRequired, authenticated }` without exposing secrets.

When no key is configured, behaviour is unchanged (fully open API for local development).
For HTTPS deployments set `OMEGA_COOKIE_SECURE=1`.

```bash
OMEGA_API_KEY='a-long-random-key' npm run dev
npm run test:auth
```

## Security notes for deployment

- When `OMEGA_API_KEY` is not set, the HTTP API has **no built-in authentication**. Bind it to
  localhost with `HOST=127.0.0.1` or place it behind an authenticating reverse proxy.
- Generated sandbox processes receive a sanitized environment: keys matching
  `API_KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `AUTH`, etc. are removed before
  spawning, so `GEMINI_API_KEY` never reaches user-authored code.
- Watch paths inside OS system roots (`C:\Windows`, `Program Files`, `/etc`, …) are rejected,
  and relative paths with drive qualifiers (`C:`) are refused by the path guard.

