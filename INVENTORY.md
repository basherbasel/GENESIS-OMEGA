# INVENTORY — جرد الملفات والاختبارات

هذا السجل مولّد من أوامر فعلية، لا من تقدير. آخر تحديث: 2026-11-23.

## طريقة الجرد

```
git ls-files | Measure-Object -Line          → 122 ملفاً متتبعاً (بعد هذا الالتزام)
Get-ChildItem src/lib/**/*.test.ts           → 27 ملف اختبار
npm test                                     → 115 pass / 0 fail / 0 skipped
npm run test:e2e                             → 10 pass / 0 fail (Playwright chromium)
npm run check                                → critical 9/9 · exit 0
./scripts/bootstrap.sh --pull-models         → تهيئة لينكس/ماك (سحب النماذج اختياري وصريح)
```

## توزيع الملفات المتتبعة

| المجلد | عدد الملفات | المحتوى |
|---|---|---|
| `(root)` | 27 | `server.ts`، إعدادات الحزمة، 17 ملف توثيق (منها `INVENTORY.md`)، `LICENSE`، `CONTRIBUTING.md`، `.gitignore`، `.env.example`، `models.config.json`، `package-lock.json`. |
| `src` | 83 | `App.tsx`، `main.tsx`، `index.css`، 11 مكوّنات، وحدات `lib` + `lib/brains` (3) + `lib/enterprise` (5)، 27 ملف اختبار (ضمن الـ 83). |
| `scripts` | 7 | `backup.ts`, `restore.ts`, `doctor.ts`, `check-secrets.ts`, `windows_job_sandbox.ps1`, `bootstrap.ps1`, `bootstrap.sh`. |
| `.github` | 1 | `workflows/ci.yml`. |
| `e2e` | 1 | `studio.spec.ts` — 10 اختبارات متصفح حقيقية عبر Playwright (منها اختبار التبديل الثنائي اللغة). |
| `(root)` | — | `playwright.config.ts` لإعداد المتصفح والخادم. |
| `public` | 2 | أصول المنصة الأصلية. |

## سجل الاختبارات (27 ملفاً / 115 اختباراً)

| الملف | عدد الحالات | ما يغطيه |
|---|---|---|
| `auth.test.ts` | 4 | جلسة HttpOnly، مقارنة ثابتة، خنق الدخول. |
| `binding_guard.test.ts` | 3 | رفض `0.0.0.0` بلا مفتاح بـ `INSECURE_BINDING`. |
| `brains/brains.test.ts` | 4 | ملفات العقول الأربعة، فهرسة 5 لغات، ترقيع ذري وتراجع، حظر سحابة. |
| `dashboard_metrics.test.ts` | 3 | تجميع آمن للحالة الفارغة، درجات واختبارات، قياسات وإصلاح حقيقي. |
| `doctor_ci.test.ts` | 2 | `doctor --ci` يفرض البوابات المحمولة ويُعلن المتخطى. |
| `enterprise/enterprise.test.ts` | 4 | دقة تصنيف الأقسام العشرة، تقدم آلة الحالة إلى `VERIFIED_COMMIT` بتحقق OS حقيقي، فشل مغلق لخطأ الجسر ومسار غير آمن. |
| `enterprise/repo_ingest.test.ts` | 6 | حارس المسار، مانيفست SHA-256 وتدقيق أساس بـ `node --test` فعلي، ترقية ذرّية تحسّن الدرجة وفحص بايتات الملفات غير المعدّلة، فشل مغلق لتراجع الاختبارات أو `TIMEOUT` الجسر، سجل تدقيق محفوظ ورفض جذور النظام. |
| `event_bus.test.ts` | 4 | عزل المواضيع، إلغاء الاشتراك، إطارات SSE، بث حي، فشل مستمع آمن. |
| `export_fs.test.ts` | 1 | كتابة الحزمة ورفض مسار `../`. |
| `git_deploy.test.ts` | 5 | تعقيم البيئة والـ remote ونشر حقيقي. |
| `healer.test.ts` | 5 | تشخيص ورقع وتحقق ورفض تحسين غير مُقاس. |
| `job_queue.test.ts` | 3 | تسلسل المهام، فشل معزول، أحداث الحالة. |
| `integrity.test.ts` | 5 | SHA-256 وحارس المسارات وتسريب المتغيرات. |
| `i18n.test.ts` | 3 | اكتمال الترجمات (425 مفتاحاً عربياً/إنجليزياً)، التبديل والتنسيق، رفض لغة غير معروفة. |
| `llama-bridge.test.ts` | 4 | mutex، timeout 100ms، MODEL_NOT_FOUND، ABORTED. |
| `local_models.test.ts` | 6 | كتالوج 34 نموذجاً، توجيه محلي، عميل Ollama، معرّفات Gemini. |
| `local_synthesis.test.ts` | 3 | توليد عبر الجسر، رفض المسارات، فشل مغلق بلا سحابة. |
| `omega.test.ts` | 16 | كتالوج 18 بيئة، SBOM، متحقق OS، مراقب، تصدير، sandbox حي. |
| `os_sandbox.test.ts` | 6 | كشف، فشل مغلق،Job Object، قتل الأحفاد، التقاط stdout. |
| `piper_tts.test.ts` | 6 | تخزين صوت SHA-256، prosody، اكتشاف النموذج، مسارات آمنة. |
| `rate_limit.test.ts` | 3 | حد الطلبات، نوافذ مستقلة، رفض قيم باطلة. |
| `routing.test.ts` | 3 | توجيه الأدوار، رفض الحقن، وجود النماذج المحلية. |
| `sandbox_runner.test.ts` | 3 | تعقيم البيئة، حالة عدم وجود عملية، إيقاف آمن. |
| `solution_catalog.test.ts` | 6 | 24 نطاقاً، تحديد، توليد، اختبارات فعلية. |
| `store_repository.test.ts` | 3 | WAL، هجرة JSON، إعادة استيراد بعد restore، فشل مغلق لمرآة تالفة. |
| `store_schema.test.ts` | 2 | قبول متجر صالح ورفض تالف بمخطط Zod. |
| `watcher.test.ts` | 2 | رفض المسارات النظامية، كشف تغيير SHA-256. |

## أوامر التحقق الدائمة

```
npm run lint         → tsc --noEmit
npm test             → 115/115
npm run test:e2e     → 10/10 (Playwright)
npm run check:secrets→ SECRETS_OK findings=0
npm run doctor       → critical 9/9
npm run doctor -- --ci → critical 4/4 · 5 skipped (مُعلن)
npm run check        → lint + test + secrets + doctor
npm run backup       → BACKUP_OK + MANIFEST
npm run restore -- <dir> --yes → RESTORE_OK
scripts/bootstrap.ps1 [-PullModels]  → BOOTSTRAP_OK (Windows)
scripts/bootstrap.sh [--pull-models] → BOOTSTRAP_OK (Linux/macOS)
git diff --name-only -- src/lib/ai_pipeline.ts → فارغ إلزامياً
```

## آخر الأدلة المسجلة

- `RECOVERY.md` — `last successful restore: 2026-11-22`.
- `PROOF.md` — لا تسليم خارجي حتى الآن؛ أدلة تشغيل داخلية فقط.
- `SECURITY.md` — 5 مخاطر مع حالتها الحالية والتخفيف + نموذج التهديد المحلي أولاً وحواجز المسارات والإبلاغ عن الثغرات.
- `CONTRIBUTING.md` — خريطة معمارية، حظر تعديل `ai_pipeline.ts`، بوابة التحقق وقائمة PR.
- `LICENSE` — MIT باسم بشار باسل المدلل (2026).
- `ARCHITECTURE.md` — شجرة + سطر لكل وحدة + تدفق بيانات.

## قاعدة التحديث

أي ملف أو اختبار جديد يُضاف إلى هذا الجرد في نفس الالتزام. أي رقم في هذا الملف يجب أن يكون قابلاً لإعادة الإنتاج بالأوامر أعلاه.
