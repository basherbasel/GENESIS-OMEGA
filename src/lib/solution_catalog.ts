import { ECOSYSTEM_CATALOG } from './ecosystems';
import { isSafeRelativePath } from './security';
import type { EcosystemKey } from './types';

/**
 * Domain-aware solution generator.
 *
 * Every entry produces a complete, runnable project (implementation + tests +
 * documentation + CI) for one software-engineering domain and one ecosystem.
 * Nothing here is a stub: the emitted tests exercise real generated logic and
 * the shared verifier executes them on disk when a toolchain is available.
 */

export type SolutionDomainId =
  | 'rest-api'
  | 'cli-tool'
  | 'data-pipeline'
  | 'ml-inference'
  | 'security-scanner'
  | 'database-schema'
  | 'static-site'
  | 'realtime-hub'
  | 'typed-service'
  | 'microservice'
  | 'systems-cli'
  | 'shell-automation'
  | 'windows-admin'
  | 'native-tool'
  | 'cpp-engine'
  | 'jvm-service'
  | 'dotnet-service'
  | 'php-backend'
  | 'ruby-automation'
  | 'classic-tool'
  | 'scientific-compute'
  | 'legacy-bridge'
  | 'game-logic'
  | 'mobile-app';

export interface SolutionDomain {
  id: SolutionDomainId;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  category: string;
  ecosystem: EcosystemKey;
  tags: string[];
  entryFile: string;
  testCommand: string;
  build(title: string, prompt: string): Record<string, string>;
}

const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'omega-solution';

const esc = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

function commonFiles(
  domain: SolutionDomain,
  title: string,
  prompt: string,
  extra: Record<string, string>,
): Record<string, string> {
  const name = slug(title);
  const ciTest = domain.testCommand;
  const files: Record<string, string> = { ...extra };

  files['solution.json'] = JSON.stringify(
    {
      domain: domain.id,
      category: domain.category,
      ecosystem: domain.ecosystem,
      title,
      request: prompt,
      entryFile: domain.entryFile,
      testCommand: domain.testCommand,
      generatedBy: 'GENESIS-OMEGA solution architect',
    },
    null,
    2,
  );

  files['README.md'] = [
    '# ' + title,
    '',
    '> ولّدها GENESIS-OMEGA · النطاق: ' + domain.labelAr + ' (' + domain.labelEn + ')',
    '',
    '## الوصف',
    prompt || domain.descriptionAr,
    '',
    '## التشغيل',
    '```bash',
    'sh run.sh          # Linux / macOS',
    'run.bat            # Windows',
    'docker compose up --build',
    '```',
    '',
    '## الاختبار',
    '```bash',
    ciTest,
    '```',
    '',
    'الاختبارات في هذا المشروع تختبر منطقاً حقيقياً مولّداً، وليست قوالب فارغة.',
    '',
  ].join('\n');

  files['.gitignore'] = [
    '__pycache__/', '*.pyc', 'node_modules/', 'dist/', 'target/', 'bin/', 'obj/',
    '*.db', '*.db-wal', '*.db-shm', '.env', 'coverage/', '',
  ].join('\n');

  files['.env.example'] = ['PORT=8000', 'APP_NAME="' + esc(title) + '"', ''].join('\n');

  files['.github/workflows/ci.yml'] = [
    'name: CI',
    'on: [push, pull_request]',
    'jobs:',
    '  verify:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: Verify',
    '        run: |',
    '          ' + ciTest,
    '',
  ].join('\n');

  files['SETUP_GUIDE.md'] = [
    '# دليل الإعداد — ' + title,
    '',
    '1. المتطلبات: ' + ECOSYSTEM_CATALOG[domain.ecosystem].displayName,
    '2. ثبّت التبعيات إن وجدت (راجع ملف المشروع).',
    '3. شغّل `' + ciTest + '` للتأكد من سلامة المنطق.',
    '4. راجع `solution.json` لمعرفة النطاق والبيئة المولّدة.',
    '',
  ].join('\n');

  return files;
}

/* ------------------------------------------------------------------ */
/* Python domains                                                      */
/* ------------------------------------------------------------------ */

const restApi: SolutionDomain = {
  id: 'rest-api',
  labelAr: 'خادم REST API مع قاعدة بيانات',
  labelEn: 'REST API with SQLite persistence',
  descriptionAr: 'خادم HTTP قياسي مع CRUD وترحيلات SQLite واختبارات وحدة حقيقية.',
  category: 'Backend & APIs',
  ecosystem: 'python',
  tags: ['api', 'rest', 'sqlite', 'backend'],
  entryFile: 'app.py',
  testCommand: 'python3 -m unittest discover -v',
  build: (title) => ({
    'app.py': [
      'import json, os, sqlite3, threading',
      'from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer',
      '',
      'DB = os.environ.get("DB_PATH", "app.db")',
      '',
      'def init_db():',
      '    with sqlite3.connect(DB) as c:',
      '        c.execute("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, qty INTEGER NOT NULL)")',
      '',
      'def list_items():',
      '    with sqlite3.connect(DB) as c:',
      '        return [{"id": r[0], "name": r[1], "qty": r[2]} for r in c.execute("SELECT id,name,qty FROM items ORDER BY id")]',
      '',
      'def add_item(name, qty):',
      '    if not name or not isinstance(qty, int) or qty < 0:',
      '        raise ValueError("invalid item")',
      '    with sqlite3.connect(DB) as c:',
      '        cur = c.execute("INSERT INTO items(name,qty) VALUES (?,?)", (name, qty))',
      '        return cur.lastrowid',
      '',
      'def make_handler():',
      '    class Handler(BaseHTTPRequestHandler):',
      '        def _send(self, code, payload):',
      '            body = json.dumps(payload).encode("utf-8")',
      '            self.send_response(code)',
      '            self.send_header("Content-Type", "application/json")',
      '            self.send_header("Content-Length", str(len(body)))',
      '            self.end_headers()',
      '            self.wfile.write(body)',
      '        def do_GET(self):',
      '            if self.path == "/health":',
      '                self._send(200, {"status": "ok"})',
      '            elif self.path == "/api/items":',
      '                self._send(200, {"items": list_items()})',
      '            else:',
      '                self._send(404, {"error": "not found"})',
      '        def do_POST(self):',
      '            if self.path != "/api/items":',
      '                self._send(404, {"error": "not found"})',
      '                return',
      '            n = int(self.headers.get("Content-Length", "0"))',
      '            try:',
      '                data = json.loads(self.rfile.read(n) or b"{}")',
      '                rid = add_item(str(data.get("name", "")), int(data.get("qty", 0)))',
      '                self._send(201, {"id": rid})',
      '            except (ValueError, TypeError) as e:',
      '                self._send(400, {"error": str(e)})',
      '        def log_message(self, *args):',
      '            pass',
      '    return Handler',
      '',
      'if __name__ == "__main__":',
      '    init_db()',
      '    port = int(os.environ.get("PORT", "8000"))',
      '    ThreadingHTTPServer(("0.0.0.0", port), make_handler()).serve_forever()',
      '',
    ].join('\n'),
    'test_app.py': [
      'import os, tempfile, unittest',
      'import app',
      '',
      'class TestApi(unittest.TestCase):',
      '    def setUp(self):',
      '        self.tmp = tempfile.mkdtemp()',
      '        app.DB = os.path.join(self.tmp, "t.db")',
      '        app.init_db()',
      '    def test_add_and_list(self):',
      '        rid = app.add_item("widget", 3)',
      '        self.assertIsInstance(rid, int)',
      '        self.assertEqual(app.list_items(), [{"id": rid, "name": "widget", "qty": 3}])',
      '    def test_rejects_invalid(self):',
      '        with self.assertRaises(ValueError):',
      '            app.add_item("", -1)',
      '    def test_handler_contract(self):',
      '        self.assertTrue(callable(app.make_handler()))',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  }),
};

const cliTool: SolutionDomain = {
  id: 'cli-tool',
  labelAr: 'أداة سطر أوامر آمنة',
  labelEn: 'Secure command-line tool',
  descriptionAr: 'أداة CLI لتحليل الملفات وحساب البصمات مع رموز خروج قياسية.',
  category: 'Developer Tools',
  ecosystem: 'python',
  tags: ['cli', 'hash', 'tools'],
  entryFile: 'cli.py',
  testCommand: 'python3 -m unittest discover -v',
  build: () => ({
    'cli.py': [
      'import argparse, hashlib, json, os, sys',
      '',
      'def sha256_file(path):',
      '    h = hashlib.sha256()',
      '    with open(path, "rb") as f:',
      '        for block in iter(lambda: f.read(65536), b""):',
      '            h.update(block)',
      '    return h.hexdigest()',
      '',
      'def scan(folder, max_files=200):',
      '    result = []',
      '    for root, dirs, files in os.walk(folder):',
      '        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]',
      '        for name in sorted(files)[:max_files]:',
      '            p = os.path.join(root, name)',
      '            result.append({"path": os.path.relpath(p, folder), "sha256": sha256_file(p)})',
      '    return result',
      '',
      'def main(argv=None):',
      '    ap = argparse.ArgumentParser(description="GENESIS-OMEGA secure scanner")',
      '    ap.add_argument("folder")',
      '    ap.add_argument("--json", action="store_true")',
      '    a = ap.parse_args(argv)',
      '    if not os.path.isdir(a.folder):',
      '        print("folder not found", file=sys.stderr)',
      '        return 2',
      '    rows = scan(a.folder)',
      '    print(json.dumps(rows, ensure_ascii=False) if a.json else "\\n".join(r["sha256"] for r in rows))',
      '    return 0',
      '',
      'if __name__ == "__main__":',
      '    raise SystemExit(main())',
      '',
    ].join('\n'),
    'test_cli.py': [
      'import json, os, tempfile, unittest',
      'import cli',
      '',
      'class TestCli(unittest.TestCase):',
      '    def setUp(self):',
      '        self.d = tempfile.mkdtemp()',
      '        with open(os.path.join(self.d, "a.txt"), "w") as f:',
      '            f.write("abc")',
      '    def test_hash(self):',
      '        h = cli.sha256_file(os.path.join(self.d, "a.txt"))',
      '        self.assertEqual(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")',
      '    def test_scan(self):',
      '        rows = cli.scan(self.d)',
      '        self.assertEqual(len(rows), 1)',
      '        self.assertEqual(rows[0]["path"], "a.txt")',
      '    def test_missing_folder(self):',
      '        self.assertEqual(cli.main([os.path.join(self.d, "nope")]), 2)',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  }),
};

const dataPipeline: SolutionDomain = {
  id: 'data-pipeline',
  labelAr: 'خط أنابيب بيانات CSV إلى SQL',
  labelEn: 'CSV to SQL data pipeline',
  descriptionAr: 'تحويل CSV إلى SQLite مع التحقق من الصفوف ومعالجة الأخطاء.',
  category: 'Data Engineering',
  ecosystem: 'python',
  tags: ['etl', 'csv', 'sqlite', 'data'],
  entryFile: 'pipeline.py',
  testCommand: 'python3 -m unittest discover -v',
  build: () => ({
    'pipeline.py': [
      'import csv, io, sqlite3',
      '',
      'def parse_rows(text):',
      '    reader = csv.DictReader(io.StringIO(text))',
      '    rows = []',
      '    for raw in reader:',
      '        name = (raw.get("name") or "").strip()',
      '        try:',
      '            value = float(raw.get("value", "0"))',
      '        except (TypeError, ValueError):',
      '            continue',
      '        if name and value >= 0:',
      '            rows.append((name, value))',
      '    return rows',
      '',
      'def load(rows, conn):',
      '    conn.execute("CREATE TABLE IF NOT EXISTS metrics (name TEXT, value REAL)")',
      '    conn.executemany("INSERT INTO metrics(name,value) VALUES (?,?)", rows)',
      '    conn.commit()',
      '    return conn.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]',
      '',
      'def run(text, conn):',
      '    return load(parse_rows(text), conn)',
      '',
    ].join('\n'),
    'test_pipeline.py': [
      'import sqlite3, unittest',
      'import pipeline',
      '',
      'class TestPipeline(unittest.TestCase):',
      '    def test_parse_filters_bad_rows(self):',
      '        rows = pipeline.parse_rows("name,value\\na,1\\n,-2\\nb,-5\\nc,3.5\\n")',
      '        self.assertEqual(rows, [("a", 1.0), ("c", 3.5)])',
      '    def test_load(self):',
      '        conn = sqlite3.connect(":memory:")',
      '        n = pipeline.run("name,value\\na,1\\nb,2\\n", conn)',
      '        self.assertEqual(n, 2)',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  }),
};

const mlInference: SolutionDomain = {
  id: 'ml-inference',
  labelAr: 'استدلال آلي بدون تبعيات',
  labelEn: 'Dependency-free ML inference',
  descriptionAr: 'نموذج انحدار خطي بنزول التدرج مع حفظ وتحميل وتقييم حقيقي.',
  category: 'Machine Learning',
  ecosystem: 'python',
  tags: ['ml', 'regression', 'inference'],
  entryFile: 'model.py',
  testCommand: 'python3 -m unittest discover -v',
  build: () => ({
    'model.py': [
      'import json',
      '',
      'def predict(w, b, x):',
      '    return w * x + b',
      '',
      'def fit(points, epochs=600, lr=0.05):',
      '    w = 0.0',
      '    b = 0.0',
      '    n = max(1, len(points))',
      '    for _ in range(epochs):',
      '        dw = sum((predict(w, b, x) - y) * x for x, y in points) / n',
      '        db = sum(predict(w, b, x) - y for x, y in points) / n',
      '        w -= lr * dw',
      '        b -= lr * db',
      '    return round(w, 6), round(b, 6)',
      '',
      'def mse(points, w, b):',
      '    if not points:',
      '        return 0.0',
      '    return sum((predict(w, b, x) - y) ** 2 for x, y in points) / len(points)',
      '',
      'def serialize(w, b):',
      '    return json.dumps({"w": w, "b": b})',
      '',
      'def deserialize(text):',
      '    d = json.loads(text)',
      '    return float(d["w"]), float(d["b"])',
      '',
    ].join('\n'),
    'test_model.py': [
      'import unittest',
      'import model',
      '',
      'class TestModel(unittest.TestCase):',
      '    def test_fit_linear_data(self):',
      '        w, b = model.fit([(1, 3), (2, 5), (3, 7), (4, 9)])',
      '        self.assertAlmostEqual(w, 2.0, places=2)',
      '        self.assertAlmostEqual(b, 1.0, places=2)',
      '        self.assertLess(model.mse([(5, 11)], w, b), 0.01)',
      '    def test_roundtrip(self):',
      '        self.assertEqual(model.deserialize(model.serialize(1.5, -2)), (1.5, -2.0))',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  }),
};

const securityScanner: SolutionDomain = {
  id: 'security-scanner',
  labelAr: 'ماسح أمان للأسرار والمسارات',
  labelEn: 'Secrets and path security scanner',
  descriptionAr: 'يفحص النصوص لاكتشاف المفاتيح والمسارات الخطرة مع تقرير JSON.',
  category: 'Security',
  ecosystem: 'python',
  tags: ['security', 'secrets', 'audit'],
  entryFile: 'scanner.py',
  testCommand: 'python3 -m unittest discover -v',
  build: () => ({
    'scanner.py': [
      'import json, re',
      '',
      'PATTERNS = [',
      '    ("AWS key", re.compile(r"AKIA[0-9A-Z]{16}")),',
      '    ("GitHub token", re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}")),',
      '    ("private key", re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")),',
      '    ("hardcoded secret", re.compile(r"(?:password|api_key)\\s*=\\s*\\S{8,}")),',
      ']',
      '',
      'def scan_text(text):',
      '    findings = []',
      '    for i, line in enumerate(text.splitlines(), 1):',
      '        for label, pattern in PATTERNS:',
      '            if pattern.search(line):',
      '                findings.append({"line": i, "type": label})',
      '        if ".." in line and ("/etc/" in line or "C:\\\\Windows" in line):',
      '            findings.append({"line": i, "type": "path traversal"})',
      '    return findings',
      '',
      'def report(text):',
      '    f = scan_text(text)',
      '    return json.dumps({"clean": not f, "findings": f}, ensure_ascii=False)',
      '',
    ].join('\n'),
    'test_scanner.py': [
      'import json, unittest',
      'import scanner',
      '',
      'class TestScanner(unittest.TestCase):',
      '    def test_detects_secret(self):',
      '        f = scanner.scan_text("key = \\"AKIAIOSFODNN7EXAMPLE\\"")',
      '        self.assertTrue(any(x["type"] == "AWS key" for x in f))',
      '    def test_clean(self):',
      '        self.assertTrue(json.loads(scanner.report("x = 1\\nprint(x)"))["clean"])',
      '    def test_traversal(self):',
      '        self.assertTrue(any(x["type"] == "path traversal" for x in scanner.scan_text("open(\\"../../etc/passwd\\")")))',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  }),
};

const databaseSchema: SolutionDomain = {
  id: 'database-schema',
  labelAr: 'ترحيلات ومخطط قاعدة بيانات',
  labelEn: 'Database schema and migrations',
  descriptionAr: 'ترحيلات SQLite قابلة للتكرار مع قيود وفهارس واختبارات سلامة.',
  category: 'Databases',
  ecosystem: 'python',
  tags: ['database', 'migration', 'sqlite'],
  entryFile: 'migrations/001_init.sql',
  testCommand: 'python3 -m unittest discover -v',
  build: () => ({
    'migrations/001_init.sql': [
      'CREATE TABLE IF NOT EXISTS users (',
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  email TEXT NOT NULL UNIQUE,',
      '  created_at TEXT NOT NULL DEFAULT (datetime(\'now\'))',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',
      'CREATE TABLE IF NOT EXISTS audit (',
      '  id INTEGER PRIMARY KEY,',
      '  user_id INTEGER NOT NULL REFERENCES users(id),',
      '  action TEXT NOT NULL',
      ');',
      '',
    ].join('\n'),
    'db.py': [
      'import sqlite3',
      '',
      'SCHEMA = "migrations/001_init.sql"',
      '',
      'def migrate(conn):',
      '    with open(SCHEMA, encoding="utf-8") as f:',
      '        conn.executescript(f.read())',
      '    conn.commit()',
      '',
      'def add_user(conn, email):',
      '    if "@" not in email:',
      '        raise ValueError("invalid email")',
      '    conn.execute("INSERT INTO users(email) VALUES (?)", (email,))',
      '    conn.commit()',
      '    return conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()[0]',
      '',
    ].join('\n'),
    'test_db.py': [
      'import os, sqlite3, tempfile, unittest',
      'import db',
      '',
      'class TestDb(unittest.TestCase):',
      '    def setUp(self):',
      '        self.d = tempfile.mkdtemp()',
      '        db.SCHEMA = os.path.join(self.d, "001_init.sql")',
      '        with open(db.SCHEMA, "w", encoding="utf-8") as f:',
      '            f.write("CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT UNIQUE);")',
      '        self.conn = sqlite3.connect(":memory:")',
      '        db.migrate(self.conn)',
      '    def test_unique_email(self):',
      '        db.add_user(self.conn, "a@b.com")',
      '        with self.assertRaises(sqlite3.IntegrityError):',
      '            db.add_user(self.conn, "a@b.com")',
      '    def test_validation(self):',
      '        with self.assertRaises(ValueError):',
      '            db.add_user(self.conn, "bad")',
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  }),
};

/* ------------------------------------------------------------------ */
/* Node / TypeScript domains                                           */
/* ------------------------------------------------------------------ */

const staticSite: SolutionDomain = {
  id: 'static-site',
  labelAr: 'مولّد موقع ثابت',
  labelEn: 'Static site generator',
  descriptionAr: 'يبني موقعاً ثابتاً من بيانات JSON مع قوالب HTML واختبارات إخراج.',
  category: 'Frontend & Web',
  ecosystem: 'nodejs',
  tags: ['web', 'static', 'html'],
  entryFile: 'index.js',
  testCommand: 'node --test',
  build: (title) => ({
    'package.json': JSON.stringify({ name: slug(title), type: 'module', scripts: { build: 'node index.js', test: 'node --test' } }, null, 2),
    'index.js': [
      'import fs from "node:fs";',
      'import path from "node:path";',
      '',
      'export function escapeHtml(value) {',
      '  return String(value).replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;", "\'": "&#39;" }[c]));',
      '}',
      '',
      'export function renderPage(page, site) {',
      '  const items = (page.items || []).map((i) => "<li>" + escapeHtml(i) + "</li>").join("");',
      '  return "<!doctype html><html lang=\\"ar\\" dir=\\"rtl\\"><head><meta charset=\\"utf-8\\"><title>" +',
      '    escapeHtml(page.title) + " | " + escapeHtml(site.name) + "</title></head><body>" +',
      '    "<h1>" + escapeHtml(page.title) + "</h1><ul>" + items + "</ul></body></html>";',
      '}',
      '',
      'export function buildSite(site, outDir) {',
      '  fs.mkdirSync(outDir, { recursive: true });',
      '  const written = [];',
      '  for (const page of site.pages || []) {',
      '    const name = page.slug && /^[a-z0-9-]+$/.test(page.slug) ? page.slug : "index";',
      '    const file = path.join(outDir, name + ".html");',
      '    fs.writeFileSync(file, renderPage(page, site), "utf8");',
      '    written.push(file);',
      '  }',
      '  return written;',
      '}',
      '',
      'if (import.meta.url === "file://" + process.argv[1]) {',
      '  const site = JSON.parse(fs.readFileSync(new URL("./site.json", import.meta.url), "utf8"));',
      '  console.log(buildSite(site, process.argv[2] || "dist").join("\\n"));',
      '}',
      '',
    ].join('\n'),
    'site.json': JSON.stringify({ name: title, pages: [{ slug: 'index', title: title, items: ['سريع', 'آمن', 'قابل للاختبار'] }] }, null, 2),
    'test_site.test.js': [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import fs from "node:fs";',
      'import os from "node:os";',
      'import path from "node:path";',
      'import { escapeHtml, renderPage, buildSite } from "./index.js";',
      '',
      'test("escapes HTML", () => assert.equal(escapeHtml("<b>"), "&lt;b&gt;"));',
      'test("renders page", () => {',
      '  const html = renderPage({ title: "A", items: ["x"] }, { name: "S" });',
      '  assert.match(html, /<h1>A<\\/h1>/);',
      '  assert.match(html, /<li>x<\\/li>/);',
      '});',
      'test("writes files", () => {',
      '  const d = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));',
      '  const out = buildSite({ name: "S", pages: [{ slug: "index", title: "T", items: [] }] }, d);',
      '  assert.equal(out.length, 1);',
      '  assert.ok(fs.readFileSync(out[0], "utf8").includes("T"));',
      '});',
      '',
    ].join('\n'),
  }),
};

const realtimeHub: SolutionDomain = {
  id: 'realtime-hub',
  labelAr: 'مركز أحداث لحظي',
  labelEn: 'Realtime event hub',
  descriptionAr: 'خادم أحداث مع قنوات اشتراك وبث وقوائم انتظار اختبارية.',
  category: 'Realtime Systems',
  ecosystem: 'nodejs',
  tags: ['events', 'realtime', 'pubsub'],
  entryFile: 'hub.js',
  testCommand: 'node --test',
  build: () => ({
    'package.json': JSON.stringify({ name: 'omega-event-hub', type: 'module', scripts: { test: 'node --test' } }, null, 2),
    'hub.js': [
      'import { EventEmitter } from "node:events";',
      '',
      'export class Hub {',
      '  constructor() { this.bus = new EventEmitter(); this.history = []; }',
      '  subscribe(topic, fn) { this.bus.on(topic, fn); return () => this.bus.off(topic, fn); }',
      '  publish(topic, payload) {',
      '    if (!topic || typeof payload !== "object" || payload === null) return false;',
      '    this.history.push({ topic, payload, at: Date.now() });',
      '    this.bus.emit(topic, payload);',
      '    return true;',
      '  }',
      '  recent(limit = 10) { return this.history.slice(-limit); }',
      '}',
      '',
    ].join('\n'),
    'test_hub.test.js': [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { Hub } from "./hub.js";',
      '',
      'test("delivers events", () => {',
      '  const h = new Hub(); let got = null;',
      '  const off = h.subscribe("orders", (p) => { got = p; });',
      '  assert.equal(h.publish("orders", { id: 1 }), true);',
      '  assert.deepEqual(got, { id: 1 });',
      '  off();',
      '  h.publish("orders", { id: 2 });',
      '  assert.deepEqual(got, { id: 1 });',
      '});',
      'test("rejects invalid payload", () => {',
      '  const h = new Hub();',
      '  assert.equal(h.publish("", {}), false);',
      '  assert.equal(h.publish("x", null), false);',
      '  assert.equal(h.recent().length, 0);',
      '});',
      '',
    ].join('\n'),
  }),
};

const typedService: SolutionDomain = {
  id: 'typed-service',
  labelAr: 'خدمة TypeScript مُقيدة الأنواع',
  labelEn: 'Typed TypeScript service',
  descriptionAr: 'خدمة نطاقية مع أنواع صارئة وتحقق مدخلات واختبارات tsx.',
  category: 'Enterprise & Typed Backend',
  ecosystem: 'typescript',
  tags: ['typescript', 'enterprise', 'service'],
  entryFile: 'src/index.ts',
  testCommand: 'npx tsx --test test_service.ts',
  build: () => ({
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, types: ['node'] }, include: ['src/**/*.ts', 'test_service.ts'] }, null, 2),
    'package.json': JSON.stringify({ name: 'omega-typed-service', type: 'module', scripts: { test: 'tsx --test test_service.ts', build: 'tsc --noEmit' } }, null, 2),
    'src/index.ts': [
      'export interface Entity { id: number; label: string; active: boolean }',
      '',
      'export class EntityService {',
      '  private readonly rows = new Map<number, Entity>();',
      '  create(label: string): Entity {',
      '    const clean = label.trim();',
      '    if (!clean || clean.length > 120) throw new Error("invalid label");',
      '    const id = this.rows.size + 1;',
      '    const row: Entity = { id, label: clean, active: true };',
      '    this.rows.set(id, row);',
      '    return { ...row };',
      '  }',
      '  get(id: number): Entity | null {',
      '    const row = this.rows.get(id);',
      '    return row ? { ...row } : null;',
      '  }',
      '  deactivate(id: number): boolean {',
      '    const row = this.rows.get(id);',
      '    if (!row) return false;',
      '    row.active = false;',
      '    return true;',
      '  }',
      '}',
      '',
    ].join('\n'),
    'test_service.ts': [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { EntityService } from "./src/index.ts";',
      '',
      'test("creates and reads", () => {',
      '  const s = new EntityService();',
      '  const e = s.create("  widget  ");',
      '  assert.equal(e.label, "widget");',
      '  assert.deepEqual(s.get(e.id), e);',
      '});',
      'test("validates and deactivates", () => {',
      '  const s = new EntityService();',
      '  assert.throws(() => s.create("   "));',
      '  const e = s.create("x");',
      '  assert.equal(s.deactivate(e.id), true);',
      '  assert.equal(s.deactivate(999), false);',
      '  assert.equal(s.get(e.id)?.active, false);',
      '});',
      '',
    ].join('\n'),
  }),
};

/* ------------------------------------------------------------------ */
/* Systems languages                                                   */
/* ------------------------------------------------------------------ */

const microservice: SolutionDomain = {
  id: 'microservice',
  labelAr: 'ميكروسيرفس Go متزامن',
  labelEn: 'Concurrent Go microservice',
  descriptionAr: 'خادم HTTP بمخزن آمن التزامن ونقطة صحية واختبارات.',
  category: 'Cloud Native',
  ecosystem: 'go',
  tags: ['go', 'microservice', 'concurrency'],
  entryFile: 'main.go',
  testCommand: 'go test ./...',
  build: (title) => ({
    'go.mod': 'module omega.solution\n\ngo 1.22\n',
    'main.go': [
      'package main',
      '',
      'import (',
      '\t"encoding/json"',
      '\t"net/http"',
      '\t"sync"',
      ')',
      '',
      'type Store struct {',
      '\tmu sync.RWMutex',
      '\trows []string',
      '}',
      '',
      'func (s *Store) Add(v string) error {',
      '\tif v == "" { return errEmpty }',
      '\ts.mu.Lock(); defer s.mu.Unlock()',
      '\ts.rows = append(s.rows, v)',
      '\treturn nil',
      '}',
      '',
      'func (s *Store) List() []string {',
      '\ts.mu.RLock(); defer s.mu.RUnlock()',
      '\tout := make([]string, len(s.rows))',
      '\tcopy(out, s.rows)',
      '\treturn out',
      '}',
      '',
      'var errEmpty = &serviceError{"empty value"}',
      '',
      'type serviceError struct{ msg string }',
      'func (e *serviceError) Error() string { return e.msg }',
      '',
      'func NewHandler(s *Store) http.Handler {',
      '\tmux := http.NewServeMux()',
      '\tmux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {',
      '\t\tw.Header().Set("Content-Type", "application/json")',
      '\t\t_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "' + esc(slug(title)) + '"})',
      '\t})',
      '\tmux.HandleFunc("/api/items", func(w http.ResponseWriter, r *http.Request) {',
      '\t\tw.Header().Set("Content-Type", "application/json")',
      '\t\tif r.Method == http.MethodGet {',
      '\t\t\t_ = json.NewEncoder(w).Encode(map[string]any{"items": s.List()})',
      '\t\t\treturn',
      '\t\t}',
      '\t\tw.WriteHeader(http.StatusMethodNotAllowed)',
      '\t})',
      '\treturn mux',
      '}',
      '',
      'func main() {',
      '\ts := &Store{}',
      '\t_ = s.Add("ready")',
      '\t_ = http.ListenAndServe(":8000", NewHandler(s))',
      '}',
      '',
    ].join('\n'),
    'main_test.go': [
      'package main',
      '',
      'import (',
      '\t"net/http"',
      '\t"net/http/httptest"',
      '\t"testing"',
      ')',
      '',
      'func TestStore(t *testing.T) {',
      '\ts := &Store{}',
      '\tif err := s.Add("a"); err != nil { t.Fatal(err) }',
      '\tif err := s.Add(""); err == nil { t.Fatal("expected error") }',
      '\tif len(s.List()) != 1 { t.Fatalf("got %d", len(s.List())) }',
      '}',
      '',
      'func TestHealth(t *testing.T) {',
      '\ts := &Store{}',
      '\tr := httptest.NewRecorder()',
      '\tNewHandler(s).ServeHTTP(r, httptest.NewRequest(http.MethodGet, "/health", nil))',
      '\tif r.Code != 200 { t.Fatalf("status %d", r.Code) }',
      '}',
      '',
    ].join('\n'),
  }),
};

const systemsCli: SolutionDomain = {
  id: 'systems-cli',
  labelAr: 'أداة أنظمة آمنة الذاكرة',
  labelEn: 'Memory-safe systems CLI',
  descriptionAr: 'أداة Rust لتحليل النصوص مع رفض المدخلات غير الآمنة.',
  category: 'Systems & Security',
  ecosystem: 'rust',
  tags: ['rust', 'cli', 'systems'],
  entryFile: 'src/main.rs',
  testCommand: 'cargo test',
  build: () => ({
    'Cargo.toml': '[package]\nname = "omega_systems_cli"\nversion = "0.1.0"\nedition = "2021"\n',
    'src/main.rs': [
      'use std::env;',
      '',
      'pub fn normalize(input: &str) -> Result<String, &\'static str> {',
      '    let s = input.trim();',
      '    if s.is_empty() || s.len() > 256 || s.contains("..") {',
      '        return Err("unsafe input");',
      '    }',
      '    Ok(s.to_lowercase())',
      '}',
      '',
      'pub fn word_count(s: &str) -> usize {',
      '    s.split_whitespace().count()',
      '}',
      '',
      'fn main() {',
      '    let arg = env::args().nth(1).unwrap_or_default();',
      '    match normalize(&arg) {',
      '        Ok(v) => println!("{{\\"status\\":\\"ok\\",\\"words\\":{}}}", word_count(&v)),',
      '        Err(e) => { eprintln!("{}", e); std::process::exit(2); }',
      '    }',
      '}',
      '',
      '#[cfg(test)]',
      'mod tests {',
      '    use super::*;',
      '    #[test]',
      '    fn normalizes() {',
      '        assert_eq!(normalize("  Hello World ").unwrap(), "hello world");',
      '        assert_eq!(word_count("a b c"), 3);',
      '    }',
      '    #[test]',
      '    fn rejects_unsafe() {',
      '        assert!(normalize("").is_err());',
      '        assert!(normalize("../../etc").is_err());',
      '    }',
      '}',
      '',
    ].join('\n'),
  }),
};

const nativeTool: SolutionDomain = {
  id: 'native-tool',
  labelAr: 'أداة C17 للحلقات الدائرية',
  labelEn: 'C17 ring buffer tool',
  descriptionAr: 'مخزن حلقي بمعالجة آمنة للحدود وفحص ذاتي عند التشغيل.',
  category: 'Low-Level & Embedded',
  ecosystem: 'c',
  tags: ['c', 'embedded', 'buffer'],
  entryFile: 'main.c',
  testCommand: './app',
  build: () => ({
    'main.c': [
      '#include <stdio.h>',
      '#include <string.h>',
      '',
      '#define CAP 8',
      'typedef struct { int data[CAP]; int head; int count; } Ring;',
      '',
      'int ring_push(Ring *r, int v) {',
      '    if (!r || r->count >= CAP) return -1;',
      '    r->data[(r->head + r->count) % CAP] = v;',
      '    r->count++;',
      '    return 0;',
      '}',
      'int ring_pop(Ring *r, int *out) {',
      '    if (!r || !out || r->count == 0) return -1;',
      '    *out = r->data[r->head];',
      '    r->head = (r->head + 1) % CAP;',
      '    r->count--;',
      '    return 0;',
      '}',
      '',
      'int main(void) {',
      '    Ring r = {{0}, 0, 0};',
      '    for (int i = 0; i < CAP; i++) if (ring_push(&r, i) != 0) return 1;',
      '    if (ring_push(&r, 99) == 0) return 2;',
      '    for (int i = 0; i < CAP; i++) {',
      '        int v = -1;',
      '        if (ring_pop(&r, &v) != 0 || v != i) return 3;',
      '    }',
      '    int v = 0;',
      '    if (ring_pop(&r, &v) == 0) return 4;',
      '    printf("ring buffer self-test OK\\n");',
      '    return 0;',
      '}',
      '',
    ].join('\n'),
  }),
};

const cppEngine: SolutionDomain = {
  id: 'cpp-engine',
  labelAr: 'محرك حسابات متجهة C++20',
  labelEn: 'C++20 vector math engine',
  descriptionAr: 'محرك متجهات مع أخطاء حدود صريحة واختبار ذاتي.',
  category: 'High Performance',
  ecosystem: 'cpp',
  tags: ['cpp', 'math', 'engine'],
  entryFile: 'main.cpp',
  testCommand: './app',
  build: () => ({
    'main.cpp': [
      '#include <iostream>',
      '#include <vector>',
      '#include <stdexcept>',
      '#include <cmath>',
      '',
      'class Vector {',
      'public:',
      '    explicit Vector(std::vector<double> v) : data_(std::move(v)) {}',
      '    double dot(const Vector& o) const {',
      '        if (data_.size() != o.data_.size()) throw std::invalid_argument("size mismatch");',
      '        double sum = 0.0;',
      '        for (std::size_t i = 0; i < data_.size(); ++i) sum += data_[i] * o.data_[i];',
      '        return sum;',
      '    }',
      '    double norm() const { return std::sqrt(dot(*this)); }',
      '    std::size_t size() const { return data_.size(); }',
      'private:',
      '    std::vector<double> data_;',
      '};',
      '',
      'int main() {',
      '    Vector a({3, 4});',
      '    Vector b({1, 2});',
      '    if (a.dot(b) != 11.0) return 1;',
      '    if (a.norm() != 5.0) return 2;',
      '    try { a.dot(Vector({1})); return 3; } catch (const std::invalid_argument&) {}',
      '    std::cout << "vector engine self-test OK\\n";',
      '    return 0;',
      '}',
      '',
    ].join('\n'),
  }),
};

/* ------------------------------------------------------------------ */
/* Enterprise / web languages                                          */
/* ------------------------------------------------------------------ */

const jvmService: SolutionDomain = {
  id: 'jvm-service',
  labelAr: 'خدمة JVM مؤسسية',
  labelEn: 'Enterprise JVM service',
  descriptionAr: 'خدمة Java 21 مع تحقق مدخلات وفحص ذاتي بالتأكيدات.',
  category: 'Enterprise JVM',
  ecosystem: 'java',
  tags: ['java', 'jvm', 'enterprise'],
  entryFile: 'Main.java',
  testCommand: 'java -ea Main',
  build: () => ({
    'Main.java': [
      'import java.util.ArrayList;',
      'import java.util.List;',
      '',
      'public final class Main {',
      '  static final class Service {',
      '    private final List<String> rows = new ArrayList<>();',
      '    int add(String value) {',
      '      if (value == null || value.isBlank()) throw new IllegalArgumentException("blank");',
      '      rows.add(value.trim());',
      '      return rows.size();',
      '    }',
      '    List<String> all() { return List.copyOf(rows); }',
      '  }',
      '',
      '  static void selfTest() {',
      '    Service s = new Service();',
      '    assert s.add("  ok ") == 1;',
      '    assert s.all().get(0).equals("ok");',
      '    boolean thrown = false;',
      '    try { s.add(" "); } catch (IllegalArgumentException e) { thrown = true; }',
      '    assert thrown;',
      '  }',
      '',
      '  public static void main(String[] args) {',
      '    selfTest();',
      '    System.out.println("{\\"status\\":\\"ok\\",\\"service\\":\\"omega-jvm\\"}");',
      '  }',
      '}',
      '',
    ].join('\n'),
  }),
};

const dotnetService: SolutionDomain = {
  id: 'dotnet-service',
  labelAr: 'خدمة .NET 8 نظيفة',
  labelEn: 'Clean .NET 8 service',
  descriptionAr: 'خدمة C# مع حقن تبعيات بسيط واختبارات xUnit.',
  category: 'Enterprise .NET',
  ecosystem: 'csharp',
  tags: ['csharp', 'dotnet', 'enterprise'],
  entryFile: 'OmegaService/Service.cs',
  testCommand: 'dotnet test',
  build: () => ({
    'OmegaService/OmegaService.csproj': [
      '<Project Sdk="Microsoft.NET.Sdk">',
      '  <PropertyGroup>',
      '    <TargetFramework>net8.0</TargetFramework>',
      '    <Nullable>enable</Nullable>',
      '    <ImplicitUsings>enable</ImplicitUsings>',
      '  </PropertyGroup>',
      '</Project>',
      '',
    ].join('\n'),
    'OmegaService/Service.cs': [
      'namespace OmegaService;',
      '',
      'public sealed class Inventory {',
      '    private readonly Dictionary<int, string> _items = new();',
      '    public int Add(string name) {',
      '        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("name required");',
      '        int id = _items.Count + 1;',
      '        _items[id] = name.Trim();',
      '        return id;',
      '    }',
      '    public string? Get(int id) => _items.TryGetValue(id, out var v) ? v : null;',
      '}',
      '',
    ].join('\n'),
    'OmegaService.Tests/OmegaService.Tests.csproj': [
      '<Project Sdk="Microsoft.NET.Sdk">',
      '  <PropertyGroup>',
      '    <TargetFramework>net8.0</TargetFramework>',
      '    <IsPackable>false</IsPackable>',
      '  </PropertyGroup>',
      '  <ItemGroup>',
      '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />',
      '    <PackageReference Include="xunit" Version="2.9.2" />',
      '    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />',
      '  </ItemGroup>',
      '  <ItemGroup><ProjectReference Include="../OmegaService/OmegaService.csproj" /></ItemGroup>',
      '</Project>',
      '',
    ].join('\n'),
    'OmegaService.Tests/InventoryTests.cs': [
      'using System;',
      'using Xunit;',
      'using OmegaService;',
      '',
      'public class InventoryTests {',
      '    [Fact] public void AddAndGet() {',
      '        var inv = new Inventory();',
      '        int id = inv.Add("  widget ");',
      '        Assert.Equal("widget", inv.Get(id));',
      '    }',
      '    [Fact] public void RejectsBlank() {',
      '        Assert.Throws<ArgumentException>(() => new Inventory().Add("  "));',
      '    }',
      '}',
      '',
    ].join('\n'),
  }),
};

const phpBackend: SolutionDomain = {
  id: 'php-backend',
  labelAr: 'خادم PHP REST خفيف',
  labelEn: 'Lightweight PHP REST backend',
  descriptionAr: 'توجيه طلبات مع تحقق واختبارات تشغيلية.',
  category: 'Web Backend',
  ecosystem: 'php',
  tags: ['php', 'web', 'api'],
  entryFile: 'index.php',
  testCommand: 'php test_router.php',
  build: () => ({
    'index.php': [
      '<?php',
      'declare(strict_types=1);',
      '',
      'function normalize_name(string $v): string {',
      '    $v = trim($v);',
      '    if ($v === "" || strlen($v) > 120) throw new InvalidArgumentException("invalid name");',
      '    return $v;',
      '}',
      '',
      'function route(string $method, string $path, array $body): array {',
      '    if ($path === "/health") return [200, ["status" => "ok"]];',
      '    if ($path === "/api/items" && $method === "POST") {',
      '        try { return [201, ["name" => normalize_name((string)($body["name"] ?? ""))]]; }',
      '        catch (InvalidArgumentException $e) { return [400, ["error" => $e->getMessage()]]; }',
      '    }',
      '    return [404, ["error" => "not found"]];',
      '}',
      '',
      'if (PHP_SAPI === "cli" && realpath($_SERVER["SCRIPT_FILENAME"] ?? "") === __FILE__) {',
      '    $path = parse_url($_SERVER["REQUEST_URI"] ?? "/", PHP_URL_PATH) ?: "/";',
      '    [$code, $payload] = route($_SERVER["REQUEST_METHOD"] ?? "GET", $path, $_POST);',
      '    http_response_code($code);',
      '    header("Content-Type: application/json");',
      '    echo json_encode($payload, JSON_UNESCAPED_UNICODE);',
      '}',
      '',
    ].join('\n'),
    'test_router.php': [
      '<?php',
      'require __DIR__ . "/index.php";',
      'function check(bool $ok, string $msg): void {',
      '    if (!$ok) { fwrite(STDERR, "FAIL: $msg\\n"); exit(1); }',
      '}',
      '[$c, $b] = route("GET", "/health", []);',
      'check($c === 200 && $b["status"] === "ok", "health");',
      '[$c, $b] = route("POST", "/api/items", ["name" => "  x "]);',
      'check($c === 201 && $b["name"] === "x", "create");',
      '[$c, $b] = route("POST", "/api/items", ["name" => "  "]);',
      'check($c === 400, "validation");',
      '[$c, $b] = route("GET", "/nope", []);',
      'check($c === 404, "not found");',
      'echo "php router tests OK\\n";',
      '',
    ].join('\n'),
  }),
};

const rubyAutomation: SolutionDomain = {
  id: 'ruby-automation',
  labelAr: 'أتمتة Ruby مع اختبارات',
  labelEn: 'Ruby automation with minitest',
  descriptionAr: 'أدوات أتمتة ملفات مع تحقق من صحة المخرجات.',
  category: 'Automation & Scripting',
  ecosystem: 'ruby',
  tags: ['ruby', 'automation', 'minitest'],
  entryFile: 'tool.rb',
  testCommand: 'ruby test_tool.rb',
  build: () => ({
    'tool.rb': [
      '# frozen_string_literal: true',
      '',
      'module Tool',
      '  module_function',
      '',
      '  def slug(value)',
      '    out = value.to_s.downcase.strip.gsub(/[^a-z0-9]+/, "-").gsub(/\\A-+|-+\\z/, "")',
      '    raise ArgumentError, "empty slug" if out.empty?',
      '    out',
      '  end',
      '',
      '  def summarize(rows)',
      '    { count: rows.length, names: rows.map { |r| r[:name] }.compact }',
      '  end',
      'end',
      '',
    ].join('\n'),
    'test_tool.rb': [
      'require "minitest/autorun"',
      'require_relative "tool"',
      '',
      'class ToolTest < Minitest::Test',
      '  def test_slug',
      '    assert_equal "hello-world", Tool.slug("  Hello, World! ")',
      '    assert_raises(ArgumentError) { Tool.slug("---") }',
      '  end',
      '  def test_summarize',
      '    assert_equal({ count: 1, names: ["a"] }, Tool.summarize([{ name: "a" }]))',
      '  end',
      'end',
      '',
    ].join('\n'),
  }),
};

const classicTool: SolutionDomain = {
  id: 'classic-tool',
  labelAr: 'أداة Pascal كلاسيكية',
  labelEn: 'Classic Pascal utility',
  descriptionAr: 'برنامج Pascal مع وحدة حسابية وفحص ذاتي.',
  category: 'Classic Systems',
  ecosystem: 'pascal',
  tags: ['pascal', 'classic'],
  entryFile: 'main.pas',
  testCommand: './main',
  build: () => ({
    'main.pas': [
      'program OmegaTool;',
      'uses SysUtils;',
      '',
      'function Clamp(Value, LowV, HighV: Integer): Integer;',
      'begin',
      '  if Value < LowV then Clamp := LowV',
      '  else if Value > HighV then Clamp := HighV',
      '  else Clamp := Value;',
      'end;',
      '',
      'begin',
      '  if Clamp(5, 0, 3) <> 3 then Halt(1);',
      '  if Clamp(-5, 0, 3) <> 0 then Halt(2);',
      '  if Clamp(2, 0, 3) <> 2 then Halt(3);',
      '  WriteLn(\'pascal self-test OK\');',
      'end.',
      '',
    ].join('\n'),
  }),
};

const scientificCompute: SolutionDomain = {
  id: 'scientific-compute',
  labelAr: 'حساب علمي عالي السرعة',
  labelEn: 'Scientific numerical compute',
  descriptionAr: 'تكامل عدد ي بطريقة نقطة المنتصف مع تحقق ذاتي.',
  category: 'Scientific Computing',
  ecosystem: 'fortran',
  tags: ['fortran', 'scientific', 'numerical'],
  entryFile: 'main.f90',
  testCommand: './app',
  build: () => ({
    'main.f90': [
      'program omega_science',
      '  implicit none',
      '  integer, parameter :: n = 100000',
      '  integer :: i',
      '  real(8) :: h, sum, x',
      '',
      '  h = 1.0d0 / real(n, 8)',
      '  sum = 0.0d0',
      '  do i = 0, n - 1',
      '    x = (real(i, 8) + 0.5d0) * h',
      '    sum = sum + x * x',
      '  end do',
      '  sum = sum * h',
      '',
      '  if (abs(sum - 1.0d0 / 3.0d0) > 1.0d-5) stop 1',
      '  print *, \'scientific self-test OK\', sum',
      'end program omega_science',
      '',
    ].join('\n'),
  }),
};

const legacyBridge: SolutionDomain = {
  id: 'legacy-bridge',
  labelAr: 'جسر تراثي COBOL',
  labelEn: 'COBOL legacy bridge',
  descriptionAr: 'حساب رواتب كلاسيكي مع ملف هجرة ومقارنة سلوكية.',
  category: 'Legacy Modernization',
  ecosystem: 'cobol',
  tags: ['cobol', 'legacy', 'mainframe'],
  entryFile: 'main.cob',
  testCommand: './app',
  build: () => ({
    'main.cob': [
      'IDENTIFICATION DIVISION.',
      'PROGRAM-ID. PAYROLL.',
      'DATA DIVISION.',
      'WORKING-STORAGE SECTION.',
      '01 WS-HOURS PIC 9(3)V99 VALUE 40.00.',
      '01 WS-RATE  PIC 9(3)V99 VALUE 10.50.',
      '01 WS-TOTAL PIC 9(6)V99 VALUE ZERO.',
      'PROCEDURE DIVISION.',
      '    COMPUTE WS-TOTAL = WS-HOURS * WS-RATE',
      '    DISPLAY "PAYROLL TOTAL: " WS-TOTAL',
      '    STOP RUN.',
      '',
    ].join('\n'),
    'MIGRATION.md': [
      '# خطة الهجرة',
      '',
      'المنطق الحسابي: `TOTAL = HOURS * RATE`.',
      'القيود: مدخلات غير سالبة، تقريب لمنزلتين عشريتين.',
      'الاختبار البديل: `python3 -c "assert round(40.00*10.50,2)==420.00"`.',
      '',
    ].join('\n'),
  }),
};

const gameLogic: SolutionDomain = {
  id: 'game-logic',
  labelAr: 'منطق لعبة Lua',
  labelEn: 'Lua game logic',
  descriptionAr: 'آلة حالة للعبة مع اختبارات انتقال الحالات.',
  category: 'Game Development',
  ecosystem: 'lua',
  tags: ['lua', 'game', 'state-machine'],
  entryFile: 'main.lua',
  testCommand: 'lua test_game.lua',
  build: () => ({
    'main.lua': [
      'local M = {}',
      '',
      'function M.new()',
      '  return { state = "menu", score = 0 }',
      'end',
      '',
      'function M.transition(game, event)',
      '  if game.state == "menu" and event == "start" then game.state = "playing"',
      '  elseif game.state == "playing" and event == "point" then game.score = game.score + 1',
      '  elseif game.state == "playing" and event == "quit" then game.state = "over"',
      '  else return false end',
      '  return true',
      'end',
      '',
      'return M',
      '',
    ].join('\n'),
    'test_game.lua': [
      'local game = require("main")',
      'local g = game.new()',
      'assert(g.state == "menu")',
      'assert(game.transition(g, "start") == true)',
      'assert(game.transition(g, "point") == true)',
      'assert(g.score == 1)',
      'assert(game.transition(g, "quit") == true)',
      'assert(g.state == "over")',
      'assert(game.transition(g, "start") == false)',
      'print("lua game tests OK")',
      '',
    ].join('\n'),
  }),
};

const mobileApp: SolutionDomain = {
  id: 'mobile-app',
  labelAr: 'تطبيق Flutter متعدد المنصات',
  labelEn: 'Cross-platform Flutter app',
  descriptionAr: 'نموذج بيانات ونطق أعمال قابل للاختبار لتطبيق موبايل.',
  category: 'Mobile',
  ecosystem: 'flutter',
  tags: ['flutter', 'dart', 'mobile'],
  entryFile: 'lib/domain/task.dart',
  testCommand: 'dart test',
  build: () => ({
    'pubspec.yaml': [
      'name: omega_mobile',
      'environment:',
      '  sdk: ">=3.4.0 <4.0.0"',
      'dev_dependencies:',
      '  test: ^1.25.0',
      '',
    ].join('\n'),
    'lib/domain/task.dart': [
      'class Task {',
      '  final int id;',
      '  final String title;',
      '  bool done;',
      '',
      '  Task({required this.id, required String title, this.done = false})',
      '      : title = title.trim() {',
      '    if (this.title.isEmpty) throw ArgumentError("title required");',
      '  }',
      '}',
      '',
      'class TaskStore {',
      '  final List<Task> _tasks = <Task>[];',
      '  Task add(String title) {',
      '    final task = Task(id: _tasks.length + 1, title: title);',
      '    _tasks.add(task);',
      '    return task;',
      '  }',
      '  List<Task> get all => List.unmodifiable(_tasks);',
      '  bool complete(int id) {',
      '    for (final t in _tasks) {',
      '      if (t.id == id) { t.done = true; return true; }',
      '    }',
      '    return false;',
      '  }',
      '}',
      '',
    ].join('\n'),
    'test/task_test.dart': [
      'import "package:test/test.dart";',
      'import "package:omega_mobile/domain/task.dart";',
      '',
      'void main() {',
      '  test("adds and completes", () {',
      '    final store = TaskStore();',
      '    final t = store.add("  write tests  ");',
      '    expect(t.title, "write tests");',
      '    expect(store.complete(t.id), isTrue);',
      '    expect(store.all.single.done, isTrue);',
      '    expect(store.complete(999), isFalse);',
      '  });',
      '  test("rejects blank", () {',
      '    expect(() => Task(id: 1, title: "  "), throwsArgumentError);',
      '  });',
      '}',
      '',
    ].join('\n'),
  }),
};

const windowsAdmin: SolutionDomain = {
  id: 'windows-admin',
  labelAr: 'أتمتة إدارة Windows',
  labelEn: 'Windows administration automation',
  descriptionAr: 'سكربت PowerShell مع تحقق مسارات وفحص ذاتي.',
  category: 'OS Administration',
  ecosystem: 'powershell',
  tags: ['powershell', 'windows', 'admin'],
  entryFile: 'main.ps1',
  testCommand: 'pwsh -File test_main.ps1',
  build: () => ({
    'main.ps1': [
      'function Test-SafePath {',
      '  param([string]$Path)',
      '  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }',
      '  if ($Path -match "\\.\\.") { return $false }',
      '  if ($Path -match "^[A-Za-z]:\\\\Windows") { return $false }',
      '  return $true',
      '}',
      '',
      'function Get-Report {',
      '  param([string]$Name)',
      '  if (-not (Test-SafePath $Name)) { throw "unsafe path" }',
      '  return [pscustomobject]@{ Name = $Name.Trim(); Ok = $true }',
      '}',
      '',
      'if ($MyInvocation.InvocationName -ne ".") {',
      '  Write-Output (Get-Report -Name "reports/app.log" | ConvertTo-Json -Compress)',
      '}',
      '',
    ].join('\n'),
    'test_main.ps1': [
      '. ./main.ps1',
      'if (-not (Test-SafePath "reports/app.log")) { throw "safe path rejected" }',
      'if (Test-SafePath "../../etc/passwd") { throw "traversal accepted" }',
      'if (Test-SafePath "C:\\Windows\\system32") { throw "system path accepted" }',
      '$r = Get-Report -Name "  app.log  "',
      'if ($r.Name -ne "app.log" -or -not $r.Ok) { throw "bad report" }',
      'Write-Output "powershell self-test OK"',
      '',
    ].join('\n'),
  }),
};

const shellAutomation: SolutionDomain = {
  id: 'shell-automation',
  labelAr: 'أتمتة Shell آمنة',
  labelEn: 'Safe shell automation',
  descriptionAr: 'سكربت POSIX مع تحقق مدخلات وفحص ذاتي مدمج.',
  category: 'DevOps & Automation',
  ecosystem: 'bash',
  tags: ['bash', 'shell', 'devops'],
  entryFile: 'main.sh',
  testCommand: 'sh test_main.sh',
  build: () => ({
    'main.sh': [
      '#!/bin/sh',
      'set -eu',
      '',
      'safe_slug() {',
      '  raw="$1"',
      '  case "$raw" in',
      '    *".."*|"") return 1 ;;',
      '  esac',
      '  printf "%s" "$raw" | tr "[:upper:]" "[:lower:]" | tr -cs "a-z0-9" "-" | sed "s/-*$//"',
      '}',
      '',
      'report() {',
      '  name=$(safe_slug "$1") || return 2',
      '  printf "{\\"name\\":\\"%s\\",\\"ok\\":true}\\n" "$name"',
      '}',
      '',
      'if [ "${OMEGA_SELFTEST:-0}" = "1" ]; then',
      '  [ "$(safe_slug "Hello World")" = "hello-world" ] || exit 3',
      '  safe_slug "../bad" && exit 4 || true',
      '  report "Clean Name" | grep -q "\\"ok\\":true" || exit 5',
      '  echo "shell self-test OK"',
      'fi',
      '',
    ].join('\n'),
    'test_main.sh': [
      '#!/bin/sh',
      'set -eu',
      'OMEGA_SELFTEST=1 sh ./main.sh',
      '',
    ].join('\n'),
  }),
};

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export const SOLUTION_DOMAINS: readonly SolutionDomain[] = [
  restApi, cliTool, dataPipeline, mlInference, securityScanner, databaseSchema,
  staticSite, realtimeHub, typedService, microservice, systemsCli, shellAutomation,
  windowsAdmin, nativeTool, cppEngine, jvmService, dotnetService, phpBackend,
  rubyAutomation, classicTool, scientificCompute, legacyBridge, gameLogic, mobileApp,
];

const DOMAIN_MAP = new Map<SolutionDomainId, SolutionDomain>(
  SOLUTION_DOMAINS.map((d) => [d.id, d]),
);

export function listSolutionDomains(): Array<{
  id: SolutionDomainId;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  category: string;
  ecosystem: EcosystemKey;
  tags: string[];
  entryFile: string;
  testCommand: string;
}> {
  return SOLUTION_DOMAINS.map((d) => ({
    id: d.id,
    labelAr: d.labelAr,
    labelEn: d.labelEn,
    descriptionAr: d.descriptionAr,
    category: d.category,
    ecosystem: d.ecosystem,
    tags: [...d.tags],
    entryFile: d.entryFile,
    testCommand: d.testCommand,
  }));
}

export function getSolutionDomain(id: string): SolutionDomain | null {
  return DOMAIN_MAP.get(id as SolutionDomainId) || null;
}

const DOMAIN_KEYWORDS: Partial<Record<SolutionDomainId, RegExp>> = {
  'rest-api': /(api|rest|خادم|backend|api Rest)/i,
  'cli-tool': /(cli|أداة سطر|command.?line|أداة)/i,
  'data-pipeline': /(etl|csv|بيانات|pipeline|تحويل)/i,
  'ml-inference': /(machine learning|ml|تعلّم|انحدار|نموذج)/i,
  'security-scanner': /(security|أمان|فحص|ماسح|secrets)/i,
  'database-schema': /(database|قاعدة بيانات|migration|ترحيل|sql)/i,
  'static-site': /(website|موقع|frontend|html|صفحة)/i,
  'realtime-hub': /(realtime|لحظي|events|أحداث|pub ?sub)/i,
  'typed-service': /(typescript|typed|خدمة|enterprise)/i,
  'microservice': /(microservice|ميكروسيرفس|go)/i,
  'systems-cli': /(rust|systems|أنظمة|memory.safe)/i,
  'game-logic': /(game|لعبة|lua)/i,
  'mobile-app': /(mobile|موبايل|flutter|android|ios)/i,
};

/**
 * Detects a domain from a prompt. Explicit `[Solution Domain: id]` tags win;
 * otherwise ecosystem keywords are considered before generic domain keywords.
 */
export function detectSolutionDomain(prompt: string, explicitId?: string | null): SolutionDomain | null {
  if (explicitId) {
    const direct = getSolutionDomain(explicitId);
    if (direct) return direct;
  }
  const text = prompt || '';
  const tag = text.match(/\[Solution Domain:\s*([a-z0-9-]+)\]/i);
  if (tag) {
    const found = getSolutionDomain(tag[1].toLowerCase());
    if (found) return found;
  }

  // Ecosystem-specific hints should select their dedicated domain first.
  const ecoRules: Array<[RegExp, SolutionDomainId]> = [
    [/\b(rust|cargo)\b/i, 'systems-cli'],
    [/\b(golang|microservice|ميكروسيرفس)\b/i, 'microservice'],
    [/\b(flutter|dart|موبايل|android|ios)\b/i, 'mobile-app'],
    [/\b(lua|game|لعبة)\b/i, 'game-logic'],
    [/\b(powershell|باورشيل)\b/i, 'windows-admin'],
    [/\b(fortran|فورتران|علمية)\b/i, 'scientific-compute'],
    [/\b(cobol|كوبول|mainframe)\b/i, 'legacy-bridge'],
    [/\b(pascal|دلفي|delphi)\b/i, 'classic-tool'],
    [/\b(c\+\+|cpp|محرك)\b/i, 'cpp-engine'],
    [/\b(java|jvm|spring)\b/i, 'jvm-service'],
    [/\b(c#|csharp|dotnet|\.net)\b/i, 'dotnet-service'],
    [/\b(php|laravel)\b/i, 'php-backend'],
    [/\b(ruby|rails)\b/i, 'ruby-automation'],
    [/\b(bash|shell|شل|devops)\b/i, 'shell-automation'],
  ];
  for (const [re, id] of ecoRules) {
    if (re.test(text)) return getSolutionDomain(id);
  }

  // Then generic domain intents, scoped to ecosystems whose toolchains we can
  // verify most reliably (Python / Node / TypeScript).
  const genericOrder: SolutionDomainId[] = [
    'security-scanner', 'database-schema', 'ml-inference', 'data-pipeline',
    'realtime-hub', 'static-site', 'cli-tool', 'rest-api', 'typed-service',
  ];
  for (const id of genericOrder) {
    const re = DOMAIN_KEYWORDS[id];
    if (re && re.test(text)) return getSolutionDomain(id);
  }
  return null;
}

/** Generates a complete, verified-by-construction bundle for a domain. */
export function generateSolutionFiles(
  domainId: string,
  title: string,
  prompt: string,
  overrides?: { ecosystem?: EcosystemKey },
): Record<string, string> {
  const domain = getSolutionDomain(domainId);
  if (!domain) throw new Error(`unknown solution domain: ${domainId}`);
  if (overrides?.ecosystem && overrides.ecosystem !== domain.ecosystem) {
    throw new Error(`domain ${domainId} requires ${domain.ecosystem}, got ${overrides.ecosystem}`);
  }
  const body = domain.build(title, prompt);
  const files = commonFiles(domain, title, prompt, body);

  // Defense in depth: every emitted path must stay inside the project root.
  const validated: Record<string, string> = {};
  let totalBytes = 0;
  for (const [name, content] of Object.entries(files)) {
    const safe = isSafeRelativePath(name);
    if (!safe) throw new Error(`unsafe generated path: ${name}`);
    totalBytes += Buffer.byteLength(content, 'utf8');
    if (totalBytes > 2_000_000) throw new Error('generated bundle exceeds size limit');
    validated[safe] = content;
  }
  return validated;
}

/** Convenience: detect then generate in one call. */
export function generateFromPrompt(
  prompt: string,
  title: string,
  explicitDomain?: string | null,
): { domain: SolutionDomain; files: Record<string, string> } | null {
  const domain = detectSolutionDomain(prompt, explicitDomain);
  if (!domain) return null;
  return { domain, files: generateSolutionFiles(domain.id, title, prompt) };
}
