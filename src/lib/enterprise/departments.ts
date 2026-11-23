/**
 * Ten engineering departments with strict, auditable contracts.
 *
 * Classification is deterministic: weighted keyword evidence from the title,
 * problem statement and target language. Nothing is inferred from a model.
 * Time O(input length × departments), space O(active departments).
 */

import type { BrainRole } from '../brains/brain_registry';

export type DepartmentId =
  | 'software-architecture'
  | 'web-fullstack'
  | 'embedded-iot'
  | 'physics-simulation'
  | 'algorithms-optimization'
  | 'ai-ml-signal'
  | 'data-engineering'
  | 'devops-local-mlops'
  | 'qa-os-verification'
  | 'cybersecurity-hardening';

export interface Department {
  id: DepartmentId;
  labelAr: string;
  labelEn: string;
  brainRole: BrainRole;
  rules: string[];
  verificationGates: string[];
  keywords: string[];
}

export const DEPARTMENTS: Record<DepartmentId, Department> = {
  'software-architecture': {
    id: 'software-architecture',
    labelAr: 'هندسة البرمجيات والمعمارية',
    labelEn: 'Software Architecture',
    brainRole: 'architect',
    rules: [
      'SOLID principles and explicit module boundaries',
      'Deterministic state machines; no hidden global mutable state',
      'Public contracts documented before implementation',
    ],
    verificationGates: ['module boundary review', 'state transition test', 'cycle detection in dependencies'],
    keywords: ['architecture', 'معمارية', 'design', 'تصميم', 'modular', 'service', 'microservice', 'state machine', 'واجهة', 'contract'],
  },
  'web-fullstack': {
    id: 'web-fullstack',
    labelAr: 'الويب والواجهات الكاملة',
    labelEn: 'Web Full-Stack',
    brainRole: 'coder',
    rules: [
      'Typed API contracts with validated request/response schemas',
      'Real persistence (SQLite WAL) — no in-memory fake store',
      'Live transport via REST plus SSE where progress is long-running',
    ],
    verificationGates: ['HTTP status assertions', 'schema validation test', 'persistence round-trip'],
    keywords: ['web', 'ui', 'frontend', 'backend', 'api', 'rest', 'sse', 'html', 'react', 'واجهة', 'صفحة', 'خادم'],
  },
  'embedded-iot': {
    id: 'embedded-iot',
    labelAr: 'الأنظمة المدمجة وإنترنت الأشياء',
    labelEn: 'Embedded & IoT',
    brainRole: 'coder',
    rules: [
      'C/C++/Rust/MicroPython with explicit hardware register maps',
      'UART/SPI/I2C/CAN/Modbus framing documented per device',
      'CRC checksums on every wire packet; bounded buffers',
    ],
    verificationGates: ['cross-compile or host build', 'CRC vector test', 'register map review'],
    keywords: ['embedded', 'iot', 'firmware', 'mcu', 'uart', 'spi', 'i2c', 'can', 'modbus', 'crc', 'register', 'مدمج', 'متحكم', 'حساس'],
  },
  'physics-simulation': {
    id: 'physics-simulation',
    labelAr: 'الفيزياء والمحاكاة',
    labelEn: 'Physics & Simulation',
    brainRole: 'architect',
    rules: [
      'Exact ODE/PDE governing equations stated before discretization',
      'RK4 / Verlet / FDM solvers with named step size and SI units',
      'Conservation checks (energy, mass, momentum) reported numerically',
    ],
    verificationGates: ['unit-consistency test', 'convergence study', 'conservation residual below tolerance'],
    keywords: ['physics', 'simulation', 'ode', 'pde', 'rk4', 'verlet', 'finite difference', 'fdm', 'solver', 'fluid', 'pde', 'فيزياء', 'محاكاة', 'معادلة', 'حركة'],
  },
  'algorithms-optimization': {
    id: 'algorithms-optimization',
    labelAr: 'الخوارزميات والتحسين',
    labelEn: 'Algorithms & Optimization',
    brainRole: 'coder',
    rules: [
      'Graph / DP / LP / FFT / Kalman / PID selected with justification',
      'Documented O(·) time and O(·) space invariants at function entry',
      'Edge cases: empty input, duplicate keys, overflow bounds',
    ],
    verificationGates: ['complexity invariant review', 'worst-case input test', 'numerical stability test'],
    keywords: ['algorithm', 'graph', 'dynamic programming', ' dp', 'linear programming', 'fft', 'kalman', 'pid', 'optimization', 'solver', 'sort', 'خوارزمية', 'تحسين', 'رسم بياني'],
  },
  'ai-ml-signal': {
    id: 'ai-ml-signal',
    labelAr: 'الذكاء الاصطناعي وإشارة المعالجة',
    labelEn: 'AI/ML & Signal',
    brainRole: 'coder',
    rules: [
      'Deterministic seeds and recorded preprocessing parameters',
      'Real feature extraction — never synthetic training metrics',
      'F1 / RMSE computed on held-out data with reported sample count',
    ],
    verificationGates: ['seed reproducibility test', 'metric recomputation', 'leakage check'],
    keywords: ['machine learning', 'ml', 'ai', 'model', 'training', 'feature', 'f1', 'rmse', 'signal', 'dsp', 'filter', 'تعلم', 'نموذج', 'إشارة', 'ميزات'],
  },
  'data-engineering': {
    id: 'data-engineering',
    labelAr: 'هندسة البيانات',
    labelEn: 'Data Engineering',
    brainRole: 'architect',
    rules: [
      '3NF/BCNF schema with declared keys and constraints',
      'ACID transactions for multi-row writes',
      'Idempotent migrations with forward-only versioning',
    ],
    verificationGates: ['schema normalization review', 'transaction rollback test', 'migration idempotency test'],
    keywords: ['database', 'sql', 'schema', 'migration', 'etl', 'warehouse', 'query', 'index', 'قاعدة بيانات', 'ترحيل', 'مخطط', 'استعلام'],
  },
  'devops-local-mlops': {
    id: 'devops-local-mlops',
    labelAr: 'التشغيل والبناء المحلي',
    labelEn: 'DevOps & Local MLOps',
    brainRole: 'auditor',
    rules: [
      'Reproducible local builds with pinned lockfile',
      'Explicit CPU/RAM bounds and health probes',
      'No cloud dependency in the local pipeline',
    ],
    verificationGates: ['clean install test', 'resource bound check', 'health probe response'],
    keywords: ['devops', 'build', 'ci', 'pipeline', 'deploy', 'health', 'docker', 'container', 'monitor', 'بناء', 'نشر', 'مراقبة', 'صحة'],
  },
  'qa-os-verification': {
    id: 'qa-os-verification',
    labelAr: 'ضمان الجودة والتحقق التنفيذي',
    labelEn: 'QA & OS Verification',
    brainRole: 'auditor',
    rules: [
      'Real OS toolchain execution — never fabricated pass counts',
      'Numerical tolerances stated for floating-point assertions',
      'Adversarial edge cases executed, not merely described',
    ],
    verificationGates: ['real test runner exit code', 'tolerance assertion', 'adversarial input suite'],
    keywords: ['test', 'qa', 'verify', 'verification', 'unittest', 'pytest', 'tolerance', 'edge case', 'اختبار', 'تحقق', 'جودة', 'حالة حافة'],
  },
  'cybersecurity-hardening': {
    id: 'cybersecurity-hardening',
    labelAr: 'الأمان السيبراني والتحصين',
    labelEn: 'Cybersecurity Hardening',
    brainRole: 'auditor',
    rules: [
      'Path-traversal guards on every file operation',
      'Sanitized child environments: no API_KEY/TOKEN/SECRET/PASSWORD',
      'Parameterized queries and zero hardcoded credentials',
    ],
    verificationGates: ['traversal rejection test', 'secret scan findings = 0', 'child env leak test'],
    keywords: ['security', 'secure', 'secret', 'auth', 'token', 'traversal', 'injection', 'hardening', 'encrypt', 'أمان', 'سري', 'حماية', 'اختراق', 'تحصين'],
  },
};

export const DEPARTMENT_IDS = Object.keys(DEPARTMENTS) as DepartmentId[];

/** Baseline departments for any engineering work order. */
const BASELINE: DepartmentId[] = ['software-architecture', 'qa-os-verification', 'cybersecurity-hardening'];

export interface DepartmentInput {
  title: string;
  problemStatement: string;
  targetLang?: string;
}

export interface DepartmentAssignment {
  department: Department;
  score: number;
  evidence: string[];
}

/**
 * Deterministic keyword classifier. A department activates when at least one
 * keyword is present; relevance score is the number of distinct matched terms.
 */
function keywordMatches(haystack: string, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  if (/[\u0600-\u06FF]/.test(needle)) return haystack.includes(needle);
  // Short Latin tokens must match whole tokens: "ui" must not match "fluid".
  if (needle.length <= 4) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`).test(haystack);
  }
  return haystack.includes(needle);
}

export function classifyDepartments(input: DepartmentInput): DepartmentAssignment[] {
  const haystack = `${input.title}\n${input.problemStatement}\n${input.targetLang || ''}`.toLowerCase();
  const assignments: DepartmentAssignment[] = [];

  for (const id of DEPARTMENT_IDS) {
    const department = DEPARTMENTS[id];
    const evidence = department.keywords.filter((keyword) => keywordMatches(haystack, keyword));
    if (evidence.length === 0) continue;
    assignments.push({ department, score: evidence.length, evidence: evidence.slice(0, 6) });
  }

  if (assignments.length === 0) {
    for (const id of BASELINE) {
      assignments.push({ department: DEPARTMENTS[id], score: 0, evidence: ['baseline engineering gate'] });
    }
  }
  return assignments.sort((a, b) => b.score - a.score || a.department.id.localeCompare(b.department.id));
}

export function activeRules(assignments: DepartmentAssignment[]): string[] {
  return assignments.flatMap((a) => a.department.rules.map((rule) => `[${a.department.id}] ${rule}`));
}

export function verificationGates(assignments: DepartmentAssignment[]): string[] {
  return Array.from(new Set(assignments.flatMap((a) => a.department.verificationGates)));
}

export function mappedBrainRoles(assignments: DepartmentAssignment[]): BrainRole[] {
  return Array.from(new Set(assignments.map((a) => a.department.brainRole)));
}
