# INVENTORY — جرد الملفات والاختبارات

هذا السجل مولّد من أوامر فعلية، لا من تقدير. آخر تحديث: 2026-11-23.

## طريقة الجرد

```
git ls-files | Measure-Object -Line          → 108 ملفاً متتبعاً (بعد هذا الالتزام)
Get-ChildItem src/lib/*.test.ts              → 24 ملف اختبار
npm test                                     → 101 pass / 0 fail / 0 skipped
npm run test:e2e                             → 6 pass / 0 fail (Playwright chromium)
npm run check                                → critical 9/9 · exit 0
```

## توزيع الملفات المتتبعة

| المجلد | عدد الملفات | المحتوى |
|---|---|---|
| `(root)` | 25 | `server.ts`، إعدادات الحزمة، 15 ملف توثيق (منها `INVENTORY.md`)، `.gitignore`، `.env.example`، `models.config.json`، `package-lock.json`. |
| `src` | 73 | `App.tsx`، `main.tsx`، `index.css`، 10 مكوّنات، وحدات `lib`، 24 ملف اختبار (ضمن الـ 73). |
| `scripts` | 5 | `backup.ts`, `restore.ts`, `doctor.ts`, `check-secrets.ts`, `windows_job_sandbox.ps1`. |
| `.github` | 1 | `workflows/ci.yml`. |
| `e2e` | 1 | `studio.spec.ts` — 6 اختبارات متصفح حقيقية عبر Playwright. |
| `(root)` | — | `playwright.config.ts` لإعداد المتصفح والخادم. |
| `public` | 2 | أصول المنصة الأصلية. |

## سجل الاختبارات (24 ملفاً / 101 اختباراً)

| الملف | عدد الحالات | ما يغطيه |
|---|---|---|
| `auth.test.ts` | 4 | جلسة HttpOnly، مقارنة ثابتة، خنق الدخول. |
| `binding_guard.test.ts` | 3 | رفض `0.0.0.0` بلا مفتاح بـ `INSECURE_BINDING`. |
| `dashboard_metrics.test.ts` | 3 | تجميع آمن للحالة الفارغة، درجات واختبارات، قياسات وإصلاح حقيقي. |
| `doctor_ci.test.ts` | 2 | `doctor --ci` يفرض البوابات المحمولة ويُعلن المتخطى. |
| `event_bus.test.ts` | 4 | عزل المواضيع، إلغاء الاشتراك، إطارات SSE، بث حي، فشل مستمع آمن. |
| `export_fs.test.ts` | 1 | كتابة الحزمة ورفض مسار `../`. |
| `git_deploy.test.ts` | 5 | تعقيم البيئة والـ remote ونشر حقيقي. |
| `healer.test.ts` | 5 | تشخيص ورقع وتحقق ورفض تحسين غير مُقاس. |
| `job_queue.test.ts` | 3 | تسلسل المهام، فشل معزول، أحداث الحالة. |
| `integrity.test.ts` | 5 | SHA-256 وحارس المسارات وتسريب المتغيرات. |
| `i18n.test.ts` | 3 | اكتمال الترجمات، التبديل والتنسيق، رفض لغة غير معروفة. |
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
npm test             → 101/101
npm run test:e2e     → 6/6 (Playwright)
npm run check:secrets→ SECRETS_OK findings=0
npm run doctor       → critical 9/9
npm run doctor -- --ci → critical 4/4 · 5 skipped (مُعلن)
npm run check        → lint + test + secrets + doctor
npm run backup       → BACKUP_OK + MANIFEST
npm run restore -- <dir> --yes → RESTORE_OK
```

## آخر الأدلة المسجلة

- `RECOVERY.md` — `last successful restore: 2026-11-22`.
- `PROOF.md` — لا تسليم خارجي حتى الآن؛ أدلة تشغيل داخلية فقط.
- `SECURITY.md` — 5 مخاطر مع حالتها الحالية والتخفيف.
- `ARCHITECTURE.md` — شجرة + سطر لكل وحدة + تدفق بيانات.

## قاعدة التحديث

أي ملف أو اختبار جديد يُضاف إلى هذا الجرد في نفس الالتزام. أي رقم في هذا الملف يجب أن يكون قابلاً لإعادة الإنتاج بالأوامر أعلاه.
