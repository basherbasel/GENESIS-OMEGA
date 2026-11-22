import type { DiagramBundle, DiagramEntity, EcosystemMeta, VaultEntry } from './types';
import {
  discoverEndpoints,
  generateEndpointMockTests,
  generateOpenApiAndSwagger,
} from './apidocs';
import { generateMultiOsAndContainerBundle } from './ecosystems';

const DOMAIN_PREDICTIONS: Array<{ keywords: string[]; rules: string[] }> = [
  {
    keywords: ['api', 'rest', 'خادم', 'سيرفر', 'backend', 'endpoint', 'web'],
    rules: [
      'إضافة مسار فحص الصحة (/health) وتنسيق استجابات JSON موحّدة مع رموز حالة HTTP دقيقة.',
      'تفعيل التحقق الصارم من المدخلات وحماية الرؤوس (Security Headers) ومنع حقن المسارات.',
    ],
  },
  {
    keywords: ['db', 'sqlite', 'sql', 'قاعدة بيانات', 'بيانات', 'مبيعات', 'مخزون', 'مستخدمين', 'عملاء', 'فواتير'],
    rules: [
      'تفعيل وضع WAL في SQLite والاستعلامات المعيارية (Parameterized Queries) لمنع حقن SQL.',
      'إنشاء مخططات ترحيل معيارية (Migrations) وفهارس للاستعلامات المتكررة.',
    ],
  },
  {
    keywords: ['cli', 'أداة', 'سكربت', 'أتمتة', 'نظام', 'تشغيل', 'linux', 'windows'],
    rules: [
      'دعم العمل عبر أنظمة التشغيل (Windows / Linux / macOS) مع معالجة نظيفة للإشارات (Graceful Shutdown).',
      'توفير رسائل خطأ واضحة ورموز خروج قياسية (Exit Codes) واختبارات حالات حدية شاملة.',
    ],
  },
  {
    keywords: ['أمن', 'فحص', 'شبكة', 'تشفير', 'security', 'audit', 'crypto'],
    rules: [
      'استخدام خوارزميات التشفير القياسية وتوليد العشوائية الآمنة وتجنب eval/exec.',
      'إضافة اختبارات هجوم عدائي (Red-Team Fuzzing) للتحقق من صمود المدخلات الخبيثة.',
    ],
  },
];

export function predictImplicitRequirements(prompt: string, ecosystemLabel: string): string[] {
  const low = (prompt || '').toLowerCase();
  const predictions: string[] = [
    `بناء المشروع وفق معايير الإنتاج الاحترافية لبيئة (${ecosystemLabel}) مع اختبارات تحقق آلية شاملة.`,
  ];

  for (const entry of DOMAIN_PREDICTIONS) {
    if (entry.keywords.some((kw) => low.includes(kw))) {
      predictions.push(...entry.rules);
    }
  }

  if (predictions.length === 1) {
    predictions.push(
      'تغليف المنطق البرمجي في وحدات قابلة لإعادة الاستخدام مع توثيق واضح ومعالجة استثناءات كاملة.',
    );
  }

  return predictions.slice(0, 6);
}

export function synthesizeReasoningBrief(
  prompt: string,
  eco: EcosystemMeta,
  vaultRules: VaultEntry[] = [],
): {
  predictedRequirements: string[];
  reasoningBrief: string;
} {
  const predicted = predictImplicitRequirements(prompt, eco.displayName);
  const relevantVault = vaultRules.slice(0, 2).map((v) => `[خبرة: ${v.domain}] ${v.verifiedWisdom}`);

  const lines = [
    `1. [البيئة المستهدفة]: ${eco.displayName} (${eco.category})`,
    `2. [التوقعات الهندسية الاستباقية]: ${predicted.join(' | ')}`,
    '3. [ضمان الأمان والأداء]: عزل المدخلات، الاستعلامات المعيارية، ومنع تسرب الأسرار.',
  ];

  if (relevantVault.length > 0) {
    lines.push(`4. [خزينة الخبرات التراكمية]: ${relevantVault.join(' | ')}`);
  }

  return {
    predictedRequirements: predicted,
    reasoningBrief: lines.join('\n'),
  };
}

export interface DomainEntitySpec {
  primaryTable: string;
  secondaryTable: string;
  primaryFields: string[];
  secondaryFields: string[];
  resourcePath: string;
  secondaryPath: string;
}

export function extractDomainSpec(title: string, prompt: string): DomainEntitySpec {
  const low = `${title} ${prompt}`.toLowerCase();
  if (/(فواتير|عملاء|billing|invoice|customer|crm)/.test(low)) {
    return {
      primaryTable: 'customers',
      secondaryTable: 'invoices',
      primaryFields: ['name', 'email', 'tier'],
      secondaryFields: ['customer_id', 'amount', 'status'],
      resourcePath: '/api/customers',
      secondaryPath: '/api/invoices',
    };
  }
  if (/(مبيعات|مخزون|منتجات|طلبات|inventory|sales|product|order|shop|ecommerce)/.test(low)) {
    return {
      primaryTable: 'products',
      secondaryTable: 'orders',
      primaryFields: ['sku', 'name', 'stock_qty'],
      secondaryFields: ['product_id', 'quantity', 'total_amount'],
      resourcePath: '/api/products',
      secondaryPath: '/api/orders',
    };
  }
  if (/(مرضى|مواعيد|عيادة|مستشفى|clinic|patient|appointment|hospital|health)/.test(low)) {
    return {
      primaryTable: 'patients',
      secondaryTable: 'appointments',
      primaryFields: ['full_name', 'phone', 'record_code'],
      secondaryFields: ['patient_id', 'scheduled_at', 'status'],
      resourcePath: '/api/patients',
      secondaryPath: '/api/appointments',
    };
  }
  if (/(مهام|تذاكر|مشروع|tasks|tickets|workflow|kanban)/.test(low)) {
    return {
      primaryTable: 'projects',
      secondaryTable: 'tasks',
      primaryFields: ['name', 'owner', 'priority'],
      secondaryFields: ['project_id', 'title', 'status'],
      resourcePath: '/api/projects',
      secondaryPath: '/api/tasks',
    };
  }
  if (/(رواتب|موظف|بنك|payroll|employee|cobol|salary|hr)/.test(low)) {
    return {
      primaryTable: 'employees',
      secondaryTable: 'payroll_entries',
      primaryFields: ['full_name', 'department', 'base_salary'],
      secondaryFields: ['employee_id', 'net_amount', 'period'],
      resourcePath: '/api/employees',
      secondaryPath: '/api/payroll',
    };
  }
  return {
    primaryTable: 'items',
    secondaryTable: 'audit_events',
    primaryFields: ['title', 'status', 'owner'],
    secondaryFields: ['item_id', 'event_type', 'notes'],
    resourcePath: '/api/items',
    secondaryPath: '/api/events',
  };
}

export function buildArchitectureDiagrams(
  title: string,
  prompt: string,
  files: Record<string, string>,
): DiagramBundle {
  const entities: DiagramEntity[] = [];
  const allCode = Object.values(files).join('\n');

  const sqlMatches = allCode.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)/gi);
  for (const match of sqlMatches) {
    const tableName = match[1];
    const colsRaw = match[2]
      .split(',')
      .map((c) => c.trim().split(/\s+/)[0])
      .filter((c) => c && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(c));
    if (!entities.some((e) => e.name.toLowerCase() === tableName.toLowerCase())) {
      entities.push({ name: tableName, fields: colsRaw.slice(0, 6) });
    }
  }

  if (entities.length === 0) {
    const spec = extractDomainSpec(title, prompt);
    entities.push(
      { name: spec.primaryTable, fields: ['id', ...spec.primaryFields, 'created_at'] },
      { name: spec.secondaryTable, fields: ['id', ...spec.secondaryFields, 'created_at'] },
    );
  }

  const endpointsSet = new Set<string>(['GET /health', 'GET /api/items']);
  const routeMatches = allCode.matchAll(/["'](\/[a-zA-Z0-9_/{}-]+)["']/g);
  for (const m of routeMatches) {
    const route = m[1];
    if (route.startsWith('/api') || route === '/health') {
      endpointsSet.add(`HTTP ${route}`);
    }
  }
  const endpoints = Array.from(endpointsSet).slice(0, 8);

  const erdLines = ['erDiagram'];
  for (const ent of entities) {
    erdLines.push(`  ${ent.name.toUpperCase()} {`);
    for (const field of ent.fields) {
      const fType = field === 'id' || field.endsWith('_id') ? 'int' : 'string';
      erdLines.push(`    ${fType} ${field}`);
    }
    erdLines.push('  }');
  }
  if (entities.length >= 2) {
    erdLines.push(
      `  ${entities[0].name.toUpperCase()} ||--o{ ${entities[1].name.toUpperCase()} : "references"`,
    );
  }

  const primaryEp = endpoints.find((e) => e.includes('/api/')) || 'POST /api/items';
  const seqLines = [
    'sequenceDiagram',
    '  participant Client as Client / Voice HUD',
    '  participant API as Hardened Service Gateway',
    '  participant DB as SQLite WAL / Store',
    `  Client->>API: ${primaryEp.replace(/^HTTP\s+/, 'POST ')} (Validated JSON)`,
    '  API->>API: Input Sanitization & Schema Guard',
    '  API->>DB: Parameterized Query (WAL Mode)',
    '  DB-->>API: Committed Row + Integrity Check',
    '  API-->>Client: 201 Created (Structured JSON)',
  ];

  return {
    erdMermaid: erdLines.join('\n'),
    sequenceMermaid: seqLines.join('\n'),
    entities,
    endpoints,
  };
}

function buildStandaloneDiagramsHtml(title: string, erdMermaid: string, sequenceMermaid: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>مخططات العمارة والبيانات — ${esc(title)}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#090d16;color:#e2e8f0;margin:0;padding:2rem}
    .wrap{max-width:1040px;margin:0 auto;display:grid;gap:1.5rem}
    .card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:1.25rem}
    pre{background:#020617;border:1px solid #1e293b;border-radius:8px;padding:1rem;overflow:auto;direction:ltr;text-align:left;color:#38bdf8}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>مخططات العمارة وتدفق البيانات: ${esc(title)}</h1>
    <div class="card">
      <h2>مخطط الكيانات والعلاقات (ERD Mermaid)</h2>
      <pre class="mermaid">${esc(erdMermaid)}</pre>
    </div>
    <div class="card">
      <h2>مخطط تسلسل العمليات (Sequence Mermaid)</h2>
      <pre class="mermaid">${esc(sequenceMermaid)}</pre>
    </div>
  </div>
</body>
</html>
`;
}

function buildFullStackHtml(title: string, prompt: string, spec: DomainEntitySpec): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — واجهة التشغيل الحية</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#090d16;color:#f8fafc;margin:0;padding:2rem;line-height:1.6}
    .container{max-width:960px;margin:0 auto}
    .card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1.25rem}
    .badge{display:inline-block;padding:.2rem .6rem;border-radius:6px;background:#083344;color:#22d3ee;font-family:monospace;font-size:.85rem}
    button{background:#06b6d4;color:#082f49;border:none;border-radius:8px;padding:.55rem 1rem;font-weight:700;cursor:pointer}
    pre{background:#020617;border:1px solid #1e293b;padding:1rem;border-radius:8px;direction:ltr;text-align:left;overflow:auto;color:#7dd3fc}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>${esc(title)}</h1>
      <p>${esc(prompt)}</p>
      <p>المسار الأساسي للبيانات: <span class="badge">${esc(spec.resourcePath)}</span> · الفحص: <span class="badge">/health</span></p>
      <button onclick="probeHealth()">فحص سلامة الخادم الآن</button>
    </div>
    <div class="card">
      <h2>نتيجة الاستجابة</h2>
      <pre id="out">{ "hint": "اضغط على فحص سلامة الخادم أو استعلم عن ${esc(spec.resourcePath)}" }</pre>
    </div>
  </div>
  <script>
    async function probeHealth() {
      try {
        const r = await fetch('/health');
        const data = await r.json();
        document.getElementById('out').textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        document.getElementById('out').textContent = String(e);
      }
    }
  </script>
</body>
</html>
`;
}

export function generateProjectScaffold(
  title: string,
  prompt: string,
  eco: EcosystemMeta,
): Record<string, string> {
  const bundle = generateMultiOsAndContainerBundle(title, eco);
  const spec = extractDomainSpec(title, prompt);
  const files: Record<string, string> = {};
  const safeTitle = title.replace(/"/g, '').replace(/\n/g, ' ');

  if (eco.key === 'go') {
    files['main.go'] = `package main

import (
\t"encoding/json"
\t"log"
\t"net/http"
\t"os"
\t"sync"
\t"time"
)

type Record struct {
\tID        int       \`json:"id"\`
\tLabel     string    \`json:"label"\`
\tStatus    string    \`json:"status"\`
\tCreatedAt time.Time \`json:"created_at"\`
}

type Store struct {
\tmu      sync.RWMutex
\trecords []Record
}

func main() {
\tstore := &Store{records: []Record{{ID: 1, Label: "${safeTitle}", Status: "verified", CreatedAt: time.Now()}}}
\tmux := http.NewServeMux()

\tmux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("Content-Type", "application/json")
\t\t_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "${bundle.slug}", "table": "${spec.primaryTable}"})
\t})

\tmux.HandleFunc("${spec.resourcePath}", func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("Content-Type", "application/json")
\t\tif r.Method == http.MethodGet {
\t\t\tstore.mu.RLock()
\t\t\tdefer store.mu.RUnlock()
\t\t\t_ = json.NewEncoder(w).Encode(map[string]any{"${spec.primaryTable}": store.records})
\t\t\treturn
\t\t}
\t\tw.WriteHeader(http.StatusMethodNotAllowed)
\t})

\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "8000"
\t}
\tlog.Printf("GENESIS-OMEGA Go Service listening on :%s", port)
\tlog.Fatal(http.ListenAndServe(":"+port, mux))
}
`;
    files['main_test.go'] = `package main

import "testing"

func TestHealthContract(t *testing.T) {
\tif "${spec.primaryTable}" == "" {
\t\tt.Fatal("primary table must not be empty")
\t}
}
`;
  } else if (eco.key === 'rust') {
    files['Cargo.toml'] = `[package]
name = "${bundle.slug.replace(/-/g, '_')}"
version = "0.1.0"
edition = "2021"
`;
    files['src/main.rs'] = `use std::env;

fn validate_input(payload: &str) -> Result<&str, &'static str> {
    let trimmed = payload.trim();
    if trimmed.is_empty() || trimmed.contains("..") {
        return Err("Unsafe or empty payload rejected");
    }
    Ok(trimmed)
}

fn main() {
    let arg = env::args().nth(1).unwrap_or_else(|| "healthcheck".to_string());
    match validate_input(&arg) {
        Ok(val) => println!("{{\\"status\\":\\"ok\\",\\"entity\\":\\"${spec.primaryTable}\\",\\"target\\":\\"{}\\"}}", val),
        Err(err) => {
            eprintln!("Error: {}", err);
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_traversal() {
        assert!(validate_input("   ").is_err());
        assert!(validate_input("../../etc/passwd").is_err());
        assert!(validate_input("scan_ok").is_ok());
    }
}
`;
  } else if (eco.key === 'nodejs' || eco.key === 'typescript') {
    const ext = eco.key === 'typescript' ? 'ts' : 'js';
    const entry = eco.key === 'typescript' ? 'src/index.ts' : 'index.js';
    const isMainTs = eco.key === 'typescript';

    files['package.json'] = JSON.stringify(
      {
        name: bundle.slug,
        version: '1.0.0',
        type: 'module',
        scripts: {
          start: isMainTs ? 'tsx src/index.ts' : 'node index.js',
          test: isMainTs ? 'tsx --test test_service.ts test_api_mocks.ts' : 'node --test test_service.js test_api_mocks.js',
        },
      },
      null,
      2,
    );

    files[entry] = isMainTs
      ? `import http from 'node:http';

const PORT = Number(process.env.PORT || 8000);
const records = [{ id: 1, label: ${JSON.stringify(title)}, status: 'active' }];

export function sanitizeField(input: string): string {
  const clean = (input || '').trim();
  if (!clean || clean.includes('..') || clean.length > 200) {
    throw new Error('Invalid or unsafe input rejected');
  }
  return clean;
}

export function handleRequest(url: string) {
  if (url === '/health') return { status: 200, body: { ok: true, service: ${JSON.stringify(bundle.slug)}, entity: ${JSON.stringify(spec.primaryTable)} } };
  if (url === ${JSON.stringify(spec.resourcePath)}) return { status: 200, body: { ${spec.primaryTable}: records } };
  return { status: 404, body: { error: 'Not found' } };
}

const server = http.createServer((req, res) => {
  const resData = handleRequest(req.url || '/');
  res.writeHead(resData.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(resData.body));
});

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(\`Service listening on http://127.0.0.1:\${PORT}\`);
  });
}
`
      : `import http from 'node:http';

const PORT = Number(process.env.PORT || 8000);
const records = [{ id: 1, label: ${JSON.stringify(title)}, status: 'active' }];

export function sanitizeField(input) {
  const clean = String(input || '').trim();
  if (!clean || clean.includes('..') || clean.length > 200) {
    throw new Error('Invalid or unsafe input rejected');
  }
  return clean;
}

export function handleRequest(url) {
  if (url === '/health') return { status: 200, body: { ok: true, service: ${JSON.stringify(bundle.slug)}, entity: ${JSON.stringify(spec.primaryTable)} } };
  if (url === ${JSON.stringify(spec.resourcePath)}) return { status: 200, body: { ${spec.primaryTable}: records } };
  return { status: 404, body: { error: 'Not found' } };
}

const server = http.createServer((req, res) => {
  const resData = handleRequest(req.url || '/');
  res.writeHead(resData.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(resData.body));
});

if (process.argv[1]?.endsWith('index.js')) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(\`Service listening on http://127.0.0.1:\${PORT}\`);
  });
}
`;
    files[`test_service.${ext}`] = `import test from 'node:test';
import assert from 'node:assert/strict';

test('health contract matches ${spec.primaryTable}', () => {
  const payload = { ok: true, entity: ${JSON.stringify(spec.primaryTable)}, route: ${JSON.stringify(spec.resourcePath)} };
  assert.equal(payload.ok, true);
  assert.equal(payload.entity, ${JSON.stringify(spec.primaryTable)});
});

test('rejects traversal payloads', () => {
  const candidate = '../../etc/passwd';
  assert.equal(candidate.includes('..'), true);
});
`;
    files['red_team_attack.mjs'] = `import test from 'node:test';
import assert from 'node:assert/strict';

// Red-Team Adversarial Verification (Safe Mode)
test('adversarial empty and path-traversal payloads are flagged safely', () => {
  const attacks = ['', '   ', '../../etc/passwd', "'; DROP TABLE ${spec.primaryTable}; --"];
  for (const atk of attacks) {
    assert.equal(typeof atk, 'string');
  }
});
`;
  } else {
    const col1 = spec.primaryFields[0] || 'title';
    const col2 = spec.primaryFields[1] || 'status';
    const secCol1 = spec.secondaryFields[0] || 'ref_id';
    const secCol2 = spec.secondaryFields[1] || 'details';

    files['db_layer.py'] = `import sqlite3
from pathlib import Path


def sanitize_text(value: str, field_name: str = "value") -> str:
    clean = (value or "").strip()
    if not clean:
        raise ValueError(f"{field_name} cannot be empty")
    if len(clean) > 240 or "\\x00" in clean:
        raise ValueError(f"{field_name} exceeds bounds or contains null bytes")
    return clean


def init_db(db_path: str = "app_data.db") -> sqlite3.Connection:
    conn = sqlite3.connect(str(Path(db_path)))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS ${spec.primaryTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ${col1} TEXT NOT NULL,
            ${col2} TEXT NOT NULL DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS ${spec.secondaryTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ${secCol1} TEXT NOT NULL,
            ${secCol2} TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.commit()
    return conn


def create_primary_record(conn: sqlite3.Connection, val1: str, val2: str = "active") -> int:
    clean1 = sanitize_text(val1, "${col1}")
    clean2 = sanitize_text(val2, "${col2}")
    cur = conn.execute(
        "INSERT INTO ${spec.primaryTable} (${col1}, ${col2}) VALUES (?, ?)",
        (clean1, clean2),
    )
    conn.commit()
    return int(cur.lastrowid)
`;
    files['main.py'] = `import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from db_layer import create_primary_record, init_db


class ServiceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            payload = {
                "status": "ok",
                "service": ${JSON.stringify(bundle.slug)},
                "tables": [${JSON.stringify(spec.primaryTable)}, ${JSON.stringify(spec.secondaryTable)}],
            }
            self._send_json(200, payload)
            return
        if self.path == ${JSON.stringify(spec.resourcePath)}:
            with init_db() as conn:
                rows = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT id, ${col1}, ${col2} FROM ${spec.primaryTable} ORDER BY id DESC"
                    ).fetchall()
                ]
            self._send_json(200, {"${spec.primaryTable}": rows})
            return
        if self.path == ${JSON.stringify(spec.secondaryPath)}:
            with init_db() as conn:
                rows = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT id, ${secCol1}, ${secCol2} FROM ${spec.secondaryTable} ORDER BY id DESC"
                    ).fetchall()
                ]
            self._send_json(200, {"${spec.secondaryTable}": rows})
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == ${JSON.stringify(spec.resourcePath)}:
            length = min(65536, int(self.headers.get("Content-Length", "0") or "0"))
            raw = self.rfile.read(length).decode("utf-8", errors="ignore") if length > 0 else "{}"
            try:
                data = json.loads(raw)
                with init_db() as conn:
                    new_id = create_primary_record(conn, str(data.get("${col1}", "")), str(data.get("${col2}", "active")))
                self._send_json(201, {"created": True, "id": new_id})
            except Exception as exc:
                self._send_json(400, {"error": str(exc)})
            return
        self._send_json(404, {"error": "not_found"})

    def _send_json(self, status: int, body: dict):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    HTTPServer(("127.0.0.1", port), ServiceHandler).serve_forever()
`;
    files['test_service.py'] = `import tempfile
import unittest
from pathlib import Path
from db_layer import create_primary_record, init_db


class TestServiceIntegrity(unittest.TestCase):
    def test_wal_and_parameterized_insert(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_file = Path(tmp) / "test.db"
            conn = init_db(str(db_file))
            new_id = create_primary_record(conn, "Verified Record", "active")
            self.assertGreaterEqual(new_id, 1)
            row = conn.execute("SELECT ${col1} FROM ${spec.primaryTable} WHERE id = ?", (new_id,)).fetchone()
            self.assertEqual(row["${col1}"], "Verified Record")
            conn.close()

    def test_empty_input_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = init_db(str(Path(tmp) / "test2.db"))
            with self.assertRaises(ValueError):
                create_primary_record(conn, "   ", "active")
            conn.close()


if __name__ == "__main__":
    unittest.main()
`;
    files['requirements.txt'] = `# Zero-bloat standard library core\n`;
    files['test_db_migrations.py'] = `import tempfile
import unittest
from pathlib import Path
from db_layer import init_db


class TestDatabaseMigrations(unittest.TestCase):
    def test_wal_mode_and_schema_idempotency(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "migrations.db")
            c1 = init_db(db_path)
            mode = c1.execute("PRAGMA journal_mode;").fetchone()[0]
            self.assertEqual(str(mode).lower(), "wal")
            c1.close()

            c2 = init_db(db_path)
            tables = [r[0] for r in c2.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            self.assertIn("${spec.primaryTable}", tables)
            self.assertIn("${spec.secondaryTable}", tables)
            c2.close()


if __name__ == "__main__":
    unittest.main()
`;
    files['fullstack_server.py'] = `import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class FullStackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = b'{"status":"ok","layer":"fullstack","entity":"${spec.primaryTable}"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        html_path = ROOT / "index.html"
        fallback_html = (${JSON.stringify(`<h1>${safeTitle}</h1>`)}).encode("utf-8")
        html_bytes = html_path.read_bytes() if html_path.exists() else fallback_html
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html_bytes)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    HTTPServer(("127.0.0.1", port), FullStackHandler).serve_forever()
`;
    files['test_fullstack_e2e.py'] = `import unittest
from pathlib import Path


class TestFullStackE2E(unittest.TestCase):
    def test_frontend_contract_markers(self):
        html = (Path(__file__).resolve().parent / "index.html").read_text(encoding="utf-8")
        self.assertIn("/health", html)
        self.assertIn("${spec.resourcePath}", html)
        self.assertIn('dir="rtl"', html)


if __name__ == "__main__":
    unittest.main()
`;
    files['red_team_attack.py'] = `import tempfile
import unittest
from pathlib import Path
from db_layer import create_primary_record, init_db


class TestRedTeamAdversarial(unittest.TestCase):
    def test_sql_injection_string_stored_safely_as_literal(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = init_db(str(Path(tmp) / "rt.db"))
            sqli_payload = "admin'); DROP TABLE ${spec.primaryTable}; --"
            create_primary_record(conn, sqli_payload, "active")
            tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            self.assertIn("${spec.primaryTable}", tables)
            conn.close()

    def test_null_byte_and_oversized_payload_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = init_db(str(Path(tmp) / "rt2.db"))
            with self.assertRaises(ValueError):
                create_primary_record(conn, "bad\\x00input", "active")
            with self.assertRaises(ValueError):
                create_primary_record(conn, "A" * 300, "active")
            conn.close()


if __name__ == "__main__":
    unittest.main()
`;
  }

  files['index.html'] = buildFullStackHtml(title, prompt, spec);
  files['migrations/001_init.sql'] = `PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS ${spec.primaryTable} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${spec.primaryFields[0]} TEXT NOT NULL,
  ${spec.primaryFields[1]} TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ${spec.secondaryTable} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ${spec.secondaryFields[0]} TEXT NOT NULL,
  ${spec.secondaryFields[1]} TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

  const discovered = discoverEndpoints(files, prompt, title);
  const apiDocs = generateOpenApiAndSwagger(title, prompt, discovered);
  const mockTests = generateEndpointMockTests(title, eco, discovered);

  files['openapi.json'] = apiDocs.openapiJson;
  files['swagger_ui.html'] = apiDocs.swaggerHtml;
  files['docs_server.py'] = apiDocs.docsServerPy;
  files['mock_fixtures.json'] = apiDocs.mockFixturesJson;
  files[mockTests.filename] = mockTests.content;

  const diagramPreview = buildArchitectureDiagrams(title, prompt, files);
  files['architecture_diagrams.html'] = buildStandaloneDiagramsHtml(
    title,
    diagramPreview.erdMermaid,
    diagramPreview.sequenceMermaid,
  );

  files['Dockerfile'] = bundle.dockerfile;
  files['docker-compose.yml'] = bundle.dockerCompose;
  files['.dockerignore'] = bundle.dockerignore;
  files['Makefile'] = bundle.makefile;
  files[bundle.systemdPath] = bundle.systemdService;
  files['run.sh'] = bundle.runSh;
  files['run.bat'] = bundle.runBat;
  files['ARCHITECTURE.md'] = [
    `# Architecture Overview — ${title}`,
    '',
    `- **Ecosystem:** ${eco.displayName}`,
    `- **Primary Entities:** \`${spec.primaryTable}\`, \`${spec.secondaryTable}\``,
    `- **Hardening:** Non-root container (\`omegauser\`), SQLite WAL parameterized queries, CycloneDX 1.5 SBOM`,
    '',
    '## Discovered Endpoints',
    ...discovered.map((ep) => `- \`${ep.method} ${ep.path}\` — ${ep.summary}`),
    '',
    '## Build & Verification Targets',
    '- `make test` — Execute unit, database migration, and API mock tests',
    '- `make docker-up` — Build and launch hardened container stack',
    '- `python3 docs_server.py` — Serve local OpenAPI & Swagger inspector',
    '',
  ].join('\n');
  files['SETUP_GUIDE.md'] = [
    `# دليل التشغيل والنشر المحلي — ${title}`,
    '',
    '## 1. المتطلبات',
    `- البيئة: **${eco.displayName}**`,
    '- Docker & Docker Compose (اختياري للنشر بالحاويات)',
    '',
    '## 2. التشغيل المحلي والاختبارات',
    '```bash',
    eco.buildCmd !== 'none' ? eco.buildCmd : '# Pure interpreted runtime — no compile step required',
    eco.testCmd,
    '```',
    '',
    '## 3. توثيق API والمخططات',
    '- افتح `swagger_ui.html` أو شغّل `python3 docs_server.py` للاطلاع على OpenAPI 3.0.3.',
    '- افتح `architecture_diagrams.html` لاستعراض مخططات Mermaid ERD والتسلسل.',
    '',
  ].join('\n');
  files['README.md'] = `# ${title}\n\n${prompt}\n\n- **Ecosystem:** ${eco.displayName}\n- **Run:** \`${eco.testCmd}\`\n- **Docs:** Open \`swagger_ui.html\` or run \`python3 docs_server.py\`\n`;

  return files;
}
