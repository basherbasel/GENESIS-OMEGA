# ARCHITECTURE — بنية استوديو GENESIS-OMEGA

هذه الوثيقة تصف البنية كما هي الآن على القرص، لا كما تُخطَّط. كل سطر أدناه مقابل ملف أو مجلد موجود فعلياً.

## شجرة المجلدات

```
genesis-omega/
├── server.ts                  نقطة الدخول: Express + Vite middleware + كل مسارات /api و/sandbox.
├── LICENSE                    ترخيص MIT باسم بشار باسل المدلل (2026).
├── CONTRIBUTING.md            قواعد المساهمة، حظر ai_pipeline.ts، بوابة التحقق.
├── index.html                 شلّ تطبيق React (نقطة تحميل main.tsx).
├── package.json               الهوية genesis-omega@1.0.0، السكربتات، التبعيات.
├── vite.config.ts             إعدادات Vite + استثناء مراقبة data/ وdist/.
├── tsconfig.json              إعدادات TypeScript الصارمة.
├── metadata.json              بيانات منصة AI Studio (الاسم، الصلاحيات).
├── .env                       إعدادات محلية غير متتبعة (OLLAMA_HOST, HOST).
├── .env.example               قالب المتغيرات القابل للتتبع.
├── .gitignore                 يستبعد data/ وbackups/ وmodels/ و*.gguf و.env.
├── scripts/
│   ├── backup.ts              نسخة موقوتة مع MANIFEST وSHA-256 واحتفاظ 30.
│   ├── restore.ts             استعادة محقّقة من MANIFEST مع تأكيد صريح.
│   ├── doctor.ts              فحص تشغيلي بجدول [✓/✗] وexit 0/1.
│   └── check-secrets.ts       فحص git ls-files لأنماط بيانات سرية.
│   ├── bootstrap.ps1          تهيئة Windows: Node≥20، Ollama، npm install/doctor/check، سحب نماذج اختياري صريح.
│   └── bootstrap.sh           تهيئة POSIX: نفس البوابات بلا PATH changes ولا أسرار.
├── src/
│   ├── App.tsx                حالة الواجهة العامة والتوجيه بين العروض الستة.
│   ├── index.css              تنسيقات Tailwind والثيم الداكن.
│   ├── main.tsx               تحميل React في جذر DOM.
│   ├── components/            أحد عشر مكوّن واجهة (انظر القائمة أدناه).
│   ├── lib/                   وحدات المنطق (انظر القائمة أدناه).
│   ├── lib/brains/            عقول محلية وفهرس مستودعات وترقيع جراحي (v2.0).
│   └── lib/enterprise/        الأقسام العشرة وآلة حالة أوامر العمل وصيانة المستودعات (v2.0).
├── data/                      حالة التشغيل: omega_store.db (WAL) + مرآة omega_store.json + workspaces/exports/voice_cache.
├── backups/                   نسخ احتياطية موسومة بالطابع الزمني.
├── models.config.json         إعداد Ollama المحلي (النماذج والأدوار).
├── public/assets/aistudio/    أصول واجهة المنصة الأصلية.
├── playwright.config.ts       إعداد Playwright: webServer + chromium + baseURL.
├── e2e/studio.spec.ts         10 اختبارات E2E حقيقية (تنقل/لغة/لوحة/نموذج/SSE/أقسام/أمر عمل/PDF/صيانة مستودع/تبديل ثنائي لكل العروض).
└── .github/workflows/ci.yml   install + lint + test + doctor --ci + build.
```

## وحدات src/lib — سطر لكل وحدة

| الوحدة | الدور |
|---|---|
| ai_pipeline.ts | يوجّه التوليد إلى Ollama أو Gemini ويجمع الملفات المُولّدة بعد التحقق من المسارات. |
| apidocs.ts | يكتشف نقاط النهاية ويولّد OpenAPI وSwagger واختبارات mock. |
| auth.ts | جلسة HttpOnly ومقارنة ثابتة الزمن وخنق محاولات الدخول. |
| cognitive.ts | تحليل النبرة والنية واستخراج السمات من الحوار الصوتي. |
| diagrams.ts | مخططات ERD وتسلسل معمارية جاهزة للمشاريع المولّدة. |
| ecosystems.ts | كتالوج 18 بيئة لغوية وكشف اللغة من الامتدادات. |
| export.ts | يبني manifest حزمة التصدير ويُطهّر أوامر Git. |
| export_fs.ts | ي materialize الحزمة إلى القرص ويهيّئ مستودعاً محلياً. |
| gemini_models.ts | مصدر واحد لمعرّفات Gemini مع تجاوزات OMEGA_MODEL_*. |
| git_deploy.ts | ينفّذ init/add/commit/push ببيئة معقّمة وقائمة سماح بالremote. |
| healer.ts | دورة تشخيص→رقعة→تحقق حقيقي→قبول أو رفض. |
| legacy.ts | يكتشف COBOL/Pascal/Fortran ويولّد هجرة باختبارات تطابق. |
| local_models.ts | كتالوج 34 نموذجاً محلياً/مكمّماً مع توصية حسب الذاكرة. |
| local_synthesis.ts | توليد محلي عبر الجسر المحمي بفشل مغلق، دون أي استدعاء سحابي. |
| ollama_client.ts | عميل HTTP استنتاج محلي مع timeout وAbortSignal مدمجين. |
| llama-bridge.ts | single-flight mutex ورموز أخطاء صريحة وفشل مغلق بلا fallback. |
| offline_audio_player.ts | مشغّل صوت محلي للتجربة بدون إنترنت. |
| piper_tts.ts | محرك Piper العصبي غير المتصل وتخزين WAV بـ SHA-256. |
| routing.ts | توزيع الأدوار الستة على النماذج المحلية أو السحابية. |
| runtime_env.ts | قارئ متغيرات بيئة آمن للمتصفح والخادم معاً. |
| sandbox_runner.ts | يشغّل عملية المشروع المولّد على منفذ حر ويتحكم في دورة حياتها. |
| security.ts | فحص الأسرار والتراجع الذري وحارس المسارات وفاحص الأنماط الخطرة. |
| solution_catalog.ts | 24 نطاق حل emits حزمة كاملة قابلة للتحقق. |
| toolchain_doctor.ts | يفحص توفر أدوات الأنظمة والبيئات لكل لغة. |
| types.ts | العقود المشتركة: ProjectRecord وGovernorStats أنواع الواجهة. |
| dashboard_metrics.ts | تجميع نقي للدرجات والاختبارات والقياسات والإصلاح من ProjectRecord. |
| event_bus.ts | ناقل pub-sub داخلي وإطارات SSE لدفع تغييرات الحالة والمهام إلى الواجهة. |
| job_queue.ts | طابور worker تسلسلي بمعرّف وحالة وقبول/رفض للفشل بلا توقف. |
| store_repository.ts | مخزن SQLite WAL بواجهة load/save ومرآة JSON وهجرة تلقائية عند الاستعادة. |
| store_schema.ts | مخطط Zod يمنع تحميل متجر تالف قبل استخدام حقوله. |
| verifier.ts | يشغّل اختبارات نظام التشغيل الفعلية ويمنع أرقاماً مُختلقة. |
| watcher.ts | يراقب المجلدات ويقارن SHA-256 ويُطلق تدقيقاً عند التغيير. |
| `i18n.ts` | قاموس عربي/إنجليزي من 425 مفتاحاً يغطي كل شلّ الواجهة، مع حفظ اللغة محلياً. |
| brain_registry.ts | 4 ملفات عقول محلية ببارامترات حتمية وخريطة نماذج مثبّتة. |
| repo_indexer.ts | فهرس رموز متعدد اللغات بلا تبعيات مع ميزانية رموز. |
| surgical_patcher.ts | SEARCH/REPLACE آمن بفحص مسارات وتحقق وتراجع ذري. |
| enterprise/departments.ts | 10 أقسام هندسية بعقود وبوابات تحقق وتصنيف حتمي يربط كل قسم بعقل محلي. |
| enterprise/work_order_engine.ts | آلة حالة persisted لأوامر العمل مع فشل مغلق صريح وبث كل انتقال عبر SSE. |
| enterprise/repo_ingest.ts | استيعاب مستودع قائم للقراءة فقط مع تدقيق أساس SHA-256 وبوابة ترقية ذرّية للتطوّر/التحصين وبث كل مرحلة عبر SSE. |
| `*.test.ts` | 27 ملف اختبار تغطي 115 حالة (آخر تشغيل: 115 ناجح، 0 فاشل). |
| `playwright.config.ts` + `e2e/studio.spec.ts` | 10 اختبارات متصفح E2E منفصلة عن `npm test`. |

## مكوّنات الواجهة

| المكوّن | الدور |
|---|---|
| TopNav.tsx | شريط التنقل بين ستة عروض وزر مشروع جديد. |
| LiveWaveformHud.tsx | موجات صوتية حية وشريك معرفي وأوامر صوتية. |
| StudioView.tsx | خط الإنتاج وتفاصيل المشروع وتوزيع النماذج. |
| SolutionCatalogView.tsx | كتالوج الـ24 نطاقاً ورفعها إلى خط الإنتاج. |
| WatchView.tsx | إدارة المجلدات المراقبة ونتائج المسح. |
| VaultView.tsx | خزنة الخبرات وحالة النظام والملف المعرفي. |
| MigrationView.tsx | هجرة الأنظمة القديمة واختبارات التطابق. |
| ExportModal.tsx | تصدير ZIP ونشر Git واختيار Dry Run. |
| AuthGate.tsx | شاشة الدخول عندما يُضبط OMEGA_API_KEY. |
| DashboardView.tsx | لوحة قياسات بـ CSS خالص من بيانات المتجر والمتحقق. |
| EnterpriseView.tsx | تبويب أوامر الشركة: الأقسام العشرة، إنشاء/تشغيل أمر، ومراقبة الانتقالات الحيّة. |

كل مكوّنات الشلّ تستقبل `language` وتمرّر نصوصها الثابتة عبر `t(language, key)`؛ عناوين المشاريع ومخرجات المتحقق تبقى بيانات بلغتها الأصلية. سكربتات `bootstrap.ps1/.sh` لا تغيّر PATH ولا تسحب نماذج إلا بعلم صريح، و`CONTRIBUTING.md` يمنع تعديل `ai_pipeline.ts`.

## تدفق البيانات

1. المستخدم يكتب أو يتحدث → `LiveWaveformHud` → `POST /api/voice/command`.
2. `cognitive.ts` يستخرج النية و`server.ts` ينفّذ الإجراء أو يفتح اقتراحاً.
3. إنشاء مشروع → `POST /api/projects` → `runPipelineSynthesis` في server.ts.
4. `ecosystems.ts` يحدد البيئة، `routing.ts` يحدد نماذج الأدوار، `local_models.ts` يوصي بالمحلي.
5. التوليد يمر عبر `llama-bridge.ts` → `ollama_client.ts` → خادم Ollama على 11434.
6. `security.ts` يفحص المسارات والأسرار، ثم `verifier.ts` ينفّذ اختبارات OS حقيقية.
7. `healer.ts` يمكنه إصلاح الفشل المُقاس فقط، و`App.tsx` يعرض النتيجة النهائية.
8. `backup.ts` يتولى نسخ حالة `data/` دورياً، و`doctor.ts` يتحقق من الجاهزية.
