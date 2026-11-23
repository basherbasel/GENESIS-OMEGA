/**
 * Persisted finite-state machine for engineering work orders.
 *
 * Every transition is emitted through the supplied event callback so the
 * server can broadcast it over the existing SSE bus. All heavy stages use
 * injected real implementations (local bridge synthesis, real OS verifier,
 * real security scanner, real healer). Any failure is terminal FAILED_CLOSED
 * with an explicit code — never a cloud fallback or a fabricated pass count.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { BrainRole } from '../brains/brain_registry';
import type { LocalSynthesisOutput } from '../local_synthesis';
import { isSafeRelativePath } from '../security';
import { computeHealingScore } from '../healer';
import { scanTaintFlows } from '../security/taint_scanner';
import type { PeerReviewResult } from './peer_review_council';
import type { PrecisionReport } from './precision_verifier';
import type { EcosystemKey, ExecutionVerifySummary, HealingReport } from '../types';
import { activeRules, classifyDepartments, mappedBrainRoles, verificationGates, type DepartmentInput } from './departments';

export type WorkOrderStage =
  | 'BACKLOG'
  | 'SPEC_BLUEPRINT'
  | 'IMPLEMENTATION'
  | 'OS_VERIFICATION'
  | 'SECURITY_AUDIT'
  | 'SELF_HEALING'
  | 'VERIFIED_COMMIT'
  | 'FAILED_CLOSED';

export const WORK_ORDER_STAGES: WorkOrderStage[] = [
  'BACKLOG',
  'SPEC_BLUEPRINT',
  'IMPLEMENTATION',
  'OS_VERIFICATION',
  'SECURITY_AUDIT',
  'SELF_HEALING',
  'VERIFIED_COMMIT',
  'FAILED_CLOSED',
];

export interface WorkOrderLog {
  stage: WorkOrderStage;
  at: string;
  detail: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  problemStatement: string;
  targetLang?: string;
  ecosystemKey: EcosystemKey;
  departmentIds: string[];
  activeRules: string[];
  verificationGates: string[];
  brainRoles: BrainRole[];
  stage: WorkOrderStage;
  errorCode?: string;
  errorDetail?: string;
  blueprint?: string;
  files: Record<string, string>;
  finalScore?: number;
  testsRun?: number;
  verification?: ExecutionVerifySummary;
  healing?: HealingReport;
  peerReview?: PeerReviewResult;
  precision?: PrecisionReport;
  auditLog: WorkOrderLog[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderEvent {
  type: 'work_order.transition';
  orderId: string;
  stage: WorkOrderStage;
  at: string;
  errorCode?: string;
}

export interface WorkOrderStore {
  load(): WorkOrder[];
  save(orders: WorkOrder[]): void;
}

export interface WorkOrderDeps {
  workspaceRoot: string;
  store: WorkOrderStore;
  synthesize: (params: {
    role: BrainRole;
    title: string;
    prompt: string;
  }) => Promise<LocalSynthesisOutput>;
  verify: (workspaceDir: string, files: Record<string, string>, ecosystemKey: EcosystemKey) => Promise<ExecutionVerifySummary>;
  scan: (files: Record<string, string>) => { secrets: unknown[]; staticIssues: string[] };
  heal?: (params: {
    files: Record<string, string>;
    workspaceDir: string;
    verification: ExecutionVerifySummary;
    ecosystemKey: EcosystemKey;
  }) => Promise<{ files: Record<string, string>; report: HealingReport } | null>;
  /** v3: adversarial peer review before VERIFIED_COMMIT; injected by the server. */
  peerReview?: (input: {
    workspaceDir: string;
    problemStatement: string;
    departments: Array<{ id: string; score: number }>;
    files: Record<string, string>;
    verification: ExecutionVerifySummary;
  }) => Promise<PeerReviewResult>;
  /** v3: real runtime precision/boundary measurement. */
  precision?: (input: {
    label: string;
    departments: Array<{ id: string; score: number }>;
    verification: ExecutionVerifySummary;
    files: Record<string, string>;
    workspaceDir: string;
  }) => Promise<PrecisionReport>;
  onEvent?: (event: WorkOrderEvent) => void;
}

export interface CreateWorkOrderInput extends DepartmentInput {
  ecosystemKey?: EcosystemKey;
}

export class WorkOrderEngine {
  private readonly orders: WorkOrder[];
  private readonly running = new Set<string>();
  private sequence = 0;

  constructor(private readonly deps: WorkOrderDeps) {
    this.orders = deps.store.load();
  }

  list(): WorkOrder[] {
    return [...this.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): WorkOrder | undefined {
    return this.orders.find((order) => order.id === id);
  }

  /** v3: real cancellation path for voice/UI control (no fabricated state). */
  cancel(id: string, reason = 'cancelled by operator'): WorkOrder | null {
    const order = this.get(id);
    if (!order) return null;
    if (order.stage === 'VERIFIED_COMMIT' || order.stage === 'FAILED_CLOSED') return order;
    this.fail(order, 'CANCELLED', order.stage, reason);
    return order;
  }

  create(input: CreateWorkOrderInput): WorkOrder {
    const assignments = classifyDepartments(input);
    const now = new Date().toISOString();
    const order: WorkOrder = {
      id: `wo-${Date.now()}-${++this.sequence}`,
      title: input.title,
      problemStatement: input.problemStatement,
      targetLang: input.targetLang,
      ecosystemKey: input.ecosystemKey || 'python',
      departmentIds: assignments.map((a) => a.department.id),
      activeRules: activeRules(assignments),
      verificationGates: verificationGates(assignments),
      brainRoles: mappedBrainRoles(assignments),
      stage: 'BACKLOG',
      files: {},
      auditLog: [{ stage: 'BACKLOG', at: now, detail: `departments=${orderDepartmentSummary(assignments)}` }],
      createdAt: now,
      updatedAt: now,
    };
    this.orders.unshift(order);
    this.persist();
    this.emit(order);
    return order;
  }

  async run(id: string): Promise<WorkOrder> {
    const order = this.get(id);
    if (!order) throw new Error(`work order not found: ${id}`);
    if (this.running.has(id)) return order;
    this.running.add(id);
    try {
      const blueprint = await this.specBlueprint(order);
      if (!blueprint) return order;
      const implemented = await this.implement(order, blueprint);
      if (!implemented) return order;

      let verification = await this.deps.verify(this.workspaceDir(order.id), order.files, order.ecosystemKey);
      this.transition(order, 'OS_VERIFICATION', `exit=${verification.exitCode} tests=${verification.testsExecuted}/${verification.testsPassed}`);
      if (verification.exitCode !== 0) {
        return this.needsHealing(order, verification, 'OS_VERIFY_FAILED');
      }

      const scan = this.deps.scan(order.files);
      const taint = scanTaintFlows(order.files);
      this.transition(order, 'SECURITY_AUDIT', `secrets=${scan.secrets.length} staticIssues=${scan.staticIssues.length} taint=${taint.length}`);
      if (scan.secrets.length > 0 || scan.staticIssues.length > 0 || taint.length > 0) {
        return this.needsHealing(order, verification, taint.length > 0 ? 'TAINT_SCAN_FAILED' : 'SECURITY_AUDIT_FAILED');
      }

      return this.finalize(order, verification);
    } finally {
      this.running.delete(id);
    }
  }

  private async specBlueprint(order: WorkOrder): Promise<string | null> {
    const prompt = [
      `Title: ${order.title}`,
      `Problem: ${order.problemStatement}`,
      `Target language: ${order.targetLang || order.ecosystemKey}`,
      `Active engineering rules:\n${order.activeRules.join('\n')}`,
      `Required verification gates:\n${order.verificationGates.join('\n')}`,
      'Return STRICT JSON: {"architectureSummary":"...","files":[]}. Do not emit any file yet.',
    ].join('\n\n');
    const result = await this.deps.synthesize({ role: 'architect', title: order.title, prompt });
    if (!result.usedLocal || result.error) {
      this.fail(order, result.errorCode || 'SPEC_FAILED', 'SPEC_BLUEPRINT', result.error || 'architect returned no blueprint');
      return null;
    }
    const blueprint = result.architectureSummary?.trim() || '';
    this.transition(order, 'SPEC_BLUEPRINT', blueprint.slice(0, 180));
    order.blueprint = blueprint;
    this.persist();
    this.emit(order);
    return blueprint;
  }

  private async implement(order: WorkOrder, blueprint: string): Promise<boolean> {
    const prompt = [
      `Title: ${order.title}`,
      `Problem: ${order.problemStatement}`,
      `Blueprint: ${blueprint || 'use the active rules below'}`,
      `Active engineering rules:\n${order.activeRules.join('\n')}`,
      'Return STRICT JSON: {"architectureSummary":"...","files":[{"path":"...","content":"..."}]}.',
    ].join('\n\n');
    const result = await this.deps.synthesize({ role: 'coder', title: order.title, prompt });
    if (!result.usedLocal || result.error) {
      this.fail(order, result.errorCode || 'IMPLEMENTATION_FAILED', 'IMPLEMENTATION', result.error || 'coder returned no files');
      return false;
    }

    const files: Record<string, string> = {};
    for (const [rawPath, content] of Object.entries(result.generatedFiles)) {
      const safe = isSafeRelativePath(rawPath);
      if (!safe) {
        this.fail(order, 'UNSAFE_PATH', 'IMPLEMENTATION', `rejected path ${rawPath}`);
        return false;
      }
      files[safe] = content;
    }
    const workspaceDir = this.workspaceDir(order.id);
    fs.mkdirSync(workspaceDir, { recursive: true });
    for (const [safePath, content] of Object.entries(files)) {
      const destination = path.resolve(workspaceDir, safePath);
      if (!destination.startsWith(workspaceDir + path.sep)) {
        this.fail(order, 'UNSAFE_PATH', 'IMPLEMENTATION', `path escaped workspace: ${safePath}`);
        return false;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content, 'utf-8');
    }
    order.files = files;
    this.transition(order, 'IMPLEMENTATION', `files=${Object.keys(files).length}`);
    this.persist();
    this.emit(order);
    return true;
  }

  private async needsHealing(
    order: WorkOrder,
    verification: ExecutionVerifySummary,
    code: string,
  ): Promise<WorkOrder> {
    this.transition(order, 'SELF_HEALING', `reason=${code}`);
    this.persist();
    this.emit(order);
    if (!this.deps.heal) {
      this.fail(order, 'HEAL_UNAVAILABLE', 'SELF_HEALING', code);
      return order;
    }
    const healed = await this.deps.heal({
      files: order.files,
      workspaceDir: this.workspaceDir(order.id),
      verification,
      ecosystemKey: order.ecosystemKey,
    });
    if (!healed) {
      this.fail(order, 'HEAL_EXHAUSTED', 'SELF_HEALING', code);
      return order;
    }
    order.files = healed.files;
    order.healing = healed.report;
    const second = await this.deps.verify(this.workspaceDir(order.id), order.files, order.ecosystemKey);
    if (second.exitCode !== 0) {
      this.fail(order, 'OS_VERIFY_FAILED', 'SELF_HEALING', `exit=${second.exitCode}`);
      return order;
    }
    const scan = this.deps.scan(order.files);
    const taint = scanTaintFlows(order.files);
    if (scan.secrets.length > 0 || scan.staticIssues.length > 0 || taint.length > 0) {
      this.fail(order, taint.length > 0 ? 'TAINT_SCAN_FAILED' : 'SECURITY_AUDIT_FAILED', 'SELF_HEALING', `secrets=${scan.secrets.length} staticIssues=${scan.staticIssues.length} taint=${taint.length}`);
      return order;
    }
    this.transition(order, 'VERIFIED_COMMIT', 'healed and re-verified');
    return this.finalize(order, second);
  }

  /** v3 gates: adversarial peer review then quantitative precision, fail closed. */
  private async finalize(order: WorkOrder, verification: ExecutionVerifySummary): Promise<WorkOrder> {
    const departments = order.departmentIds.map((id) => ({ id, score: 0 }));
    if (this.deps.peerReview) {
      const review = await this.deps.peerReview({
        workspaceDir: this.workspaceDir(order.id),
        problemStatement: order.problemStatement,
        departments,
        files: order.files,
        verification,
      });
      order.peerReview = review;
      this.persist();
      if (!review.passed) {
        this.fail(order, 'PEER_REVIEW_REJECTED', 'SECURITY_AUDIT', review.findings
          .filter((item) => item.severity === 'CRITICAL' || item.severity === 'HIGH')
          .map((item) => `${item.id}@${item.file}:${item.line}`)
          .slice(0, 6)
          .join(', '));
        return order;
      }
      if (review.remediationApplied && review.files) {
        order.files = review.files;
        const rechecked = await this.deps.verify(this.workspaceDir(order.id), order.files, order.ecosystemKey);
        if (rechecked.exitCode !== 0) {
          this.fail(order, 'PEER_REVIEW_REJECTED', 'OS_VERIFICATION', `exit=${rechecked.exitCode} after remediation`);
          return order;
        }
        verification = rechecked;
      }
    }

    if (this.deps.precision) {
      const precision = await this.deps.precision({
        label: order.id,
        departments,
        verification,
        files: order.files,
        workspaceDir: this.workspaceDir(order.id),
      });
      order.precision = precision;
      this.persist();
      if (!precision.passed) {
        this.fail(order, 'PRECISION_REJECTED', 'OS_VERIFICATION', precision.findings.map((f) => f.id).join(', '));
        return order;
      }
    }

    this.transition(order, 'VERIFIED_COMMIT', order.peerReview ? 'peer-reviewed and verified' : 'verified');
    order.finalScore = computeHealingScore(order.files, verification);
    order.testsRun = verification.testsExecuted;
    order.verification = verification;
    this.persist();
    this.emit(order);
    return order;
  }

  private workspaceDir(id: string): string {
    return path.join(this.deps.workspaceRoot, `work_order_${id.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  }

  private transition(order: WorkOrder, stage: WorkOrderStage, detail: string): void {
    order.stage = stage;
    order.auditLog.push({ stage, at: new Date().toISOString(), detail });
    order.updatedAt = new Date().toISOString();
    this.persist();
    this.emit(order);
  }

  private fail(order: WorkOrder, code: string, stage: WorkOrderStage, detail: string): void {
    order.stage = 'FAILED_CLOSED';
    order.errorCode = code;
    order.errorDetail = `${stage}: ${detail}`;
    order.auditLog.push({ stage: 'FAILED_CLOSED', at: new Date().toISOString(), detail: `${code} @ ${stage}: ${detail}` });
    order.updatedAt = new Date().toISOString();
    this.persist();
    this.emit(order);
  }

  private persist(): void {
    this.deps.store.save(this.orders);
  }

  private emit(order: WorkOrder): void {
    this.deps.onEvent?.({
      type: 'work_order.transition',
      orderId: order.id,
      stage: order.stage,
      at: new Date().toISOString(),
      errorCode: order.errorCode,
    });
  }
}

function orderDepartmentSummary(assignments: ReturnType<typeof classifyDepartments>): string {
  return assignments.map((a) => `${a.department.id}:${a.score}`).join(',');
}
