import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('واجهة الاستوديو تحمل وتعرض التنقل الأساسي', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/GENESIS-OMEGA/);
  await expect(page.getByRole('button', { name: 'خط الإنتاج' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'لوحة القياسات' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'مشروع جديد' })).toBeVisible();
});

test('مفتاح اللغة يبدل التنقل واللوحة إلى الإنجليزية ثم يعود', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'خط الإنتاج' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Production line' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Every figure comes from real state', { exact: false })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.getByRole('button', { name: 'خط الإنتاج' })).toBeVisible();
});

test('لوحة القياسات تعرض عدد المشاريع القادم من API الحقيقي', async ({ page, request }) => {
  const status = await (await request.get('/api/status')).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'لوحة القياسات' }).click();
  await expect(page.getByRole('heading', { name: 'لوحة القياسات' })).toBeVisible();
  const cards = page.locator('section[aria-label="مؤشرات أساسية"]');
  await expect(cards).toContainText(String(status.totals.projects));
  await expect(cards).toContainText(`${status.totals.verified}`);
  await expect(page.getByText('درجات المشاريع')).toBeVisible();
  await expect(page.getByText('حالة المضيف والتوجيه')).toBeVisible();
});

test('نموذج إنشاء مشروع يعرض حقول التوليد العصبي والتوزيع', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'مشروع جديد' }).click();
  await expect(page.getByPlaceholder('مثال: منصة إدارة الطلبات والفواتير')).toBeVisible();
  await expect(page.getByPlaceholder('صف الوظائف، نقاط النهاية، قاعدة البيانات، ومتطلبات الأمان...')).toBeVisible();
  await expect(page.getByText('تفعيل التوليد العصبي', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'توزيع النماذج غير المتماثل', exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إطلاق خط الإنتاج الآن' })).toBeVisible();
});

test('SSE يبث حدث state عند كتابة فعلية في المتجر', async ({ page, request }) => {
  await page.goto('/');
  type SseWindow = Window & { __sse?: EventSource; __sseEvents?: string[] };
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const w = window as SseWindow;
        w.__sseEvents = [];
        const source = new EventSource('/api/events');
        w.__sse = source;
        const timer = setTimeout(() => reject(new Error('SSE ready timeout')), 10_000);
        source.addEventListener('ready', () => {
          clearTimeout(timer);
          resolve();
        });
        source.addEventListener('state', () => w.__sseEvents?.push('state'));
      }),
  );

  await request.post('/api/watches/1/toggle');
  await request.post('/api/watches/1/toggle');
  await expect
    .poll(() => page.evaluate(() => (window as SseWindow).__sseEvents?.length || 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => (window as SseWindow).__sse?.close());
});

test('واجهة أوامر الشركة تعرض الأقسام العشرة', async ({ page, request }) => {
  const response = await request.get('/api/enterprise/departments');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.departments).toHaveLength(10);
  expect(body.departments[0]).toHaveProperty('verificationGates');
  await page.goto('/');
  await page.getByRole('button', { name: 'أوامر الشركة' }).click();
  await expect(page.getByRole('heading', { name: 'أوامر العمل الهندسية' })).toBeVisible();
  await expect(page.getByText('الأقسام العشرة')).toBeVisible();
});

test('سجل أوامر العمل ينشئ أمراً ويبث انتقاله عبر SSE', async ({ page, request }) => {
  await page.goto('/');
  type WoWindow = Window & { __wo?: EventSource; __woEvents?: string[] };
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const w = window as WoWindow;
        w.__woEvents = [];
        const source = new EventSource('/api/events');
        w.__wo = source;
        const timer = setTimeout(() => reject(new Error('SSE ready timeout')), 10_000);
        source.addEventListener('ready', () => {
          clearTimeout(timer);
          resolve();
        });
        source.addEventListener('work_order', () => w.__woEvents?.push('work_order'));
      }),
  );
  const created = await request.post('/api/enterprise/work-orders', {
    data: { title: 'E2E order', problemStatement: 'typed web API with SQLite and real tests' },
  });
  expect(created.ok()).toBeTruthy();
  const order = (await created.json()).workOrder;
  expect(order.stage).toBe('BACKLOG');
  expect(order.departmentIds.length).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => (window as WoWindow).__woEvents?.length || 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => (window as WoWindow).__wo?.close());
  const fetched = await request.get(`/api/enterprise/work-orders/${order.id}`);
  expect((await fetched.json()).workOrder.id).toBe(order.id);
});

test('تقرير HTML يدعم الطباعة إلى PDF', async ({ request }) => {
  const response = await request.get('/api/projects/1/report/html?print=1');
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain('window.print()');
  expect(body).toContain('@media print');
  expect(body).toContain('تقرير التدقيق');
});

test('تبديل اللغة يغطي كل العروض بما فيها أوامر الشركة وصيانة المستودعات', async ({ page }) => {
  await page.goto('/');

  // العربية هي الافتراض: لوحة الشركة + صيانة المستودعات.
  await page.getByRole('button', { name: 'أوامر الشركة' }).click();
  await expect(page.getByRole('heading', { name: 'أوامر العمل الهندسية' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'صيانة مستودع قائم' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تدقيق خط الأساس' })).toBeVisible();

  // الإنجليزية: نفس العروض بلا أي نص عالق بالعربية.
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'Engineering Work Orders' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Maintain existing repository' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baseline audit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Evolve & harden' })).toBeVisible();

  await page.getByRole('button', { name: 'Production line' }).click();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByText('Project name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch the production line' })).toBeVisible();

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Folder watch' }).click();
  await expect(page.getByRole('heading', { name: 'Folder watching & automatic audit' })).toBeVisible();
  await page.getByRole('button', { name: 'Statistics & knowledge' }).click();
  await expect(page.getByRole('heading', { name: 'Statistics & knowledge vault' })).toBeVisible();
  await page.getByRole('button', { name: 'Legacy migration' }).click();
  await expect(page.getByRole('heading', { name: 'Legacy system migration lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Solution catalog' }).click();
  await expect(page.getByRole('heading', { name: 'Engineering solution catalog' })).toBeVisible();

  // العودة إلى العربية تعيد الاتجاه ونصوص الشركة.
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'أوامر الشركة' }).click();
  await expect(page.getByRole('heading', { name: 'أوامر العمل الهندسية' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'صيانة مستودع قائم' })).toBeVisible();
});

test('لوحة الحوار الصوتي تنفذ محادثة عربية وإنجليزية حقيقية', async ({ page }) => {
  await page.goto('/');
  const hud = page.getByTestId('voice-hud');
  await expect(hud).toBeVisible();
  await expect(page.getByTestId('voice-lang-select')).toBeVisible();
  await expect(page.getByTestId('voice-state')).toContainText('جاهز');

  type VoiceWindow = Window & { __voiceEvents?: string[]; __voiceSource?: EventSource };
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const w = window as VoiceWindow;
        w.__voiceEvents = [];
        const source = new EventSource('/api/events');
        w.__voiceSource = source;
        const timer = setTimeout(() => reject(new Error('SSE ready timeout')), 10_000);
        source.addEventListener('ready', () => {
          clearTimeout(timer);
          resolve();
        });
        source.addEventListener('voice', () => w.__voiceEvents?.push('voice'));
      }),
  );

  // Arabic utterance: deterministic doctor status, spoken reply in Arabic.
  await page.getByTestId('voice-input').fill('حالة الأدوات والبيئة؟');
  await page.getByTestId('voice-send').click();
  await expect(page.getByTestId('voice-utterance').last()).toContainText('حالة الأدوات والبيئة؟');
  await expect(page.getByTestId('voice-reply').last()).toContainText('حالة الأدوات:', { timeout: 20_000 });
  await expect(page.getByTestId('voice-state')).toContainText(/يتحدث|ينفّذ|جاهز/);

  // English utterance through the same route, with an English spoken reply.
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByTestId('voice-input').fill('list work orders');
  await page.getByTestId('voice-send').click();
  await expect(page.getByTestId('voice-reply').last()).toContainText('work order', { timeout: 20_000 });
  await expect(page.getByTestId('voice-history')).toContainText('You');
  await expect
    .poll(() => page.evaluate(() => (window as VoiceWindow).__voiceEvents?.length || 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => (window as VoiceWindow).__voiceSource?.close());
});

test('لوحات v3 الأمنية ونطاق التأثير تعمل بالعربية والإنجليزية', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'أوامر الشركة' }).click();
  const repoInput = page.getByPlaceholder('مسار المستودع على القرص');
  await repoInput.fill(process.cwd().replace(/\\/g, '/'));

  await page.getByRole('button', { name: 'تحليل الرسم' }).click();
  await expect(page.getByTestId('enterprise-graph-result')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'فحص التلوث' }).click();
  await expect(page.getByTestId('enterprise-taint-findings')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'التحقق من السجل' }).click();
  await expect(page.getByTestId('enterprise-ledger-result')).toContainText('سليم', { timeout: 30_000 });

  // Voice pair-programmer: Arabic blast radius, English ledger verification.
  await page.getByTestId('voice-input').fill('ما تأثير تعديل ملف repo_indexer.ts؟');
  await page.getByTestId('voice-send').click();
  await expect(page.getByTestId('voice-reply').last()).toContainText(/يؤثر|تأثير/, { timeout: 30_000 });

  await page.getByRole('button', { name: 'English' }).click();
  await page.getByTestId('voice-input').fill('Verify audit ledger integrity');
  await page.getByTestId('voice-send').click();
  await expect(page.getByTestId('voice-reply').last()).toContainText('audit ledger', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Work Orders' }).click();
  await expect(page.getByText('Dependency graph & blast radius')).toBeVisible();
  await expect(page.getByText('Static taint & peer-review findings')).toBeVisible();
  await expect(page.getByText('Cryptographic audit ledger')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze graph' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan taint' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify ledger' })).toBeVisible();
});

test('شريط القياسات اللحظي يعرض بيانات /api/runtime/metrics بالعربية والإنجليزية', async ({ page, request }) => {
  const response = await request.get('/api/runtime/metrics');
  expect(response.ok()).toBeTruthy();
  const metrics = await response.json();
  expect(typeof metrics.cache.hitRate).toBe('number');
  expect(typeof metrics.cache.savedMs).toBe('number');
  expect(typeof metrics.grounding.blockedHallucinations).toBe('number');
  expect(typeof metrics.healing.stagnationBreaks).toBe('number');
  expect(typeof metrics.brains.allDedicatedReady).toBe('boolean');
  expect(typeof metrics.workspaces.cleaned).toBe('number');

  await page.goto('/');
  await page.getByRole('button', { name: 'أوامر الشركة' }).click();
  const strip = page.getByTestId('enterprise-runtime-strip');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('سرعة التشغيل وحاجز منع الهلوسة');
  await expect(strip).toContainText('معدل إصابة الذاكرة');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(strip).toContainText('Runtime speed & zero-hallucination guard');
  await expect(strip).toContainText('Cache hit rate');
});

test('مختبر البحث والتطوير والهندسة العكسية يعرض الأقسام السبعة والطبقات بلغتين', async ({ page, request }) => {
  const response = await request.get('/api/enterprise/deep-tech');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.divisions).toHaveLength(7);
  expect(data.layers).toHaveLength(3);
  expect(data.reTracks).toHaveLength(5);

  await page.goto('/');
  await page.getByRole('button', { name: 'أوامر الشركة' }).click();
  const lab = page.getByTestId('enterprise-v5-lab');
  await expect(lab).toBeVisible();
  await expect(lab).toContainText('مختبر البحث والتطوير والهندسة العكسية');
  await expect(page.getByTestId('v5-divisions')).toContainText('الأنظمة والمستوى المنخفض وتجريد العتاد');
  await expect(page.getByTestId('v5-layers')).toContainText('الطبقة السفلى');
  await expect(page.getByTestId('v5-inspector')).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();
  await expect(lab).toContainText('Deep-Tech R&D & Reverse Engineering Lab');
  await expect(page.getByTestId('v5-divisions')).toContainText('Systems, Low-Level & Hardware Abstraction');
  await expect(page.getByTestId('v5-layers')).toContainText('Layer 1');
  await expect(page.getByRole('button', { name: 'Inspect file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decode frame' })).toBeVisible();
});

test('صيانة مستودع قائم: تدقيق حقيقي ورفض مسار غير آمن وعرض اللوحة', async ({ page, request }) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-e2e-ingest-'));
  fs.writeFileSync(
    path.join(repo, 'index.js'),
    "'use strict';\nfunction answer() {\n  return 42;\n}\nmodule.exports = { answer };\n",
    'utf-8',
  );
  try {
    // 1. Real baseline audit over a real on-disk repository.
    const audit = await request.post('/api/enterprise/ingest', { data: { path: repo } });
    expect(audit.ok()).toBeTruthy();
    const body = await audit.json();
    expect(body.run.status).toBe('audited');
    expect(body.report.verification.exitCode).toBe(0);
    expect(body.summary.manifest[0]).toHaveProperty('sha256');

    // 2. Unsafe OS root is rejected before anything is read.
    const rejected = await request.post('/api/enterprise/ingest', { data: { path: 'C:\\Windows\\System32' } });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).code).toBe('UNSAFE_REPO_PATH');

    // 3. The run is persisted and served back (newest first).
    const runs = await (await request.get('/api/enterprise/ingest/runs')).json();
    expect(runs.runs[0].id).toBe(body.run.id);

    // 4. The panel renders the controls and the persisted run.
    await page.goto('/');
    await page.getByRole('button', { name: 'أوامر الشركة' }).click();
    const panel = page.locator('section[aria-label="صيانة مستودع قائم"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByPlaceholder('مسار المستودع على القرص')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'تدقيق خط الأساس' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'التطوير والتحصين' })).toBeVisible();
    await expect(panel.getByText('الحالة: audited').first()).toBeVisible();
  } finally {
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
