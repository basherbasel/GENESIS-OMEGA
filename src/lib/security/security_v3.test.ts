import test from 'node:test';
import assert from 'node:assert/strict';

import { scanTaintFlows, type TaintFinding } from './taint_scanner';
import {
  appendAuditEntry,
  verifyLedgerIntegrity,
  type AuditEntry,
  type AuditLedgerStore,
} from './audit_ledger';

function ledgerStore(): AuditLedgerStore & { rows: AuditEntry[] } {
  const box: { rows: AuditEntry[] } = { rows: [] };
  return {
    load: () => box.rows,
    save: (entries) => {
      box.rows = entries;
    },
    get rows() {
      return box.rows;
    },
  };
}

test('taint scanner detects real source-to-sink flows across eight languages with CWE ids', () => {
  const findings = scanTaintFlows({
    'src/api.ts': 'const payload = req.body;\nexec(payload);\n',
    'src/db.py': 'name = os.environ["NAME"]\nsubprocess.run("query " + name, shell=True)\n',
    'web/index.php': '$name = $_GET["name"];\necho $name;\n',
    'src/Main.java': 'String raw = request.getParameter("q");\nRuntime.getRuntime().exec(raw);\n',
    'app.rb': 'name = params["name"]\nsystem(name)\n',
    'main.go': 'name := os.Getenv("NAME")\nexec.Command(name)\n',
    'Program.cs': 'var name = Request.QueryString["name"];\nProcess.Start(name);\n',
    'native.c': 'char buf[64]; scanf("%s", buf);\nsystem(buf);\n',
  });
  const cwes = new Set(findings.map((item) => item.cweId));
  assert.ok(cwes.has('CWE-78'), 'command injection');
  assert.ok(cwes.has('CWE-79'), 'XSS');
  assert.ok(findings.some((item): item is TaintFinding => item.file === 'src/db.py' && item.cweId === 'CWE-78'));
  assert.ok(findings.some((item) => item.file === 'src/Main.java' && item.line === 2));
  assert.ok(findings.every((item) => item.remediation.length > 5));
});

test('sanitized and parameterized code passes the taint gate', () => {
  const findings = scanTaintFlows({
    'src/safe.ts': [
      'const raw = req.body.path;',
      'const safe = isSafeRelativePath(raw);',
      'if (safe) fs.readFileSync(safe, "utf8");',
      'const value = Number(req.body.n);',
      'db.query("SELECT * FROM items WHERE id = ?", [value]);',
    ].join('\n'),
    'src/safe.py': [
      'name = os.environ["NAME"]',
      'cursor.execute("SELECT * FROM users WHERE name = ?", (name,))',
    ].join('\n'),
  });
  assert.deepEqual(findings, []);
});

test('hash-chained ledger detects field edits, deletion and reordering', () => {
  const store = ledgerStore();
  const first = appendAuditEntry(store, { actor: 'tester', action: 'work_order.verified', target: 'wo-1', outcome: { score: 97 } });
  const second = appendAuditEntry(store, { actor: 'tester', action: 'taint_scan', target: '/repo', outcome: { findings: 0 } });
  const third = appendAuditEntry(store, { actor: 'tester', action: 'voice_action', target: 'ledger_verify', outcome: { valid: true } });

  assert.equal(first.prevHash, '0'.repeat(64));
  assert.equal(first.seq, 1);
  assert.equal(second.prevHash, first.hash);
  assert.equal(third.prevHash, second.hash);
  assert.equal(verifyLedgerIntegrity(store.rows).valid, true);

  const edited = store.rows.map((entry) =>
    entry.seq === 2 ? { ...entry, outcomeHash: 'f'.repeat(64) } : entry,
  );
  const tampered = verifyLedgerIntegrity(edited);
  assert.equal(tampered.valid, false);
  assert.equal(tampered.brokenHashAt, 2);

  const deleted = verifyLedgerIntegrity(store.rows.filter((entry) => entry.seq !== 2));
  assert.equal(deleted.valid, false);
  assert.equal(deleted.brokenSequenceAt, 3);

  const reordered = verifyLedgerIntegrity([store.rows[1], store.rows[0], store.rows[2]]);
  assert.equal(reordered.valid, false);
});
