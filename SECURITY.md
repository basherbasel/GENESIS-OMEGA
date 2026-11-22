# SECURITY — سياسة الأمان في الورشة

القاعدة الحاكمة: كل شيء يعمل محلياً افتراضياً، وأي خروج عن المحلي يجب أن يكون قراراً صريحاً وموثّقاً.

## الربط (HOST)

- `server.ts:104` ينصّ الآن على `const HOST = process.env.HOST || '127.0.0.1';`.
- `.env.example` و`.env` يضبطان `HOST="127.0.0.1"`.
- لا يمكن الوصول إلى الاستوديو من جهاز آخر بدون تغيير صريح في `.env`.
- عند وجود `OMEGA_API_KEY` تُفعّل جلسة HttpOnly وSameSite=Strict لكل `/api/*` و`/sandbox/*`.
- المقارنة ثابتة الزمن عبر `timingSafeEqualStrings`، ومحاولات الدخول مختنقة لكل عميل.
- `src/lib/binding_guard.ts` يفشل عند الإقلاع بـ `INSECURE_BINDING` إذا كان HOST غير محلي بلا `OMEGA_API_KEY`؛ تحقق فعلي: `HOST=0.0.0.0 npm run dev` ينتهي بـ exit 1.

## المحلي أولاً (Ollama)

- `models.config.json` يعرّف `runtime: ollama` و`baseUrl: http://127.0.0.1:11434`.
- `ollama_client.ts` يتصل بـ `/api/generate` و`/api/tags` فقط، مع `AbortSignal.timeout`.
- `llama-bridge.ts` يفرض استنتاجاً واحداً في كل مرة ويمنع التراكم بـ QUEUE_FULL.
- تحميل النماذج يتم بـ `ollama pull` صريحاً؛ السكربت `pullOllamaModel` مقيد بـ `OMEGA_ALLOW_MODEL_PULL=1`.
- بيانات المشروع لا تُرسل إلى أي خدمة خارجية في المسار المحلي.

## Ollama مقابل Gemini

| البند | Ollama المحلي | Gemini السحابي |
|---|---|---|
| الشرط | خادم Ollama + نموذج محمّل | `GEMINI_API_KEY` صالح |
| البيانات | تبقى على الجهاز | تُرسل إلى Google |
| التكلفة | كهرباء فقط | حسب تسعير API |
| الانترنت | غير مطلوب | مطلوب |
| الاتصال بالكود | `ollama_client.ts` → `llama-bridge.ts` | `ai_pipeline.ts` و`server.ts` |
| الافتراضي الحالي | مُفضّل عند اختيار نموذج محلي في التوزيع | يُستدعى عند غياب نموذج محلي ووجود مفتاح |
| الوسم في السجلات | `synthesisEngine: "ollama-local"` | `synthesisEngine: "gemini-ai"` |

استدعاءات Gemini الحالية:
- `ai_pipeline.ts:72,89` — مسار التوليد عندما لا يكون builder محلياً.
- `server.ts:1377` — `/api/projects/:id/ai-synthesize` يختار Gemini إن وُجد مفتاح.
- `server.ts:2047,2170,2228` — الحوار والتحليل الصوتي والتفريغ عند وجود مفتاح.
لا يوجد حتى الآن وسم `source: "gemini-fallback"` على هذه المسارات؛ هذا مذكور في LIMITATIONS.md.

## فحص الأسرار

- `scripts/check-secrets.ts` يقرأ `git ls-files -z` ويفحص AKIA و-----BEGIN وsk- وghp_ وxoxb-.
- يستبعد `.env.example`؛ ملفات `.md` تُفحص بنماذج صارمة فلا يُبلَّغ إلا عن مفتاح واضح.
- الأنماط تتطلب طولاً واقعياً لتجنب الإيجابيات الكاذبة مثل `task-fullstack-py` و`ghp_...`.
- القيمة التوثيقية `AKIAIOSFODNN7EXAMPLE` مسموح بها صراحةً لأنها تظهر في قوالب المولّد.
- آخر نتيجة: `SECRETS_OK findings=0 scanned=61`.

## عزل العملية

- `scripts/windows_job_sandbox.ps1` ينشئ Job Object بـ `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` ويُطلق العملية بـ `CREATE_BREAKAWAY_FROM_JOB` ثم يُسندها إلى الـ Job.
- `src/lib/os_sandbox.ts` يمرّر بيئة مُعقّمة (بلا أسرار) ويتحقق من النتيجة قبل إرجاع أي عملية.
- `sandbox_runner.ts` يقرأ stdout/stderr من ملفات يوفّرها المشرف، وإيقاف الـ sandbox يقتل المشرف فيُغلق الـ Job ويُقتل جميع الأبناء.
- تحقق فعلي: `spawnIsolated` أعاد `ATTACHED|<pid>` والتقط `ALIVE` من stdout، واختبار المتحقق الحي نجح بـ 16/16 دون تخطٍ.

## تحديد المعدل

- `src/lib/rate_limit.ts` يطبّق نافذة ثابتة في الذاكرة لكل عنوان عميل.
- المسارات المحددة فقط: `/api/projects` و`/api/voice/*` و`/api/solutions/generate`.
- الافتراضي 120 طلباً/دقيقة لكل عميل، قابل للتعديل عبر `OMEGA_RATE_LIMIT_MAX` و`OMEGA_RATE_LIMIT_WINDOW_MS`.
- الاستجابة عند التجاوز: HTTP 429 مع `Retry-After` ورسالة عربية.
- تحقق فعلي بـ `OMEGA_RATE_LIMIT_MAX=2`: الطلبات 1 و2 أعطتا 200، والثالثة 429.
- بقية مسارات `/api/*` و`/sandbox/*` غير محدودة بعد؛ الورشة على 127.0.0.1 فقط.
- الحد في الذاكرة ويعيد الضبط عند إعادة تشغيل الخادم؛ لا يوجد تخزين مشترك.

## خمسة مخاطر حقيقية

| # | الخطر | الأثر | التخفيف الحالي | المتبقي |
|---|---|---|---|---|
| 1 | ربط الخادم على 0.0.0.0 بدون مفتاح | كشف API للشبكة | الافتراضي 127.0.0.1 + حارس `INSECURE_BINDING` عند الإقلاع | لا يزال بإمكان مفتاح ضعيف أن يُستخدم |
| 2 | تسريب مفتاح داخل git | استخدام غير مصرّح | check-secrets داخل `npm run check` | الفحص يعتمد على الشكل لا على التحقق من صحة المفتاح |
| 3 | تنفيذ كود المشاريع المولّدة | ضرر على الجهاز | Job Object + `CREATE_BREAKAWAY_FROM_JOB` + `KILL_ON_JOB_CLOSE`، ورفض `SANDBOX_UNAVAILABLE` عند غياب العزل | لا توجد سياسة وصول للملفات/الشبكة داخل العزل |
| 4 | استدعاء سحابي غير مقصود | إرسال بيانات المشروع | اختيار نموذج محلي صريح في التوزيع | ما زال هناك مسار Gemini افتراضي عند غياب المحلي |
| 5 | فقدان الحالة | خسارة المشاريع والخزنة | backup يومي + MANIFEST بـ SHA-256 + استعادة موثّقة | النسخة الوحيدة الحالية من نفس اليوم |

## قواعد عملية

- لا تضع مفاتيح حقيقية في أي ملف داخل git.
- لا ترفع `HOST` إلى 0.0.0.0 قبل تفعيل `OMEGA_API_KEY` وreverse proxy.
- لا تشغّل مشروعاً مولّداً خارج `data/workspaces`.
- راجع `npm run check:secrets` بعد كل إضافة ملف جديد.
- راجع `RECOVERY.md` بعد كل استعادة وأضف التاريخ.
