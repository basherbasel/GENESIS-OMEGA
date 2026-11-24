/**
 * Seven Deep-Tech R&D divisions and the strict three-layer architecture
 * (v5). This module is additive: `departments.ts` stays untouched so every
 * existing classification test remains valid.
 *
 * Classification is deterministic keyword evidence; architecture plans are
 * assembled from the active divisions' declared layer responsibilities.
 */

import type { BrainRole } from '../brains/brain_registry';

export type DeepTechDivisionId =
  | 'systems-lowlevel-hal'
  | 'physics-computational'
  | 'local-edge-ai'
  | 'core-algorithms-dsp'
  | 'visualization-3d-hmi'
  | 'verification-hil-devops'
  | 'reverse-engineering-analysis';

export type ArchitectureLayerId = 'core' | 'middleware' | 'presentation';

export type ReSubTrackId = 'binary-software' | 'firmware-embedded' | 'protocol-bus' | 'hardware-pcb' | 'ai-model-graph';

export interface DeepTechDivision {
  id: DeepTechDivisionId;
  labelAr: string;
  labelEn: string;
  languages: string[];
  toolchains: string[];
  deliverables: string[];
  integrationContracts: string[];
  layers: ArchitectureLayerId[];
  brainRole: BrainRole;
  keywords: string[];
}

export const DEEP_TECH_DIVISIONS: Record<DeepTechDivisionId, DeepTechDivision> = {
  'systems-lowlevel-hal': {
    id: 'systems-lowlevel-hal',
    labelAr: 'الأنظمة والمستوى المنخفض وتجريد العتاد',
    labelEn: 'Systems, Low-Level & Hardware Abstraction',
    languages: ['C', 'Modern C++', 'Rust'],
    toolchains: ['CMake', 'GCC/Clang', 'Rust cargo', 'WebUSB', 'Serial/UART'],
    deliverables: ['HAL interfaces', 'device drivers', 'bounded concurrency primitives', 'memory-safe core modules'],
    integrationContracts: ['exposes HAL contract to middleware', 'consumes RE hardware specifications'],
    layers: ['core'],
    brainRole: 'coder',
    keywords: ['hal', 'driver', 'firmware', 'kernel', 'embedded', 'c++', 'rust', 'memory', 'concurrency', 'serial', 'usb', 'عتاد', 'محرك', 'مستوى منخفض'],
  },
  'physics-computational': {
    id: 'physics-computational',
    labelAr: 'محاكاة الفيزياء والهندسة الحسابية',
    labelEn: 'Physics Simulation & Computational Engineering',
    languages: ['C++', 'Fortran', 'Python'],
    toolchains: ['ODE/PDE solvers', 'CFD', 'thermal analysis', 'rigid-body dynamics', 'SI units'],
    deliverables: ['validated solvers', 'conservation-check reports', 'digital-twin parameters'],
    integrationContracts: ['supplies numerical kernels to core layer', 'consumes RE-extracted physical parameters'],
    layers: ['core'],
    brainRole: 'architect',
    keywords: ['physics', 'ode', 'pde', 'cfd', 'thermal', 'rigid body', 'conservation', 'si units', 'فيزياء', 'محاكاة', 'حراري'],
  },
  'local-edge-ai': {
    id: 'local-edge-ai',
    labelAr: 'الذكاء المحلي والاستنتاج الطرفي',
    labelEn: 'Local AI & Edge Inference Engineering',
    languages: ['C++', 'Python'],
    toolchains: ['llama.cpp', 'ONNX Runtime', 'GGUF quantization', 'pruning', 'CPU/RAM budgets'],
    deliverables: ['bounded inference runtime', 'quantized model artifacts', 'fail-closed agent policies'],
    integrationContracts: ['runs behind local_synthesis bridge', 'consumes RE model-graph specifications'],
    layers: ['middleware'],
    brainRole: 'architect',
    keywords: ['llama', 'onnx', 'gguf', 'quantization', 'inference', 'edge', 'model', 'استنتاج', 'نموذج', 'تكميم'],
  },
  'core-algorithms-dsp': {
    id: 'core-algorithms-dsp',
    labelAr: 'الخوارزميات الأساسية والتحسين والإشارات والرؤية',
    labelEn: 'Core Algorithms, Optimization & DSP/CV',
    languages: ['C++', 'Python'],
    toolchains: ['path planning', 'mathematical optimization', 'OpenCV', 'SciPy', 'complexity invariants'],
    deliverables: ['proven complexity bounds', 'signal pipelines', 'vision processing modules'],
    integrationContracts: ['provides deterministic algorithms to core', 'feeds metrics to middleware'],
    layers: ['core', 'middleware'],
    brainRole: 'coder',
    keywords: ['algorithm', 'optimization', 'dsp', 'signal', 'opencv', 'vision', 'path planning', 'complexity', 'خوارزمية', 'تحسين', 'إشارة', 'رؤية'],
  },
  'visualization-3d-hmi': {
    id: 'visualization-3d-hmi',
    labelAr: 'التصور ثلاثي الأبعاد والتصميم والتحليل وواجهات القياس',
    labelEn: '3D Visualization, CAD/CAE & Telemetry HMI',
    languages: ['C++', 'TypeScript', 'Python'],
    toolchains: ['Three.js', 'WebGL', 'PyQt6', 'Qt workbenches', 'real-time dashboards'],
    deliverables: ['telemetry HMI', '3D digital twins', 'CAD/CAE viewers'],
    integrationContracts: ['consumes middleware telemetry streams', 'renders RE-extracted geometry'],
    layers: ['presentation'],
    brainRole: 'coder',
    keywords: ['three.js', 'webgl', '3d', 'cad', 'cae', 'pyqt', 'telemetry', 'hmi', 'dashboard', 'تصور', 'قياس', 'واجهة'],
  },
  'verification-hil-devops': {
    id: 'verification-hil-devops',
    labelAr: 'التحقق والاختبار بالعتاد في الحلقة وتوصيل التسليم المستمر',
    labelEn: 'Verification, HIL Testing & DevOps',
    languages: ['Python', 'Bash', 'CMake'],
    toolchains: ['CI/CD', 'HIL simulation', 'profiling', 'sanitizers', 'test harnesses'],
    deliverables: ['HIL harnesses', 'profiling reports', 'reproducible pipelines'],
    integrationContracts: ['verifies all three layers', 'records evidence in audit ledger'],
    layers: ['middleware', 'presentation'],
    brainRole: 'healer',
    keywords: ['verification', 'hil', 'test', 'ci', 'cd', 'cmake', 'profiling', 'sanitizer', 'تحقق', 'اختبار', 'توصيل'],
  },
  'reverse-engineering-analysis': {
    id: 'reverse-engineering-analysis',
    labelAr: 'الهندسة العكسية وتحليل الثنائيات والبرمجيات والبروتوكولات',
    labelEn: 'Reverse Engineering & Binary/Firmware/Protocol Analysis',
    languages: ['C', 'Python', 'TypeScript'],
    toolchains: ['Ghidra', 'Radare2', 'Binwalk', 'Wireshark', 'Kaitai', 'KiCad', 'Netron'],
    deliverables: ['structural inspection reports', 'protocol field maps', 'digital-twin parameters'],
    integrationContracts: ['feeds specifications to Systems, Physics, Local AI and Security'],
    layers: ['core', 'middleware'],
    brainRole: 'auditor',
    keywords: ['reverse', 'binary', 'firmware', 'protocol', 'elf', 'pe', 'macho', 'gguf', 'entropy', 'strings', 'packet', 'crc', 'هندسة عكسية', 'ثنائي', 'برمجية', 'بروتوكول', 'حزمة'],
  },
};

export const DEEP_TECH_IDS = Object.keys(DEEP_TECH_DIVISIONS) as DeepTechDivisionId[];

export const RE_SUB_TRACKS: Array<{
  id: ReSubTrackId;
  labelAr: string;
  labelEn: string;
  tools: string[];
}> = [
  { id: 'binary-software', labelAr: 'تحليل البرمجيات الثنائية', labelEn: 'Binary software analysis', tools: ['Ghidra', 'Radare2'] },
  { id: 'firmware-embedded', labelAr: 'البرمجيات المدمجة وال firmware', labelEn: 'Firmware & embedded analysis', tools: ['Binwalk'] },
  { id: 'protocol-bus', labelAr: 'البروتوكولات والنواقل', labelEn: 'Protocol & bus analysis', tools: ['Wireshark', 'Kaitai'] },
  { id: 'hardware-pcb', labelAr: 'العتاد ولوحات الدوائر', labelEn: 'Hardware & PCB analysis', tools: ['KiCad'] },
  { id: 'ai-model-graph', labelAr: 'مخططات نماذج الذكاء الاصطناعي', labelEn: 'AI model graph analysis', tools: ['Netron', 'GGUF parser'] },
];

export const LAYER_ARCHITECTURE: Array<{
  id: ArchitectureLayerId;
  labelAr: string;
  labelEn: string;
  technologies: string[];
  responsibilityAr: string;
  responsibilityEn: string;
}> = [
  {
    id: 'core',
    labelAr: 'الطبقة السفلى — النواة والعتاد',
    labelEn: 'Layer 1 — Bottom Core & Hardware',
    technologies: ['C', 'Modern C++', 'Rust', 'HAL', 'drivers', 'numerical kernels'],
    responsibilityAr: 'حوسبة محددة الموارد، محركات أجهزة، ومخازن ذاكرة آمنة.',
    responsibilityEn: 'Bounded compute, device drivers and memory-safe primitives.',
  },
  {
    id: 'middleware',
    labelAr: 'الطبقة الوسطى — الوسيط والذكاء المحلي',
    labelEn: 'Layer 2 — Middleware & Local AI',
    technologies: ['FastAPI', 'pybind11', 'IPC', 'llama.cpp', 'ONNX Runtime', 'GGUF'],
    responsibilityAr: 'جسر محلي بين النواة والواجهة مع قرار استنتاج محلي fail-closed.',
    responsibilityEn: 'Local bridge between core and UI with fail-closed inference decisions.',
  },
  {
    id: 'presentation',
    labelAr: 'الطبقة العليا — العرض والقياس عن بُعد',
    labelEn: 'Layer 3 — Presentation & Telemetry HMI',
    technologies: ['React', 'TypeScript', 'Three.js', 'WebGL', 'PyQt6', 'Qt'],
    responsibilityAr: 'ورشة هندسية تفاعلية تعرض القياسات والتوأم الرقمي لحظياً.',
    responsibilityEn: 'Interactive engineering workbench for live telemetry and digital twins.',
  },
];

export interface DeepTechMissionInput {
  title: string;
  problemStatement: string;
  targetLang?: string;
}

export interface DeepTechAssignment {
  division: DeepTechDivision;
  score: number;
  evidence: string[];
}

/** Deterministic classifier; never calls an LLM. */
export function classifyDeepTechMission(input: DeepTechMissionInput): DeepTechAssignment[] {
  const haystack = `${input.title}\n${input.problemStatement}\n${input.targetLang || ''}`.toLowerCase();
  const assignments: DeepTechAssignment[] = [];
  for (const id of DEEP_TECH_IDS) {
    const division = DEEP_TECH_DIVISIONS[id];
    const evidence = division.keywords.filter((keyword) => {
      const needle = keyword.toLowerCase();
      if (/[\u0600-\u06FF]/.test(needle)) return haystack.includes(needle);
      if (needle.length <= 4) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`).test(haystack);
      }
      return haystack.includes(needle);
    });
    if (evidence.length > 0) assignments.push({ division, score: evidence.length, evidence: evidence.slice(0, 6) });
  }
  if (assignments.length === 0) {
    for (const id of ['systems-lowlevel-hal', 'verification-hil-devops'] as DeepTechDivisionId[]) {
      assignments.push({ division: DEEP_TECH_DIVISIONS[id], score: 0, evidence: ['baseline 3-layer engineering gate'] });
    }
  }
  return assignments.sort((a, b) => b.score - a.score || a.division.id.localeCompare(b.division.id));
}

export interface LayerPlan {
  id: ArchitectureLayerId;
  labelAr: string;
  labelEn: string;
  technologies: string[];
  responsibilities: string[];
  deliverables: string[];
  divisions: string[];
}

export interface LayeredArchitecturePlan {
  at: string;
  divisions: DeepTechDivisionId[];
  layers: LayerPlan[];
  contracts: string[];
}

/** Maps active divisions onto the three real layers with explicit contracts. */
export function buildLayeredArchitecturePlan(divisions: DeepTechAssignment[]): LayeredArchitecturePlan {
  const layers: LayerPlan[] = LAYER_ARCHITECTURE.map((layer) => ({
    id: layer.id,
    labelAr: layer.labelAr,
    labelEn: layer.labelEn,
    technologies: [...layer.technologies],
    responsibilities: [layer.responsibilityAr, layer.responsibilityEn],
    deliverables: [],
    divisions: [],
  }));

  const contracts = new Set<string>();
  for (const assignment of divisions) {
    const division = assignment.division;
    for (const layerId of division.layers) {
      const layer = layers.find((item) => item.id === layerId)!;
      layer.divisions.push(division.id);
      for (const tech of division.toolchains) if (!layer.technologies.includes(tech)) layer.technologies.push(tech);
      for (const deliverable of division.deliverables) if (!layer.deliverables.includes(deliverable)) layer.deliverables.push(deliverable);
    }
    for (const contract of division.integrationContracts) contracts.add(`${division.id}: ${contract}`);
  }

  return {
    at: new Date().toISOString(),
    divisions: divisions.map((item) => item.division.id),
    layers: layers.map((layer) => ({ ...layer, divisions: [...new Set(layer.divisions)].sort() })),
    contracts: [...contracts].sort(),
  };
}
