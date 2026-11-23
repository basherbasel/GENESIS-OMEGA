import { expect, test } from '@playwright/test';

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

test('تقرير HTML يدعم الطباعة إلى PDF', async ({ request }) => {
  const response = await request.get('/api/projects/1/report/html?print=1');
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain('window.print()');
  expect(body).toContain('@media print');
  expect(body).toContain('تقرير التدقيق');
});
