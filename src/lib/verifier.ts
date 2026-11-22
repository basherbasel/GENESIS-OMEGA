import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { isSafeRelativePath, validateRedTeamScript } from './security';
import type { EcosystemKey, ExecutionVerifySummary } from './types';

const execFileAsync = promisify(execFile);

interface ToolchainStep {
  cmd: string;
  args: string[];
}

/**
 * Real self-test commands for ecosystems whose generated projects carry an
 * executable check instead of a framework test suite. `@local:` refers to a
 * binary produced by an earlier compile step inside the workspace.
 */
const TOOLCHAIN_TESTS: Partial<Record<EcosystemKey, ToolchainStep[]>> = {
  go: [{ cmd: 'go', args: ['test', './...'] }],
  java: [
    { cmd: 'javac', args: ['Main.java'] },
    { cmd: 'java', args: ['-ea', 'Main'] },
  ],
  powershell: [{ cmd: 'pwsh', args: ['-NoProfile', '-File', 'test_main.ps1'] }],
  bash: [{ cmd: 'sh', args: ['test_main.sh'] }],
  rust: [{ cmd: 'cargo', args: ['test'] }],
  ruby: [{ cmd: 'ruby', args: ['test_tool.rb'] }],
  lua: [{ cmd: 'lua', args: ['test_game.lua'] }],
  php: [{ cmd: 'php', args: ['test_router.php'] }],
  c: [
    { cmd: 'gcc', args: ['-O2', '-std=c17', '-Wall', 'main.c', '-o', 'app'] },
    { cmd: '@local:app', args: [] },
  ],
  cpp: [
    { cmd: 'g++', args: ['-O2', '-std=c++20', '-Wall', 'main.cpp', '-o', 'app'] },
    { cmd: '@local:app', args: [] },
  ],
  fortran: [
    { cmd: 'gfortran', args: ['-O2', 'main.f90', '-o', 'app'] },
    { cmd: '@local:app', args: [] },
  ],
  pascal: [
    { cmd: 'fpc', args: ['main.pas'] },
    { cmd: '@local:main', args: [] },
  ],
  cobol: [
    { cmd: 'cobc', args: ['-x', '-free', 'main.cob', '-o', 'app'] },
    { cmd: '@local:app', args: [] },
  ],
  flutter: [{ cmd: 'dart', args: ['test'] }],
  csharp: [{ cmd: 'dotnet', args: ['test', 'OmegaService.Tests/OmegaService.Tests.csproj'] }],
};

function resolveToolchainCommand(cwd: string, cmd: string): string {
  if (!cmd.startsWith('@local:')) return cmd;
  const name = cmd.slice('@local:'.length);
  const absolute = path.resolve(cwd, name);
  if (process.platform === 'win32' && fs.existsSync(`${absolute}.exe`)) return `${absolute}.exe`;
  return absolute;
}

/**
 * Node's test runner sets NODE_TEST_CONTEXT in child processes, which makes a
 * spawned `node --test` skip all files ("run() called recursively"). Strip it
 * so verification works both from the server and from inside a test suite.
 */
/** Absolute path to the installed tsx loader, resolvable from any cwd. */
function resolveTsxEntry(): string | null {
  try {
    return pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  } catch {
    return null;
  }
}

function verifierChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_REPORTER;
  // GnuCOBOL from MSYS2 resolves its config via an MSYS-style path when
  // spawned directly; point it at the native directory explicitly.
  if (!env.COB_CONFIG_DIR) {
    const candidates = [
      'C:\\msys64\\ucrt64\\share\\gnucobol\\config',
      'C:\\msys64\\mingw64\\share\\gnucobol\\config',
      '/ucrt64/share/gnucobol/config',
    ];
    const found = candidates.find((dir) => fs.existsSync(dir));
    if (found) env.COB_CONFIG_DIR = found;
  }
  return env;
}

function resolveConfinedPath(rootDir: string, relPath: string): string | null {
  const safe = isSafeRelativePath(relPath);
  if (!safe) return null;
  const resolvedRoot = path.resolve(rootDir);
  const target = path.resolve(resolvedRoot, safe);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return target;
}

export function materializeWorkspaceFiles(workspaceDir: string, files: Record<string, string>): string[] {
  const resolvedRoot = path.resolve(workspaceDir);
  fs.mkdirSync(resolvedRoot, { recursive: true });
  const written: string[] = [];

  for (const [relPath, content] of Object.entries(files)) {
    const target = resolveConfinedPath(resolvedRoot, relPath);
    if (!target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
    written.push(path.relative(resolvedRoot, target).split(path.sep).join('/'));
  }

  return written;
}

function parseUnittestOutput(output: string): { ran: number; failed: number } {
  const ranMatch = output.match(/Ran\s+(\d+)\s+tests?/i);
  const ran = ranMatch ? Number(ranMatch[1]) : 0;
  const failedMatch = output.match(/FAILED\s*\((?:failures=(\d+))?(?:,\s*errors=(\d+))?/i);
  const failures = failedMatch ? Number(failedMatch[1] || 0) + Number(failedMatch[2] || 0) : 0;
  return { ran, failed: failures };
}

function parseNodeTestOutput(output: string): { ran: number; passed: number } {
  const testsMatch = output.match(/(?:#\s*tests\s+|ℹ\s*tests\s+)(\d+)/i);
  const passMatch = output.match(/(?:#\s*pass\s+|ℹ\s*pass\s+)(\d+)/i);
  const ran = testsMatch ? Number(testsMatch[1]) : 0;
  const passed = passMatch ? Number(passMatch[1]) : 0;
  return { ran, passed };
}

export async function verifyProjectWorkspace(
  workspaceDir: string,
  files: Record<string, string>,
  ecosystemKey: EcosystemKey,
): Promise<ExecutionVerifySummary> {
  const resolvedRoot = path.resolve(workspaceDir);
  materializeWorkspaceFiles(resolvedRoot, files);

  const outputLines: string[] = [];
  let testsExecuted = 0;
  let testsPassed = 0;
  let redTeamPassed = true;
  let exitCode = 0;
  let runtime: ExecutionVerifySummary['runtime'] = 'static-validator';
  let ranRealTests = false;

  // Validate JSON contracts
  for (const jsonName of ['openapi.json', 'mock_fixtures.json', 'sbom.json']) {
    if (files[jsonName]) {
      try {
        JSON.parse(files[jsonName]);
        outputLines.push(`[JSON OK] ${jsonName}`);
      } catch (err) {
        exitCode = 1;
        outputLines.push(`[JSON ERR] ${jsonName}: ${err instanceof Error ? err.message : 'invalid'}`);
      }
    }
  }

  // Validate SQLite WAL DDL migrations via python3 sqlite3 in-memory
  if (files['migrations/001_init.sql']) {
    try {
      await execFileAsync(
        'python3',
        [
          '-c',
          'import sqlite3, pathlib; c=sqlite3.connect(":memory:"); c.executescript(pathlib.Path("migrations/001_init.sql").read_text()); c.close(); print("SQL_OK")',
        ],
        { cwd: resolvedRoot, env: verifierChildEnv(), timeout: 6000 },
      );
      outputLines.push('[SQLite DDL OK] migrations/001_init.sql verified');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SQL validation failed';
      outputLines.push(`[SQLite DDL WARN] ${msg.slice(0, 180)}`);
    }
  }

  const pyTestFiles = Object.keys(files).filter((f) => f.endsWith('.py') && path.basename(f).startsWith('test_'));
  const hasRedTeamPy = Boolean(files['red_team_attack.py']);
  const jsTestFiles = Object.keys(files).filter((f) => (f.endsWith('.js') || f.endsWith('.mjs')) && path.basename(f).startsWith('test_'));
  const tsTestFiles = Object.keys(files).filter((f) => f.endsWith('.ts') && path.basename(f).startsWith('test_'));

  if (ecosystemKey === 'nodejs' || ecosystemKey === 'typescript') {
    runtime = 'node';
    const testTargets = ecosystemKey === 'typescript' ? [...tsTestFiles, ...jsTestFiles] : jsTestFiles;
    if (testTargets.length > 0) {
      try {
        const useTsx = ecosystemKey === 'typescript';
        const tsxEntry = useTsx ? resolveTsxEntry() : null;
        // Use the Node executable with an absolute tsx import: on Windows the
        // .bin shim is a .cmd script that cannot be spawned directly.
        const cmd = tsxEntry ? process.execPath : 'node';
        const args = tsxEntry
          ? ['--import', tsxEntry, '--test', ...testTargets]
          : ['--test', ...testTargets];
        const { stdout, stderr } = await execFileAsync(cmd, args, {
          cwd: resolvedRoot, env: verifierChildEnv(),
          timeout: 20_000,
        });
        const combined = `${stdout}\n${stderr}`;
        const parsed = parseNodeTestOutput(combined);
        // Only report counts the runner actually printed. Never invent a passing test.
        testsExecuted += parsed.ran;
        testsPassed += Math.min(parsed.passed, parsed.ran);
        ranRealTests = true;
        outputLines.push(
          `[node --test] ${Math.min(parsed.passed, parsed.ran)}/${parsed.ran} passed` +
            (parsed.ran === 0 ? ' (runner output could not be parsed; count withheld)' : ''),
        );
      } catch (err: unknown) {
        ranRealTests = true;
        exitCode = 1;
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const combined = `${e.stdout || ''}\n${e.stderr || ''}\n${e.message || ''}`;
        const parsed = parseNodeTestOutput(combined);
        testsExecuted += parsed.ran;
        testsPassed += Math.min(parsed.passed, parsed.ran);
        outputLines.push(`[node --test FAILED]\n${combined.slice(-600)}`);
      }
    }

    if (testTargets.length === 0 && !files['red_team_attack.mjs']) {
      outputLines.push('[no-test-suite] لا توجد اختبارات قابلة للتنفيذ؛ لم يُجرَ أي اختبار فعلي.');
    }

    if (files['red_team_attack.mjs']) {
      const check = validateRedTeamScript(files['red_team_attack.mjs']);
      if (!check.safe) {
        redTeamPassed = false;
        outputLines.push(`[Red-Team Blocked] ${check.violations.join('; ')}`);
      } else {
        try {
          const { stdout, stderr } = await execFileAsync('node', ['--test', 'red_team_attack.mjs'], {
            cwd: resolvedRoot, env: verifierChildEnv(),
            timeout: 8000,
          });
          const parsed = parseNodeTestOutput(`${stdout}\n${stderr}`);
          testsExecuted += parsed.ran;
          testsPassed += Math.min(parsed.passed, parsed.ran);
          outputLines.push(`[Red-Team MJS OK] ${Math.min(parsed.passed, parsed.ran)}/${parsed.ran} adversarial checks passed`);
        } catch (err: unknown) {
          redTeamPassed = false;
          exitCode = 1;
          const e = err as { stderr?: string; message?: string };
          outputLines.push(`[Red-Team MJS FAILED] ${(e.stderr || e.message || '').slice(-400)}`);
        }
      }
    }
  } else if (pyTestFiles.length > 0 || hasRedTeamPy) {
    runtime = 'python3';
    const pyFiles = Object.keys(files).filter((f) => f.endsWith('.py'));
    if (pyFiles.length > 0) {
      try {
        await execFileAsync('python3', ['-m', 'py_compile', ...pyFiles], {
          cwd: resolvedRoot, env: verifierChildEnv(),
          timeout: 8000,
        });
        outputLines.push(`[py_compile OK] ${pyFiles.length} Python modules compiled cleanly`);
      } catch (err: unknown) {
        exitCode = 1;
        const e = err as { stderr?: string; message?: string };
        outputLines.push(`[py_compile FAILED] ${(e.stderr || e.message || '').slice(-500)}`);
      }
    }

    if (pyTestFiles.length > 0) {
      try {
        const { stdout, stderr } = await execFileAsync('python3', ['-m', 'unittest', 'discover', '-v'], {
          cwd: resolvedRoot, env: verifierChildEnv(),
          timeout: 20_000,
        });
        const combined = `${stdout}\n${stderr}`;
        const parsed = parseUnittestOutput(combined);
        testsExecuted += parsed.ran;
        testsPassed += Math.max(0, parsed.ran - parsed.failed);
        ranRealTests = true;
        outputLines.push(`[python3 unittest] Ran ${parsed.ran} tests — OK`);
      } catch (err: unknown) {
        ranRealTests = true;
        exitCode = 1;
        const e = err as { stdout?: string; stderr?: string; message?: string };
        const combined = `${e.stdout || ''}\n${e.stderr || ''}\n${e.message || ''}`;
        const parsed = parseUnittestOutput(combined);
        testsExecuted += parsed.ran;
        testsPassed += Math.max(0, parsed.ran - parsed.failed);
        outputLines.push(`[python3 unittest FAILED]\n${combined.slice(-700)}`);
      }
    }

    if (hasRedTeamPy) {
      const check = validateRedTeamScript(files['red_team_attack.py']);
      if (!check.safe) {
        redTeamPassed = false;
        outputLines.push(`[Red-Team Blocked] ${check.violations.join('; ')}`);
      } else {
        try {
          const { stdout, stderr } = await execFileAsync('python3', ['red_team_attack.py', '-v'], {
            cwd: resolvedRoot, env: verifierChildEnv(),
            timeout: 8000,
          });
          const parsed = parseUnittestOutput(`${stdout}\n${stderr}`);
          testsExecuted += parsed.ran;
          testsPassed += Math.max(0, parsed.ran - parsed.failed);
          outputLines.push(`[Red-Team Adversarial OK] Ran ${parsed.ran} attack vectors`);
        } catch (err: unknown) {
          redTeamPassed = false;
          exitCode = 1;
          const e = err as { stderr?: string; message?: string };
          outputLines.push(`[Red-Team BREACHED] ${(e.stderr || e.message || '').slice(-500)}`);
        }
      }
    }
  } else if (TOOLCHAIN_TESTS[ecosystemKey]) {
    // Toolchain self-tests: run the generated self-check when its compiler or
    // runtime is installed. A missing toolchain is reported as skipped, never
    // as a passed test.
    runtime = 'toolchain-command';
    const commands = TOOLCHAIN_TESTS[ecosystemKey]!;
    let skipped = false;
    for (const step of commands) {
      const executable = resolveToolchainCommand(resolvedRoot, step.cmd);
      try {
        const { stdout } = await execFileAsync(executable, step.args, {
          cwd: resolvedRoot, env: verifierChildEnv(), timeout: 60_000,
        });
        if (step === commands[commands.length - 1]) {
          ranRealTests = true;
          testsExecuted += 1;
          testsPassed += 1;
          outputLines.push(`[toolchain self-test OK] ${step.cmd}: ${stdout.trim().slice(0, 120)}`);
        }
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException & { stderr?: string; message?: string };
        if (e.code === 'ENOENT') {
          skipped = true;
          outputLines.push(`[toolchain skipped] ${step.cmd} غير مثبت على هذا الجهاز.`);
          break;
        }
        ranRealTests = true;
        exitCode = 1;
        outputLines.push(`[toolchain FAILED] ${step.cmd}: ${String(e.stderr || e.message).slice(-300)}`);
        break;
      }
    }
    if (skipped) {
      testsExecuted = 0;
      testsPassed = 0;
    }
  } else {
    // Honest reporting: no runnable test suite means no tests were executed.
    // Static validation above may still set exitCode, but it is not a test count.
    testsExecuted = 0;
    testsPassed = 0;
    outputLines.push('[no-test-suite] لا توجد اختبارات قابلة للتنفيذ؛ لم يُجرَ أي اختبار فعلي.');
  }

  return {
    ranRealTests,
    runtime,
    testsExecuted,
    testsPassed,
    redTeamPassed,
    exitCode,
    outputSnippet: outputLines.join('\n'),
    workspaceDir: resolvedRoot,
  };
}
