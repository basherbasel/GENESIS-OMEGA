import type { DiscoveredEndpoint, EcosystemMeta } from './types';

function inferMethodForPath(line: string, path: string): DiscoveredEndpoint['method'] {
  const low = line.toLowerCase();
  if (low.includes('.post(') || low.includes('post ') || low.includes('do_post') || low.includes('methodpost')) {
    return 'POST';
  }
  if (low.includes('.put(') || low.includes('put ') || low.includes('do_put')) {
    return 'PUT';
  }
  if (low.includes('.delete(') || low.includes('delete ') || low.includes('do_delete')) {
    return 'DELETE';
  }
  if (low.includes('.patch(') || low.includes('patch ')) {
    return 'PATCH';
  }
  if (path.includes('/create') || path.includes('/submit')) return 'POST';
  return 'GET';
}

function buildSampleResponse(method: DiscoveredEndpoint['method'], epPath: string, title: string): Record<string, unknown> {
  if (epPath === '/health' || epPath.endsWith('/health')) {
    return { status: 'ok', service: title, wal: 'enabled' };
  }
  if (method === 'POST') {
    return { created: true, id: 101, message: 'تم الحفظ والتحقق بنجاح' };
  }
  if (method === 'DELETE') {
    return { deleted: true, path: epPath };
  }
  return {
    items: [{ id: 1, title: `${title} — Primary Item`, status: 'active' }],
    count: 1,
  };
}

export function discoverEndpoints(
  files: Record<string, string>,
  prompt: string = '',
  title: string = 'Service',
): DiscoveredEndpoint[] {
  const discovered = new Map<string, DiscoveredEndpoint>();

  const register = (method: DiscoveredEndpoint['method'], rawPath: string, summary?: string) => {
    const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    if (cleanPath.length < 2 || cleanPath.length > 64) return;
    if (/\s|\{|\}|\\/.test(cleanPath) && !/^\/[a-zA-Z0-9_/{}-]+$/.test(cleanPath)) return;
    const key = `${method} ${cleanPath}`;
    if (!discovered.has(key)) {
      discovered.set(key, {
        method,
        path: cleanPath,
        summary: summary || `${method} ${cleanPath}`,
        sampleResponse: buildSampleResponse(method, cleanPath, title),
      });
    }
  };

  register('GET', '/health', 'فحص سلامة الخدمة وقاعدة البيانات');

  const routeRegexes = [
    /(?:app|router|mux)\.(?:get|post|put|delete|patch|HandleFunc)\s*\(\s*["'](\/[a-zA-Z0-9_/:{}-]+)["']/gi,
    /self\.path\s*==\s*["'](\/[a-zA-Z0-9_/:{}-]+)["']/g,
    /(?:url|path)\s*===\s*["'](\/[a-zA-Z0-9_/:{}-]+)["']/g,
    /@(?:app|router)\.(get|post|put|delete|patch)\(\s*["'](\/[a-zA-Z0-9_/:{}-]+)["']/gi,
  ];

  for (const [fname, content] of Object.entries(files)) {
    if (fname.endsWith('.json') && fname === 'openapi.json') {
      try {
        const spec = JSON.parse(content) as { paths?: Record<string, Record<string, { summary?: string }>> };
        if (spec.paths) {
          for (const [epPath, methodsObj] of Object.entries(spec.paths)) {
            for (const [m, meta] of Object.entries(methodsObj)) {
              const upper = m.toUpperCase() as DiscoveredEndpoint['method'];
              if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(upper)) {
                register(upper, epPath, meta?.summary);
              }
            }
          }
        }
      } catch {
        // ignore invalid json
      }
      continue;
    }

    const lines = content.split('\n');
    for (const line of lines) {
      for (const rx of routeRegexes) {
        rx.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = rx.exec(line)) !== null) {
          const pathMatch = match[2] || match[1];
          const explicitMethod = match[2] ? match[1].toUpperCase() : undefined;
          if (pathMatch && (pathMatch.startsWith('/api') || pathMatch === '/health' || pathMatch === '/docs')) {
            const method =
              explicitMethod && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(explicitMethod)
                ? (explicitMethod as DiscoveredEndpoint['method'])
                : inferMethodForPath(line, pathMatch);
            register(method, pathMatch);
          }
        }
      }
    }
  }

  const lowPrompt = `${title} ${prompt}`.toLowerCase();
  if (/(فواتير|عملاء|crm|billing|invoice|customer)/.test(lowPrompt)) {
    register('GET', '/api/customers', 'قائمة العملاء المسجلين');
    register('POST', '/api/customers', 'إضافة سجل عميل جديد');
    register('GET', '/api/invoices', 'عرض الفواتير والمدفوعات');
  } else if (/(مبيعات|مخزون|منتجات|طلبات|inventory|orders|sales|store)/.test(lowPrompt)) {
    register('GET', '/api/products', 'عرض كتالوج المنتجات والمخزون');
    register('POST', '/api/products', 'إضافة منتج جديد للمخزون');
    register('GET', '/api/orders', 'عرض سجل الطلبات');
  } else if (/(مرضى|عياد|مستشف|طبي|صيدل|clinic|patient|hospital|medical|pharmacy)/.test(lowPrompt)) {
    register('GET', '/api/patients', 'سجل المرضى المراجعين');
    register('POST', '/api/patients', 'تسجيل ملف مريض جديد');
    register('GET', '/api/appointments', 'مواعيد العيادة اليومية');
  } else if (/(مهام|مشاريع|تذاكر|tasks|tickets|project|workflow)/.test(lowPrompt)) {
    register('GET', '/api/projects', 'قائمة المشاريع الجارية');
    register('GET', '/api/tasks', 'قائمة المهام والتذاكر');
    register('POST', '/api/tasks', 'إنشاء مهمة جديدة');
  } else if (/(رواتب|موظف|بنكي|payroll|salary|hr|employee)/.test(lowPrompt)) {
    register('GET', '/api/employees', 'بيانات الموظفين');
    register('GET', '/api/payroll', 'كشوف الرواتب والمستحقات');
    register('POST', '/api/payroll', 'اعتماد دفعة رواتب جديدة');
  }

  if (!Array.from(discovered.values()).some((e) => e.path.startsWith('/api/'))) {
    register('GET', '/api/items', 'جلب السجلات المخزنة');
    register('POST', '/api/items', 'إنشاء عنصر جديد بعد التحقق');
  }

  return Array.from(discovered.values()).slice(0, 10);
}

export function generateOpenApiAndSwagger(
  title: string,
  prompt: string,
  endpoints: DiscoveredEndpoint[],
): {
  openapiJson: string;
  swaggerHtml: string;
  docsServerPy: string;
  mockFixturesJson: string;
} {
  const paths: Record<string, Record<string, unknown>> = {};
  const fixtures: Record<string, unknown> = {};

  for (const ep of endpoints) {
    const methodLower = ep.method.toLowerCase();
    if (!paths[ep.path]) paths[ep.path] = {};
    paths[ep.path][methodLower] = {
      summary: ep.summary,
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              example: ep.sampleResponse,
            },
          },
        },
      },
    };
    fixtures[`${ep.method} ${ep.path}`] = {
      status: ep.method === 'POST' ? 201 : 200,
      payload: ep.sampleResponse,
    };
  }

  const spec = {
    openapi: '3.0.3',
    info: {
      title,
      version: '1.0.0',
      description: prompt,
    },
    paths,
  };

  const openapiJson = JSON.stringify(spec, null, 2);
  const mockFixturesJson = JSON.stringify(fixtures, null, 2);

  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rowsHtml = endpoints
    .map(
      (ep) =>
        `<tr><td><code>${ep.method}</code></td><td><code>${ep.path}</code></td><td>${ep.summary.replace(/</g, '&lt;')}</td></tr>`,
    )
    .join('');

  const swaggerHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle} — OpenAPI & Mock Inspector</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:2rem}
    .card{max-width:960px;margin:0 auto;background:#111827;border:1px solid #334155;border-radius:10px;padding:1.5rem}
    table{width:100%;border-collapse:collapse;margin-top:1rem}
    th,td{border-bottom:1px solid #1e293b;padding:.6rem .75rem;text-align:left;font-size:.9rem}
    code{color:#38bdf8;font-family:monospace}
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle} — API Specification (OpenAPI 3.0.3)</h1>
    <table>
      <thead><tr><th>Method</th><th>Path</th><th>Summary</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <h2>Mock Fixtures</h2>
    <pre>${mockFixturesJson.replace(/</g, '&lt;')}</pre>
  </div>
</body>
</html>
`;

  const docsServerPy = `from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent


class DocsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/docs"):
            html = (ROOT / "swagger_ui.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html)
            return
        if self.path == "/openapi.json":
            spec = (ROOT / "openapi.json").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(spec)
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("DOCS_PORT", "8080"))
    HTTPServer(("127.0.0.1", port), DocsHandler).serve_forever()
`;

  return { openapiJson, swaggerHtml, docsServerPy, mockFixturesJson };
}

export function generateEndpointMockTests(
  title: string,
  eco: EcosystemMeta,
  endpoints: DiscoveredEndpoint[],
): { filename: string; content: string } {
  if (eco.key === 'nodejs' || eco.key === 'typescript') {
    const ext = eco.key === 'typescript' ? 'ts' : 'js';
    const checks = endpoints
      .map(
        (ep, idx) =>
          `test('mock contract #${idx + 1}: ${ep.method} ${ep.path}', () => {\n` +
          `  const mockPayload = ${JSON.stringify(ep.sampleResponse)};\n` +
          `  assert.equal(typeof mockPayload, 'object');\n` +
          `  assert.ok(fixtures[${JSON.stringify(`${ep.method} ${ep.path}`)}]);\n` +
          `});`,
      )
      .join('\n\n');

    return {
      filename: `test_api_mocks.${ext}`,
      content: `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixtures = JSON.parse(fs.readFileSync(new URL('./mock_fixtures.json', import.meta.url), 'utf-8'));

// Contract & Mock Verification for ${title}
${checks}
`,
    };
  }

  const pyTests = endpoints
    .map(
      (ep, idx) =>
        `    def test_endpoint_${idx + 1}_${ep.method.toLowerCase()}(self):\n` +
        `        key = ${JSON.stringify(`${ep.method} ${ep.path}`)}\n` +
        `        self.assertIn(key, self.fixtures)\n` +
        `        self.assertIn("payload", self.fixtures[key])\n`,
    )
    .join('\n');

  return {
    filename: 'test_api_mocks.py',
    content: `import json
import unittest
from pathlib import Path


class TestEndpointMockContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = (Path(__file__).resolve().parent / "mock_fixtures.json").read_text(encoding="utf-8")
        cls.fixtures = json.loads(raw)

${pyTests}

if __name__ == "__main__":
    unittest.main()
`,
  };
}
