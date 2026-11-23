# خارطة طريق GENESIS-OMEGA
### النسخة الشخصية الحصرية — المهندس **بشار**

> هذه الوثيقة مملوكة و executable بواسطة **المهندس بشار** وحده.
> دورك: المهندس المنفرد (Solo Engineer) — المالك، المطوّر، المُختبر، والناشر.
> الذكاء الاصطناعي (أنا) يعمل كمساعد تنفيذي تحت إشرافك؛ القرار النهائي لك دائماً.

---

## 0. الافتراضات الشخصية (عدّلها إن اختلفت)

| العنصر | الافتراض الحالي | للتعديل |
|---|---|---|
| متاح أسبوعياً | ~10–12 ساعة (5 أيام × ساعتين) | عدّل الجدول في القسم 7 |
| الهدف الأساسي | تسليم منتج مستقر قابل للنشر + إتقان المعمارية | إن كان هدفك تعلّمياً، ركّز على القسم 8 |
| تاريخ الانطلاق | الأحد 22 نوفمبر 2026 | — |
| الأفق الزمني | 8 أسابيع (حتى 17 يناير 2027) | — |
| مستوى الألفة بالـ TypeScript | متوسط–متقدم | — |
| النشر النهائي | Docker + reverse proxy + OMEGA_API_KEY | — |

> أرسل لي أي تعديل على هذا الجدول وأُحدّث الوثيقة فوراً.

---

## 1. مبادئك الحاكمة (Bashar's Rules)

1. **لا تغيير بلا تحقق:** أي تعديل كود يُتبع بـ `npm test` و`npm run lint` في نفس الجلسة.
2. **الحقيقة من التشغيل لا من الوعود:** أؤمن بمقولة المشروع نفسها — لا أرقام اختبارات مُختلقة، ولا benchmark sans قياس حقيقي.
3. **الأمان قبل الميزة:** أي ميزة جديدة تمر على `security.ts` و`isSafeRelativePath` قبل الدمج.
4. **دورة مغلقة:** كل مشكلة تُكتشف تُسجَّل في `OMEGA_REPORT.md` وتُعالَج عبر `healer.ts` أو بيدك، ثم تُعاد إعادة التحقق.
5. **الوثيقة هي الذاكرة:** تحدّث هذا الملف بعد كل مرحلة — أنت لست مضطراً لتذكّر التفاصيل.

---

## 2. أهدافك الشخصية (KPIs بنهاية الأسبوع 8)

> **تحديث 22 نوفمبر 2026 — اكتملت المرحلة 0 والمرحلة 1 بواسطة بشار.**
> الالتزامات: `8b70564` (الهوية)، `55732f9` (توثيق المرحلة 0)، `6181f85` (اختبارات المرحلة 1).
> الكتالوج المحلي (34 نموذجاً) وعميل Ollama أُنجزا قبل المرحلة 0.

| # | الهدف | مقياس النجاح | الحالة |
|---|---|---|---|
| K1 | هوية المشروع نظيفة | `package.json` باسم `genesis-omega` وإصدار `1.0.0` | ✅ |
| K2 | معرّفات Gemini حقيقية | استبدال `gemini-4-*` بـ `gemini-3.8-flash` / `3.1-pro-preview` + `OMEGA_MODEL_*` | ✅ |
| K3 | تغطية اختبارات | `npm test` → 68/68 أخضر + 5 ملفات اختبار مخصصة | ✅ |
| K4 | CI يعمل | `ci.yml`: install + lint + test + build، و`npm run check` محلياً يشمل doctor | ✅ |
| K5 | جاهز للإنتاج | Dockerfile غير جذري + مصادقة إجبارية + rate limit | ⬜ |
| K6 | أداء متوقع | استبدال مخزن JSON بـ SQLite WAL | ⬜ |
| K7 | سجل شخصي | 8 أسابيع موثّقة في القسم 9 | ⬜ |

---

## 3. خريطة الملكية (من يفعل ماذا)

| المجال | بشار | الذكاء الاصطناعي (مساعدك) |
|---|---|---|
| القرارات المعمارية | ✅ يقرر ويوقع | يقترح البدائل مع الإيجاب/السلبي |
| كتابة الكود | ✅ يراجع ويعتمد | يولّد المسودة والاختبارات |
| التحقق والاختبار | ✅ يشغّل ويقرأ النتائج | يفسّر الفشل ويقترح الرقعة |
| الأمان والنشر | ✅ المُشغّل الوحيد | يجهّز الأوامر ويتحقق من الآثار الجانبية |
| التوثيق | ✅ صاحب الكلمة الأخيرة | يكتب المسودة بصوتك |

---

## 4. المرحلة 0 — الأساس باسمك (الأيام 1–2 · P0)

### 4.1 إعادة الهوية ✅
- [x] تعديل `package.json`: `"name": "genesis-omega"`, `"version": "1.0.0"`, `"author": "Bashar"`, `"description"`.
- [x] `metadata.json` يعكس الاسم الجديد بالفعل.
- [x] قسم Quick Start أُضيف أعلى `README.md` باسمك.
- [x] `package-lock.json` وُلّد ليعمل `npm ci` في CI.

**أمر التحقق:**
```bash
npm run lint && npm test
```

**معايير القبول:** لا أخطاء TypeScript، كل الاختبارات تمر، الاسم الجديد ظاهر في `/api/status`.

### 4.2 تصحيح عقود النماذج ✅
- [x] مراجعة وثائق Gemini الرسمية عبر Context7: `gemini-3.8-flash-lite-tts` و`gemini-3.5-transcribe` كانا صحيحين؛ `gemini-4-*` كانت معرّفات وهمية.
- [x] الاستبدال بـ `gemini-3.8-flash` (سريع)، `gemini-3.1-flash-lite` (خفيف)، `gemini-3.7-flash` (متوازن)، `gemini-3.1-pro-preview` (عميق).
- [x] تجميعها في `src/lib/gemini_models.ts` مع 7 متغيرات `OMEGA_MODEL_*`، و`src/lib/runtime_env.ts` الآمن للمتصفح.
- [x] `/api/status` يعرض المعرّفات الجديدة فعلياً.

**معايير القبول:** تحققت عبر الوثائق + `tsc` + 53 اختباراً + فحص واجهة المتصفح (صفر أخطاء console). اختبار TTS/transcribe بمفتاح حقيقي يبقى معلّقاً حتى يتوفر `GEMINI_API_KEY`.

> درس مستفاد: `routing.ts` يُستورد من الواجهة، لذا أي `process.env` فيه يكسر Vite — كل القراءات تمر الآن عبر `runtimeEnvValue()`.

### 4.3 المشروع تحت Git ✅
- [x] `git init` + `git config user.name "Bashar"`.
- [x] `.gitignore` يغطي `data/`, `dist/`, `.aistudio/`, `models/`, `voices/`, `.env*`.
- [x] أول commit فعلي: `8b70564 chore: establish genesis-omega v1.0.0 (Bashar)` — 60 ملفاً.

---

## 5. المرحلة 1 — الثقة والجودة (الأسبوع 2 · P0)

- [x] `.github/workflows/ci.yml`: `npm ci --ignore-scripts && npm run lint && npm test && npm run build` (استُبدل `doctor` بـ `build` لأن doctor يفحص أدوات Non-TypeScript غير متوفرة على CI).
- [x] اختبارات وحدات جديدة: `sandbox_runner.test.ts` (3)، `watcher.test.ts` (2)، `export_fs.test.ts` (1)، `routing.test.ts` (3)، `store_schema.test.ts` (2).
- [x] مخطط Zod في `src/lib/store_schema.ts` يستدعيه `loadStore()` في `server.ts` قبل استخدام أي حقل.

**معايير القبول:** `npm run check` → exit 0، `npm test` → 68/68، الخادم يعيد التحميل ويقرأ 8 مشاريع بعد التحقق.

---

## 6. المرحلة 2 — الأمان قبل النشر (الأسبوع 3 · P0) 🔴

- [x] `HOST=127.0.0.1` — نُفّذ في المرحلة 0 (`server.ts:104`, `.env`, `.env.example`).
- [x] backup/restore — نُفّذ في المرحلة 0 مع استعادة موثّقة في `RECOVERY.md`.
- [x] حارس `INSECURE_BINDING` يمنع الربط العام بدون مفتاح — اختبار فعلي: `HOST=0.0.0.0` → exit 1.
- [x] rate limit على `/api/projects`, `/api/voice/*`, `/api/solutions/generate` — تحقق فعلي: 200، 200، ثم 429.
- [x] عزل OS فعلي على Windows: Job Object + `CREATE_BREAKAWAY_FROM_JOB` + `KILL_ON_JOB_CLOSE`.
- [x] رفض التشغيل بدون عزل: `SANDBOX_UNAVAILABLE` صريح عند فشل المشرف.
- [x] تحقق فعلي: `spawnIsolated` التقط stdout من عملية معزولة، واختبار المتحقق الحي نجح (16/16، صفر تخطٍ).
- Docker وdocker-compose **مؤجلان** في `BACKLOG.md` بقرار صريح؛ لا يُعاد إدراجهما هنا.

**معايير القبول:** المنفذ 3000 غير مكشوف للعالم بدون مفتاح ✓، فحص الأسرار 0 تسريب ✓، عزل OS ✓ (دورة حياة العملية).

---

## 7. المرحلة 3 — التوسّع (الأسبوع 4–5 · P2)

- [x] نقل المتجر إلى SQLite WAL عبر `src/lib/store_repository.ts` مع مرآة JSON للتوافق مع backup/restore.
  - دليل فعلي: `journal=wal`, `projects=8`, `vault=3`, `watches=2` من `data/omega_store.db`.
  - 3 اختبارات: WAL، هجرة JSON، إعادة استيراد بعد restore، رفض مرآة تالفة.
- [x] بثّ مباشر عبر `/api/events` (SSE) و`src/lib/event_bus.ts`؛ `App.tsx` يشترك بدل التحديث المتكرر.
  - دليل حي: `event: ready` ثم `event: state` بعد كل عملية تعديل (حالتا state مُلاحظتان).
  - 4 اختبارات event bus + بث SSE فعلي عبر http.
- [x] طابور worker عبر `src/lib/job_queue.ts` + `POST /api/jobs` و`GET /api/jobs/:id`.
  - دليل حي: `jobId=1` انتقل إلى `done` وأنشأ المشروع `#9` (97/100, verified)، وعدد المشاريع 8←9.
  - أحداث `event: job` ظهرت 3 مرات على SSE (queued/running/done).
  - 3 اختبارات: تسلسل بلا تداخل، فشل لا يوقف الطابور، أحداث الحالة.

**معايير القبول:** إنشاء مشروع مع 24 نطاقاً لا يسبب timeout، والسجلات تظهر لحظياً.

---

## 8. المرحلة 4 — التمييز الشخصي (الأسبوع 6–8 · P2/P3)

- [x] لوحة قياسات `DashboardView` من `dashboard_metrics.ts` — أشرطة CSS بلا مكتبة رسوم.
  - دليل حي من الواجهة: 10 مشاريع، 9 مُتحقّقة، متوسط 95.5/100، 103 اختبار، 503 RPS، توزيع python:8/go:1/cobol:1.
  - 3 اختبارات تجميع نقية (حالة فارغة، تجميع، قياسات/إصلاح).
- [x] تصدير PDF عبر `@media print` + زر `window.print()` في `report/html`، ورابط «حفظ PDF» بـ `?print=1`.
  - دليل حي: `has_print_button=True`, `has_media_print=True`, `has_title=True`.
  - حد صريح: PDF يولّده محرك طباعة المتصفح، لا مولّد PDF أصلي — انظر `LIMITATIONS.md`.
- [x] مفتاح لغة عربي/إنجليزي عبر `i18n.ts` + زر في `TopNav` + حفظ في `localStorage`.
  - دليل E2E: التبديل إلى `Production line` ثم `Dashboard` ثم العودة إلى `خط الإنتاج`، و`dir=ltr` أثناء الإنجليزية.
- [x] اختبار Playwright E2E — `e2e/studio.spec.ts` + `playwright.config.ts`، 5/5 ناجح على chromium.

---

## 9. الجدول الأسبوعي لبشار (8 أسابيع)

| الأسبوع | التركيز | المخرج القابل للتسليم |
|---|---|---|
| 1 | المرحلة 0 | v1.0.0 مُسمّى بـ Bashar + Git |
| 2 | المرحلة 1 | CI أخضر + اختبارات موسّعة |
| 3 | المرحلة 2 | ربط آمن + rate limit + عزل Job Object (بلا Docker) |
| 4 | المرحلة 3 (SQLite ✅) | `omega_store.db` بـ WAL + مرآة JSON |
| 5 | المرحلة 3 (SSE + طابور) | سجلات لحظية + لا timeouts |
| 6 | المرحلة 4 (لوحة + PDF) | Dashboard |
| 7 | المرحلة 4 (E2E) | 5 اختبارات Playwright + لوحة + PDF |
| 8 | مراجعة نهائية | إصدار 1.0.0 جاهز للنشر + توثيق |

### روتينك اليومي (ساعتان)
```
20 د  مراجعة سجل الإنجازات + اختيار مهمة واحدة من القائمة
60 د  تنفيذ المهمة (أنا أوبّخ المسودة، أنت تراجع وتعتمد)
20 د  npm test + npm run lint
20 د  تحديث هذه الوثيقة + كتابة ما تعلّمته
```

---

## 10. مسارك الشخصي في إتقان المعمارية

خلال التنفيذ، ركّز على فهم هذه الملفات بعمق (هي جوهر المشروع):
1. `server.ts` — خط الأنابيب وكيف تُرسم القرارات.
2. `verifier.ts` + `healer.ts` — فلسفة "التحقق الحقيقي" والتحسين المُقاس.
3. `security.ts` + `watcher.ts` — حماية الحدود بين النظام والمستخدم.
4. `piper_tts.ts` + `cognitive.ts` — الواجهة الصوتية كمنتج لا كإضافة.

---

## 11. سجل إنجازات بشار (املؤه بعد كل أسبوع)

| الأسبوع | ما أنجزته | ما تعلّمته | عائق واجهك | القرار المتخذ |
|---|---|---|---|---|
| 1 | — | — | — | — |
| 2 | — | — | — | — |
| 3 | — | — | — | — |
| 4 | — | — | — | — |
| 5 | — | — | — | — |
| 6 | — | — | — | — |
| 7 | — | — | — | — |
| 8 | — | — | — | — |

---

## 12. مخاطر شخصية وتخفيفها

| الخطر | التأثير | التخفيف |
|---|---|---|
| أنت نقطة فشل وحيدة (Bus factor = 1) | توقف المشروع بغيابك | وثّق كل قرار في هذه الوثيقة و`README` |
| الإرهاق من مهام الأمان | ملل وانقطاع | روتين الساعتين + مكافأة أسبوعية (مراجعة الإنجاز) |
| ثقة عمياء في مخرجات الذكاء الاصطناعي | أخطاء صامتة | "لا تغيير بلا تحقق" — القاعدة رقم 1 |
| نسيان أسماء النماذج الحقيقية | فشل صامت في TTS | أدرجها في اختبار CI (المرحلة 1) |

---

## 13. خطة الشركة البرمجية — الحالة الآن

الشركة هنا تعني **نظاماً قابلاً للتدقيق والتكرار**، لا فريقاً ولا نشراً سحابياً. الأساس جاهز:

| الركن | الحالة | الدليل |
|---|---|---|
| هوية وإصدار | ✅ | `package.json` → `genesis-omega@1.0.0`, author `Bashar` |
| مستودع وتاريخ | ✅ | 8 التزامات حتى الآن، آخرها `hardening: ...` |
| بوابات جودة | ✅ | `npm run check` → `critical 9/9`, `npm test` → 82/82 |
| أمان حدودي | ✅ | `INSECURE_BINDING`, rate limit, check-secrets, Job Object |
| نسخ واستعادة | ✅ | `RECOVERY.md` → `last successful restore: 2026-11-22` |
| توثيق | ✅ | 15 ملفاً (منها `INVENTORY.md` — جرد بالأوامر) |
| CI | ✅ | `ci.yml`: lint + test + `doctor --ci` + build |
| إثبات تسليم خارجي | ⬜ | `PROOF.md` — لا مستلم بعد |

### الخطوات التالية بترتيب صارم (واحدة في كل جلسة)

1. ~~**المرحلة 3أ** — مخزن SQLite WAL مع طبقة repository واختبار هجرة.~~ ✅ منجز.
2. ~~**المرحلة 3ب** — بث SSE بدل `hydrateAll()`.~~ ✅ منجز (`/api/events`).
3. ~~**المرحلة 3ج** — طابور worker بمعرّف مهمة وحالة.~~ ✅ منجز.
4. ~~**المرحلة 4أ** — لوحة قياسات من `/api/status` و`/api/projects`.~~ ✅ منجز (`DashboardView`).
5. ~~**المرحلة 4ب (PDF)**~~ ✅ منجز عبر طباعة المتصفح. E2E ولغة ثانية مؤجلان بقرار موثّق.
6. ~~**ربط `llama-bridge` بخط الإنتاج**~~ ✅ منجز عبر `local_synthesis.ts` واختيار في `server.ts` — **دون لمس `ai_pipeline.ts`**.

**قاعدة:** لا تُبدأ خطوة قبل أن يمر `npm run check` ويُحدَّث `INVENTORY.md` والالتزام في نفس الجلسة. Docker و24 نطاقاً ونشر سحابي مؤجلة بقرار في `DECISIONS.md` و`BACKLOG.md`.

## 14. الخريطة الكاملة والحقيقية بعد الإصلاحات

### 14.1 حالة المراحل

| المرحلة | الحالة | المخرج الموثّق |
|---|---|---|
| 0 — الأساس | ✅ | هوية `genesis-omega@1.0.0`، Git، 15 ملف توثيق، backup/restore، doctor، check-secrets |
| 1 — الثقة | ✅ | CI: lint + test + `doctor --ci` + build؛ 22 ملف اختبار |
| 2 — الأمان | ✅ | `INSECURE_BINDING`، rate limit، Job Object مع `CREATE_SUSPENDED`، فحص أسرار 0 |
| 3أ — المخزن | ✅ | `omega_store.db` بـ WAL + مرآة JSON، هجرة وإعادة استيراد مُختبرتان |
| 3ب — البث | ✅ | `/api/events` SSE: ready/state/job + heartbeat |
| 3ج — الطابور | ✅ | `POST /api/jobs`، states مرئية، عامل تسلسلي واحد |
| 4أ — اللوحة | ✅ | `DashboardView` بـ CSS خالص من `dashboard_metrics.ts` |
| 4ب — PDF | ✅ | `@media print` + `window.print()` + رابط `?print=1` |
| 5 — ربط الجسر المحلي | ✅ | `local_synthesis.ts`، `engine=ollama-local` حياً، `ai_pipeline.ts` لم يُلمس |
| 4ج — E2E | ✅ | 11 اختبارات Playwright حقيقية (`npm run test:e2e`) |
| 5 — الحوار الصوتي | ✅ | `VoiceHud` + `voice_dialogue` + STT محلي + Piper ثنائي اللغة |
| 4د — لغة إنجليزية | ✅ | `i18n.ts` + زر تبديل + اختبار E2E |

### 14.2 خريطة الملفات (128 ملف متتبع)

| المسار | Count | الوظيفة |
|---|---|---|
| `server.ts` | 1 | Express + كل المسارات + SSE + طابور المهام + خط الإنتاج + الحوار الصوتي |
| `src/App.tsx` + `main.tsx` + `index.css` | 3 | إدارة الواجهة والتنقل والبث المباشر |
| `src/components/` | 12 | Studio / Dashboard / Vault / Watch / Migration / Catalog / Export / HUD / VoiceHud / Nav / Auth / Enterprise |
| `src/lib/` | 73 | وحدات إنتاج + 28 اختباراً + `i18n.ts` بـ 469 مفتاحاً + `voice/` (4) |
| `scripts/` | 8 | backup / restore / doctor / check-secrets / Job Object / bootstrap.ps1 / bootstrap.sh / vosk adapter |
| `.github/workflows/ci.yml` | 1 | بوابات CI الأربع |
| جذر المشروع | 27 | توثيق + LICENSE + CONTRIBUTING + إعدادات + مرآة المتجر + حزمة التأمينات |

### 14.3 الخوارزميات الصحيحة المطبّقة

| المشكلة | الحل | الدليل |
|---|---|---|
| سباق التفريخ قبل الإسناد | `CREATE_SUSPENDED` ثم `ResumeThread` بعد `AssignProcessToJobObject` | اختبار قتل الأحفاد ناجح |
| ACCESS_DENIED عند الإسناد اللاحق | `CREATE_BREAKAWAY_FROM_JOB` وإنشاء العملية داخل الـ Job | `ATTACHED alive=True` |
| قفل ملفات السجل | `FILE_SHARE_READ\|FILE_SHARE_WRITE` + `bInheritHandle` | التقاط `ALIVE` من stdout |
| فقدان الحالة عند الاستعادة | مرآة JSON + مقارنة hash عند الإقلاع | اختبار `Restored JSON` |
| تضخم الذاكرة في limiter | تقليم دوري كل 128 فحص | `rate_limit.test.ts` |
| تداخل التوليد الثقيل | طابور أحادي العامل | `maxInFlight=1` |
| توليد محلي بلا قفل | `local_synthesis.ts` يمر عبر `llama-bridge` لا عبر عميل مباشر | `engine=ollama-local` للمشروع #11 |

### 14.4 البوابات والأوامر

```
npm run lint        → tsc --noEmit
npm test            → 125 pass / 0 fail / 0 skipped
npm run check       → lint + test + check:secrets + doctor = exit 0
npm run doctor      → critical 9/9
npm run doctor -- --ci → 4/4 مُنفَّذ + 5 مُعلَن تخطيها
npm run backup      → MANIFEST + retention 30
npm run restore -- <dir> --yes → RESTORE_OK
```

### 14.5 ما لا يُعدّ منجزاً عن قصد

- عزل الشبكة/الملفات داخل الـ Job (دورة الحياة فقط).
- مولّد PDF أصلي (الطباعة تتم في المتصفح).
- لا شيء من بنود الخارطة متبقٍ؛ المؤجلات خارج الخارطة موثّقة في `BACKLOG.md` و`DECISIONS.md`.
- Docker و24 نطاقاً ونشر سحابي (قرار `DECISIONS.md`).
- إثبات تسليم خارجي (`PROOF.md` فارغ من التسليم).

## 15. v2.0 — Autonomous Software House (خارطة جديدة)

الانتقال من استوديو توليد إلى شركة برمجيات محلية بالكامل، فوق خط الأساس `0b0d1b5`، دون لمس `ai_pipeline.ts`.

| المرحلة | الحالة | الوحدات |
|---|---|---|
| **1 — العقول المحلية وفهرس المستودعات** | ✅ منجزة | `brains/brain_registry.ts` · `brains/repo_indexer.ts` · `brains/surgical_patcher.ts` + 4 اختبارات |
| **2 — محرك الشركة والأقسام العشرة** | ✅ منجزة | `enterprise/departments.ts` · `enterprise/work_order_engine.ts` · `EnterpriseView.tsx` + 4 اختبارات |
| 3 — صيانة المشاريع القائمة | ✅ منجزة | `enterprise/repo_ingest.ts` · `local_synthesis.synthesizeTextWithBridge` · لوحة الصيانة في `EnterpriseView.tsx` |
| 4 — الجاهزية مفتوحة المصدر | ✅ منجزة | `LICENSE` · `CONTRIBUTING.md` · `SECURITY.md` · `scripts/bootstrap.ps1/.sh` · شلّ ثنائي اللغة بالكامل · 10 اختبارات E2E |
| 5 — الحوار الصوتي ثنائي اللغة | ✅ منجزة | `voice/voice_dialogue.ts` · `voice/offline_stt.ts` · `VoiceHud.tsx` · 10 اختبارات + E2E حواري |

**ما أُنجز فعلياً في المرحلة 1:**
- 4 ملفات عقول (`architect`, `coder`, `healer`, `auditor`) ببارامترات حتمية (temperature 0.05–0.25، num_ctx 4096–8192) وعقود نظام، مع اختيار نموذج Ollama مثبّت فقط — لا معرّف سحابي واحد.
- فهرس رموز حقيقي بلا تبعيات يغطي TS/JS وPython وGo وRust وC/C++ وJava وC# مع نطاقات أسطر وميزانية رموز `formatIndexForPrompt`.
- ترقيع جراحي `SEARCH/REPLACE` بحماية مسارات، تفريق حالة غموض، تحقق JSON/أقواس، وتراجع ذري للدفعة كاملة.
- اختبار يقرأ ملفات الوحدات الثلاثة ويؤكد خلوّها من أي client سحابي.

**ما أُنجز فعلياً في المرحلة 2:**
- 10 أقسام هندسية بعقود وبوابات تحقق صارمة وتصنيف حتمي (كلمات مفتاحية موزونة + مطابقة رموز كاملة لمنع `ui` من مطابقة `fluid`)، وربط كل قسم بدور عقل محلي.
- آلة حالة persisted لـ أوامر العمل: `BACKLOG → SPEC_BLUEPRINT → IMPLEMENTATION → OS_VERIFICATION → SECURITY_AUDIT → SELF_HEALING → VERIFIED_COMMIT` مع `FAILED_CLOSED` يسجّل رمز الخطأ والمرحلة.
- كل انتقال يُحفظ في SQLite (meta key `workOrders`) ويُبث عبر موضوع `work_order` على `/api/events`؛ المسارات: `GET/POST /api/enterprise/work-orders` و`GET /api/enterprise/work-orders/:id` و`POST .../:id/run` و`GET /api/enterprise/departments`.
- التحقق من مسار الكتابة داخل مساحة العمل (`isSafeRelativePath` + فحص الانزلاق)، وفحص أسرار حقيقي `scanSecretsAndSecurity`، ودورة شفاء حقيقية عبر `healProject` ثم إعادة تحقق — بلا أي fallback سحابي.
- 4 اختبارات: دقة التصنيف، تقدم كامل بتحقق OS حقيقي (`node --check`)، فشل مغلق لخطأ الجسر (`MODEL_NOT_FOUND`)، ورفض مسار `../` قبل أي كتابة. E2E أصبح 8/8 (و10/10 بعد المرحلتين 3 و4).

**ما أُنجز فعلياً في المرحلة 3:**
- استيعاب مستودع قائم بقراءة فقط: رفض جذور النظام و`..` والمسارات النسبية غير الآمنة قبل أي قراءة، مشي محدود (4000 ملفاً/96MB) بلا تتبّع symlink، ومانيفست SHA-256 لكل ملف، مع نسخة معزولة مؤقتة تُحذف دائماً في `finally`.
- تدقيق أساس حقيقي: تنفيذ OS فعلي للتحقق (`node --check`…) + فحص أسرار/ثغرات ساكن عبر `scanSecretsAndSecurity` + درجة من `computeHealingScore`، وكل مرحلة تُبث على موضوع `ingest` في `/api/events`.
- تطوّر/تحصين ذرّي: ترقيع `SEARCH/REPLACE` من الجسر المحلي (فشل مغلق بلا سحابة) يُطبَّق داخل النسخة المعزولة فقط، ثم تحقق OS وإعادة فحص وشفاء حقيقي عبر `healProject`، وبوابة ترقية ترفض أي انخفاض درجة أو سرّ جديد أو تراجع اختبارات — وإلا تبقى الملفات الأصلية ببايتاتها الحرفية.
- المسارات: `POST /api/enterprise/ingest` (تدقيق) و`POST /api/enterprise/ingest/evolve` (مع `harden-only`/`develop-feature`/`full-evolve` وcommit اختياري) و`GET /api/enterprise/ingest/runs` (20 عملية محفوظة في meta `ingestRuns`)، مع لوحة صيانة في `EnterpriseView.tsx` تعرض المراحل المباشرة وسجل العمليات.
- 6 اختبارات وحدة تعمل على مستودعات حقيقية: حارس المسار، مانيفست SHA-256 وتدقيق أساس بتشغيل `node --test` فعلي، ترقية ذرّية تحسّن الدرجة مع فحص بايتات الملفات غير المعدّلة، فشل مغلق عند تراجع الاختبارات أو `TIMEOUT` الجسر، وسجل تدقيق persists مع رفض جذور النظام. E2E التاسع ينفّذ تدقيقاً حقيقياً ويرفض `C:\Windows\System32` بـ 400 ويعرض اللوحة.

**ما أُنجز فعلياً في المرحلة 4:**
- حوكمة:`LICENSE` (MIT باسم بشار باسل المدلل، 2026)، `CONTRIBUTING.md` (خريطة معمارية، قاعدة عدم تعديل `ai_pipeline.ts`، سياسة محلية/فشل مغلق، بوابة `tsc`/`npm test`/`npm run test:e2e`/`npm run check`، قائمة PR)، وتوسيع `SECURITY.md` بنموذج التهديد المحلي وحواجز المسارات والبيئة المعقّمة والمصادقة والإبلاغ عن الثغرات.
- تهيئة صفرية عبر `scripts/bootstrap.ps1` (Windows 5.1/7+) و`scripts/bootstrap.sh` (POSIX): تحقق Node≥20، فحص Ollama على `OLLAMA_HOST` (الافتراضي `http://127.0.0.1:11434`)، `npm install`، `npm run doctor` لتقرير 18 بيئة، ثم `npm run check` وطباعة `OMEGA_LOCAL_FIRST=1 npm run dev`. سحب النماذج (`qwen2.5-coder:1.5b` و`3b`) لا يحدث إلا بعلم صريح (`-PullModels`/`--pull-models`)؛ لا PATH ولا أسرار في السكربتات.
- شلّ ثنائي اللغة بنسبة 100%: 425 مفتاحاً في `i18n.ts` تغطي كل العروض والأزرار والحقول والحالات الفارغة والتلميحات (Studio، Export، HUD، Catalog، Watch، Vault، Migration، Auth، Enterprise، Dashboard) مع `dir` و locale ديناميكيين. اختبار E2E عاشر يبدّل اللغة عبر كل العروض بما فيها أوامر الشركة وصيانة المستودعات.
- توثيق متزامن: `INVENTORY.md` (122 ملفاً، 27 ملف اختبار، 115 حالة، 10 E2E)، `ARCHITECTURE.md`، `LIMITATIONS.md`، `OPS.md`، `README.md` مع أوامر التهيئة ومسارات `/api/enterprise/*`.

**ما أُنجز فعلياً في المرحلة 5:**
- `src/lib/voice/voice_dialogue.ts`: كشف لغة المتحدث بـ Unicode حتمي، توجيه نوايا عربي/إنجليزي إلى أوامر عمل حقيقية (`WorkOrderEngine`)، وتدقيق/تحصين مستودعات بعد `validateRepoRoot`، وإصلاح ذاتي، وتبديل لغة، وحالة أدوات، وملخص أوامر. الحوار العام يمر عبر `synthesizeTextWithBridge()` → `llama-bridge.generate()` ببرنامج نظام بلغة المتحدث، `numCtx/numPredict` محدودين، 60 ثانية، AbortSignal، وأكواد خطأ صريحة بلا سحابة.
- Piper ثنائي اللغة: `OMEGA_PIPER_MODEL_AR`/`OMEGA_PIPER_MODEL_EN` مع اكتشاف `ar_*`/`en_*`، اختيار النموذج حسب `lang`، تخزين WAV بـ SHA-256 يشمل اللغة والنموذج، وتطهير بيئة العملية الفرعية من مفاتيح `API_KEY/TOKEN/SECRET/PASSWORD/AUTH`.
- `POST /api/voice/converse` ينفّذ الحوار، يولّد Piper WAV إن توفر، ويبث حدث `voice` على `/api/events`. `POST /api/voice/transcribe` محلي فقط (Whisper/Vosk) بسقف 8MB وملفات مؤقتة تُحذف، و`503 STT_NOT_CONFIGURED` عند غياب المحرك. `/api/status` يعرض `voice.offline_stt_ready` و`voice.bilingual_tts`.
- `VoiceHud.tsx`: اختيار `Auto/العربية/English`، Push-to-Talk ومحادثة مستمرة، Barge-In يوقف الصوت ويُلغي الطلب، مؤشرات الحالة والمحرك، سجل الحوار، وحقل نص بديل؛ كل التسميات في `i18n.ts` (469 مفتاحاً).
- 10 اختبارات صوتية + E2E حادي عشر يجري جولة عربية وإنجليزية فعلية عبر `/api/voice/converse` ويتحقق من بث `voice`.

**التالي:** لا مرحلة تالية في خارطة v2.0 — الإصدار جاهز للمراجعة النهائية؛ أي عمل جديد يُسجَّل أولاً في `BACKLOG.md` بقرار وتاريخ.

**التوقيع:** المهندس بشار — owner & executor
**آخر تحديث:** 23 نوفمبر 2026

> الوثيقة المرجعية للحالة الآن: `INVENTORY.md`. خطة التشغيل: `OPS.md`. الحدود: `LIMITATIONS.md`.
