# OPS — التشغيل اليومي للورشة الشخصية

هذه الورشة تعمل محلياً على Windows، بدون Docker وبدون نشر سحابي. التشغيل اليومي يعتمد على ثلاثة أوامر فقط.

## خطة التشغيل الشاملة

| الركن | الملف المرجعي | ما يضمنه |
|---|---|---|
| جرد الملفات والاختبارات | `INVENTORY.md` | 147 ملفاً، 33 ملف اختبار، 153 حالة — بالأوامر لا بالتقدير |
| مخزن الحالة | `data/omega_store.db` (WAL) + مرآة `omega_store.json` | كتابة ذرية، وهجرة تلقائية من المرآة عند الاستعادة |
| البث المباشر | `GET /api/events` (SSE) | `event: ready` و`event: state` و`event: job`، نبضة كل 15 ثانية |
| المهام الخلفية | `POST /api/jobs` + `GET /api/jobs/:id` | يُعيد `jobId` فوراً؛ الحالة `queued/running/done/failed` وتُدفع عبر SSE |
| لوحة القياسات | تبويب «لوحة القياسات» | أرقام من المتجر مباشرة؛ أشرطة CSS بلا مكتبة خارجية |
| تقرير PDF | زر «حفظ PDF» → `report/html?print=1` | طباعة المتصفح إلى PDF؛ لا مولّد أصلي |
| اللغة | زر `English`/`العربية` في الشريط | يبدّل نصوص الواجهة الثابتة ويُحفظ في `localStorage` |
| خارطة التوسّع | `ROADMAP.md` | المراحل 0–4 + خارطة v2.0 (المرحلة 4 ✅) |
| النسخ والاستعادة | `RECOVERY.md` | استعادة فعلية موثّقة بتاريخ |
| الحدود المعروفة | `LIMITATIONS.md` | ما لا يفعله العزل ولا يتحقق منه النظام |
| القرارات | `DECISIONS.md` | لماذا لا Docker ولماذا 3 مشاريع |
| الإثبات | `PROOF.md` | الفرق بين دليل تشغيل ودليل تسليم |

## الأوامر الأساسية

```
npm run dev            تشغيل الاستوديو على 127.0.0.1:3000
npm run backup         نسخ حالة التشغيل
npm run check          lint + 153 اختبار + فحص أسرار + doctor
npm run doctor         فحص جاهزية مفصّل بجدول [✓/✗/—]
npm run doctor -- --ci فحص CI: البوابات المحمولة تُنفَّذ، والبوابات المضيفة تُعلَن كمتخطاة لا كنجاح صامت
npm run test:e2e    14 اختبارات متصفح حقيقية (Playwright chromium)، منفصلة عن npm test
npm run check:secrets  فحص الملفات المتتبعة لأنماط البيانات السرية
scripts/bootstrap.ps1 [-PullModels]   تهيئة Windows (Node≥20 + Ollama + install + doctor + check)
scripts/bootstrap.sh [--pull-models]  تهيئة Linux/macOS (نفس البوابات)
```

## أوامر الشركة وصيانة المستودعات (v2.0)

```bash
curl http://127.0.0.1:3000/api/enterprise/departments
curl http://127.0.0.1:3000/api/enterprise/work-orders
curl http://127.0.0.1:3000/api/enterprise/ingest/runs
curl -X POST http://127.0.0.1:3000/api/enterprise/ingest \
  -H 'Content-Type: application/json' -d '{"path":"E:\\code\\my-repo"}'
curl -X POST http://127.0.0.1:3000/api/enterprise/ingest/evolve \
  -H 'Content-Type: application/json' -d '{"path":"E:\\code\\my-repo","mode":"harden-only"}'

# الحوار الصوتي ثنائي اللغة (ينفّذ أوامر حقيقية ويبث حدث voice)
curl -X POST http://127.0.0.1:3000/api/voice/converse \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"Genesis, build an API service","preferredLang":"auto"}'
curl -X POST http://127.0.0.1:3000/api/voice/converse \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"حالة الأدوات والبيئة؟","preferredLang":"ar"}'
curl -X POST http://127.0.0.1:3000/api/voice/transcribe \
  -H 'Content-Type: application/json' -d '{"audioBase64":"...","mimeType":"audio/webm"}'

# v3: رسم التبعيات، فحص التلوث، وسلامة السجل المشفّر
curl -X POST http://127.0.0.1:3000/api/enterprise/graph \
  -H 'Content-Type: application/json' \
  -d '{"path":"E:\\code\\my-repo","targetFile":"src/index.ts"}'
curl -X POST http://127.0.0.1:3000/api/security/taint-scan \
  -H 'Content-Type: application/json' -d '{"path":"E:\\code\\my-repo"}'
curl http://127.0.0.1:3000/api/security/ledger
curl http://127.0.0.1:3000/api/runtime/metrics
curl http://127.0.0.1:3000/api/enterprise/deep-tech
curl -X POST http://127.0.0.1:3000/api/re/inspect-binary \
  -H 'Content-Type: application/json' -d '{"path":"E:\\firmware.bin"}'
curl -X POST http://127.0.0.1:3000/api/re/decode-frame \
  -H 'Content-Type: application/json' \
  -d '{"hex":"010300000002c40b","schema":[{"name":"slave","type":"uint8"},{"name":"func","type":"uint8"},{"name":"start","type":"uint16be"},{"name":"count","type":"uint16be"},{"name":"crc","type":"crc16_modbus"}]}'
```

مراحل التدقيق والتطوير تُبثّ على `/api/events` تحت الموضوع `ingest` وتظهر مباشرة في تبويب أوامر الشركة.

## التهيئة على جهاز جديد

```powershell
# Windows (PowerShell 5.1/7+)
.\\scripts\\bootstrap.ps1              # لا يسحب نماذج
.\\scripts\\bootstrap.ps1 -PullModels  # يسحب qwen2.5-coder:1.5b و3b صراحةً
.\\scripts\\bootstrap.ps1 -CreateBrains # ينشئ omega-* من Modelfile.* صراحةً
```

```bash
# Linux / macOS
sh scripts/bootstrap.sh
sh scripts/bootstrap.sh --pull-models
sh scripts/bootstrap.sh --create-brains
```

السكربتات تتحقق من Node ≥ 20 ومن اتصال Ollama على `OLLAMA_HOST` (الافتراضي `http://127.0.0.1:11434`)، تنفّذ `npm install` و`npm run doctor` و`npm run check`، ثم تطبع `OMEGA_LOCAL_FIRST=1 npm run dev`. لا تغيّر PATH ولا تحتوي أسراراً. v4 يضبط تحسينات Ollama داخل العملية (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_KEEP_ALIVE=15m`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`) ويطبع إرشادات وضع نماذج Piper في `models/piper/`.

## روتين يومي (قبل 시작 العمل)

1. شغّل `npm run check` — يجب أن ينتهي بـ exit 0 و`critical: 9/9 passed`.
2. راجع سطر `Last backup < 7 days` في جدول doctor؛ إن تجاوز 7 أيام نفّذ `npm run backup`.
3. شغّل `ollama list` وتأكد من وجود `qwen2.5-coder:1.5b`.
4. ابدأ `npm run dev` وأبقِه في الخلفية أثناء العمل.
5. عند إنهاء العمل نفّذ `npm run backup` قبل إغلاق الجهاز.

## جدولة النسخ الاحتياطي عبر Task Scheduler (Windows)

1. افتح "Task Scheduler" → Create Basic Task.
2. الاسم: `GenesisOmega-DailyBackup`، الوصف: `نسخ حالة الاستوديو يومياً`.
3. Trigger: Daily، الساعة 23:00 (أو قبل إيقاف الجهاز بساعة).
4. Action: Start a program.
5. Program: مسار `npm.cmd` الكامل، مثال: `C:\Program Files\nodejs\npm.cmd`.
6. Arguments: `run backup`.
7. Start in: `E:\genesis-omega-autonomous-software-studio`.
8. في تبويب Conditions: شغّل فقط عند اتصال التيار الكهربائي إن كان جهازاً محمولاً.
9. في تبويب Settings: فعّل "Run task as soon as possible after a scheduled start is missed".
10. تحقق يدوياً بـ "Run" ثم راجع أحدث مجلد داخل `backups/`.

## الاحتفاظ (Retention)

- السقف 30 نسخة، يطبّقه `scripts/backup.ts` بعد كل إنشاء.
- التسمية `YYYY-MM-DD-HHmmss` تجعل الترتيب المعجمي مساوياً للترتيب الزمني.
- أول 29 نسخة من القائمة بعد استبعاد الأحدث تُحذف؛ لا حاجة لتدخل يدوي.
- إن أردت أرشفة طويلة المدى، انسخ مجلداً واحداً إلى وسيط خارجي قبل أن يُحذف.

## مراقبة الصحّة

| الفحص | مصدره | ماذا يعني الفشل |
|---|---|---|
| Node >= 20 | `process.versions.node` | بيئة تشغيل قديمة |
| llama-cli / Ollama | `ollama --version` | لا يوجد محرك استنتاج محلي |
| qwen2.5-coder:1.5b | `ollama list` | النموذج غير محمّل |
| مساحة >= 5GB | `statfsSync` | لا مجال للنسخ والعمل |
| .env + OLLAMA_HOST | ملف `.env` | التوليد المحلي غير مُهيّأ |
| أنماط .gitignore | `.gitignore` | خطر تتبع أسرار أو نماذج ضخمة |
| فحص الأسرار | `check-secrets.ts` | مفتاح مرشح داخل git |
| عمر النسخة | مجلد `backups/` | لا توجد نقطة استعادة حديثة |
| Piper AR/EN | `OMEGA_PIPER_MODEL_AR` / `OMEGA_PIPER_MODEL_EN` أو `models/piper/ar_*.onnx` و`en_*.onnx` | يبقى Web Speech بديلاً |
| STT محلي | `OMEGA_WHISPER_BIN` أو `OMEGA_VOSK_MODEL` | `503 STT_NOT_CONFIGURED`، المتصفح يتولى التفريغ |

## استكشاف الأخطاء

- `SECRETS_FOUND` → افتح السطر المذكور في المخرج، احذف القيمة، أعد `npm run check:secrets`.
- `EPERM` أثناء restore → أُصلح في `restore.ts` بمنح صلاحية كتابة مؤقتة.
- `INSECURE_BINDING` (غير مطبّق حالياً كفحص آلي) → تأكد أن `HOST=127.0.0.1` في `.env`.
- `page reload` أثناء توليد مشروع → تأكد أن `vite.config.ts` يستبعد `**/data/**`.

## حدود التشغيل

- الخادم افتراضياً يربط على 127.0.0.1 فقط؛ `binding_guard.ts` يرفض 0.0.0.0 بلا `OMEGA_API_KEY`.
- rate limit مطبّق على `/api/projects` و`/api/voice/*` و`/api/solutions/generate` بـ 120/دقيقة؛ يمكن تضييقه بـ `OMEGA_RATE_LIMIT_MAX`.
- بقية مسارات `/api/*` و`/sandbox/*` غير محدودة؛ لا تعرض المنفذ للشبكة.
- `/api/projects/:id/sandbox/start` يشغّل العملية داخل Job Object على Windows؛ الإيقاف يقتل الأبناء تلقائياً.
- على Linux/macOS يفشل بـ `SANDBOX_UNAVAILABLE` لأن تغليف bwrap/sandbox-exec غير مطبّق بعد.
- العزل يغطي دورة حياة العملية، لا سياسة وصول للملفات أو الشبكة — راجع `LIMITATIONS.md`.
