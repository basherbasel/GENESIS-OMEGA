# RECOVERY — النسخ الاحتياطي والاستعادة

**last successful restore: 2026-11-22**

2026-11-22 | backup=2026-11-22-115514 | corrupt models.config.json → `npm run restore -- backups/2026-11-22-115514 --yes` → `defaultModel=qwen2.5-coder:3b` | OK (exit 0)

## آخر استعادة ناجحة (اليوم 2)

| الخطوة | الأمر | المخرج الفعلي |
|---|---|---|
| 1 | `npm run backup` | `BACKUP_OK id=2026-11-22-115514 dir=backups\2026-11-22-115514` — `entries=2/4 dataFiles=238` |
| 2 | `"broken" \| Set-Content models.config.json -NoNewline` | `corrupt=broken` |
| 3 | `npm run restore -- backups/2026-11-22-115514 --yes` | `RESTORE_OK id=2026-11-22-115514 files=239` — `exit=0` |
| 4 | `cat models.config.json` | `defaultModel=qwen2.5-coder:3b` — JSON صالح |

محتوى النسخة `backups/2026-11-22-115514/`:
- `MANIFEST.json` — schema 1، 239 ملفاً، SHA-256 لكل ملف، تاريخ الإنشاء.
- `models.config.json` — 393 بايت.
- `data/` — 238 ملفاً / 900184 بايت، ويشمل `omega_store.json` الفعلي.
- `.env` و`omega_store.json` على مستوى الجذر كانا غائبين وسُجّلا `included: false, reason: missing at source`.

## الاستعادة من الصفر (جهاز نظيف)

1. ثبّت Node 22 أو أحدث، ثم استنسخ المستودع أو انسخ ملفات المصدر.
2. نفّذ `npm install` — يعتمد على `package-lock.json` الموجود.
3. أنشئ `.env` يدوياً بمحتوى محلي:
   ```
   OLLAMA_HOST=http://127.0.0.1:11434
   HOST=127.0.0.1
   ```
4. تأكد أن Ollama يعمل وأن `qwen2.5-coder:1.5b` محمّل (`ollama list`).
5. انسخ مجلد `backups/<timestamp>` من وسيط خارجي إلى جذر المشروع.
6. نفّذ `npm run restore -- backups/<timestamp> --yes`.
7. تحقق: `npm run check` → يجب أن ينتهي بـ exit 0 و`critical: 9/9 passed`.
8. شغّل `npm run dev` وتأكد أن `/api/status` يستجيب على 127.0.0.1:3000.

## ما ينسخه backup وما يستبعده

- ينسخ: `.env`، `data/` كاملة، `omega_store.json`، `models.config.json`.
- يستبعد: `node_modules`، `dist`، `backups`، أي ملف `*.gguf`.
- الاسم: `backups/YYYY-MM-DD-HHmmss/` بالتوقيت المحلي.
- الاحتفاظ: 30 نسخة كحد أقصى؛ تُحذف الأقدم تلقائياً بعد كل نسخة جديدة.
- `MANIFEST.json` يحتوي تجزئة SHA-256 لكل ملف؛ `restore.ts` يتحقق من التجزئة قبل أي كتابة.

## أخطاء واجهتها وحلولها

1. `npm run restore backups/<id> --yes` لا يمرّر `--yes` لأن npm يستهلكه؛ الصيغة الصحيحة `npm run restore -- backups/<id> --yes`.
2. أول استعادة فشلت بـ `EPERM` على `data/exports/.../.git/objects/...` (ملفات للقراءة فقط على Windows)؛ أُصلح بمنح `0o200` مؤقتاً ثم إعادة الـ mode الأصلي داخل `scripts/restore.ts`.
3. بدون `--yes` يطلب السكربت كتابة `YES` صراحةً وينتهي بـ exit 1 عند الرفض — سلوك مقصود.

## متى تُستعاد

- بعد تلف `omega_store.json` أو فقدان `models.config.json`.
- بعد تعديل فاشل في `server.ts` لا يمكن التراجع عنه بـ git.
- عند الانتقال إلى جهاز آخر مع الحفاظ على حالة المشاريع والخزنة.

## ما لا تغطيه الاستعادة

- ملفات النماذج الكبيرة `*.gguf` تُستعاد من Ollama عبر `ollama pull`، لا من النسخة.
- `node_modules` تُعاد عبر `npm install`.
- الإعدادات السرية الحقيقية (إن وُجدت لاحقاً) تُدار خارج المستودع ولا تُنسخ تلقائياً.
