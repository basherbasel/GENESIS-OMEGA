# CONTRIBUTING — مساهمة آمنة في GENESIS-OMEGA

شكراً لاهتمامك بهذا المشروع. الورشة تعمل محلياً بالكامل؛ أي مساهمة تُحكم بثلاث قواعد: **لا لمس لخط الإنتاج القديم، لا سحابة صامتة، لا رقم بلا تحقق**.

## خريطة المعمارية (قبل أول تعديل)

| المسار | ما يفعله |
|---|---|
| `server.ts` | نقطة دخول Express + Vite + كل مسارات `/api`، SSE على `/api/events`، وخط الإنتاج. |
| `src/lib/ai_pipeline.ts` | **منطقة محظورة التعديل.** خط التوليد القديم؛ أي تحسين محلي يمر فوقه ولا يغيّره. |
| `src/lib/local_synthesis.ts` | المدخل الوحيد المسموح للتوليد المحلي: `synthesizeWithBridge` و`synthesizeTextWithBridge` → `llama-bridge.generate()`، فشل مغلق بلا fallback سحابي. |
| `src/lib/llama-bridge.ts` | single-flight، timeout، ورموز خطأ صريحة (`MODEL_NOT_FOUND`، `TIMEOUT`، `ABORTED`…). |
| `src/lib/brains/*` | أربع ملفات عقول حتمية + فهرس رموز + ترقيع `SEARCH/REPLACE` ذري. |
| `src/lib/enterprise/*` | الأقسام العشرة، آلة حالة أوامر العمل، واستيعاب/تحصين المستودعات القائمة. |
| `src/lib/security.ts` | حارس المسارات `isSafeRelativePath`، فحص الأسرار، التراجع الذري، وفاحص الأنماط الخطرة. |
| `src/lib/verifier.ts` + `healer.ts` | تشغيل اختبارات OS حقيقية؛ الإصلاح يُقبل فقط عند تحسّن مُقاس. |
| `src/lib/store_repository.ts` | مخزن SQLite WAL + مرآة JSON للنسخ والاستعادة. |
| `src/components/*` + `src/lib/i18n.ts` | شلّ React ثنائي اللغة؛ كل نص ثابت يمر عبر `t(language, key)`. |

## قواعد غير قابلة للتفاوض

1. **لا تعدّل `src/lib/ai_pipeline.ts` أبداً.** تحقق قبل الالتزام:
   ```bash
   git diff --name-only -- src/lib/ai_pipeline.ts   # يجب أن يكون فارغاً
   ```
   البديل هو إضافة مسار جديد في `server.ts` يستدعي `local_synthesis.ts`، أو توسيع وحدة في `brains/`.
2. **كل استنتاج محلي يمر عبر `llama-bridge.generate()`.** لا استدعاء مباشر لـ `ollama_client` من ميزة جديدة، ولا/cloud fallback، ولا مفاتيح سحابية في مسار محلي.
3. **الفشل مغلق (fail-closed).** أي خطأ يعطي رمزاً صريحاً (`UNSAFE_PATH`، `PROMOTION_GATE_REJECTED`، `TIMEOUT`…) ولا يكتب ملفاً ولا يخفي الخطأ.
4. **حدود الملفات:** المسارات النسبية تمر عبر `isSafeRelativePath`، وجذور النظام مرفوضة، ورموز `..` ممنوعة قبل أي قراءة أو كتابة.
5. **بيئة العمليات الفرعية مُعقّمة:** لا تمرير مفاتيح (`*_KEY`, `TOKEN`, `SECRET`, `PASSWORD`) إلى كود مُولّد.
6. **لا أسرار في git إطلاقاً.** `.env` غير متتبع؛ استخدم `.env.example` للقوالب فقط.

## بوابة التحقق الإلزامية (قبل فتح PR)

```bash
npx tsc --noEmit          # صفر أخطاء TypeScript
npm test                  # كل اختبارات الوحدة/التكامل
npm run test:e2e          # كل اختبارات Playwright
npm run check             # lint + test + check:secrets (0) + doctor (9/9)
git diff --name-only -- src/lib/ai_pipeline.ts   # فارغ
```

## قائمة تحقق PR

- [ ] وصفتُ المشكلة والقرار المعماري في وصف PR.
- [ ] لم ألمس `src/lib/ai_pipeline.ts`، والتحقق بالأمر أعلاه فارغ.
- [ ] الاستنتاج المحلي يمر عبر `local_synthesis.ts` → `llama-bridge.generate()`، بلا fallback سحابي.
- [ ] أضفت اختباراً يفشل فعلياً عند كسر السلوك (لا اختبار «يمر دائماً»).
- [ ] كل نص واجهة جديد له مفتاح في `src/lib/i18n.ts` بالعربية والإنجليزية.
- [ ] لا مسار غير آمن، ولا عملية فرعية ببيئة غير معقّمة.
- [ ] حدّثت `INVENTORY.md` و`ROADMAP.md` إن تغيّرت أعداد الملفات/الاختبارات.
- [ ] `npm run check` و`npm run test:e2e` أخضران، و`SECRETS_OK findings=0`.

القرار النهائي للمهندس بشار باسل المدلل؛ المساعد التنفيذي يجهّز المسودة والأدلة لا القرار.
