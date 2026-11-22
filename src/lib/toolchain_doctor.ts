import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SOLUTION_DOMAINS } from './solution_catalog';
import type { EcosystemKey } from './types';

export interface ToolStatus {
  command: string;
  available: boolean;
  version: string | null;
  installHint: string;
}

/**
 * Fresh PATH for doctor runs: winget installers update the registry, but a
 * long-lived terminal keeps the old value. Read both scopes via PowerShell on
 * Windows, then append a few known local bin directories.
 */
export function refreshToolchainPath(): void {
  if (process.platform === 'win32') {
    try {
      const script =
        "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + " +
        "[Environment]::GetEnvironmentVariable('Path','User')";
      const out = spawnSync('powershell', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      const fresh = (out.stdout || '').trim();
      if (fresh) process.env.PATH = `${fresh};${process.env.PATH || ''}`;
    } catch {
      // Keep the inherited PATH when PowerShell is unavailable.
    }
  }

  const known = [
    path.join(os.homedir(), '.cargo', 'bin'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Lua', 'bin'),
    'C:\\Ruby33-x64\\bin',
  ];
  const parts = new Set((process.env.PATH || '').split(path.delimiter).filter(Boolean));
  for (const dir of known) {
    if (fs.existsSync(dir)) parts.add(dir);
  }
  process.env.PATH = Array.from(parts).join(path.delimiter);
}

const VERSION_ARGS: Record<string, string[]> = {
  go: ['version'],
  lua: ['-v'],
  javac: ['-version'],
  fpc: ['-iV'],
};

const TOOL_HINTS: Record<string, string> = {
  sh: 'winget install --id Git.Git (ships POSIX sh)',
  python3: 'winget install --id Python.Python.3.12',
  node: 'winget install --id OpenJS.NodeJS.LTS',
  go: 'winget install --id GoLang.Go',
  javac: 'winget install --id Microsoft.OpenJDK.21',
  dotnet: 'winget install --id Microsoft.DotNet.SDK.8',
  pwsh: 'winget install --id Microsoft.PowerShell',
  cargo: 'winget install --id Rustlang.Rustup',
  ruby: 'winget install --id RubyInstallerTeam.RubyWithDevKit.3.3',
  lua: 'winget install --id DEVCOM.Lua',
  php: 'winget install --id PHP.PHP.8.3',
  gcc: 'winget install --id BrechtSanders.WinLibs.MCF.UCRT',
  g__: 'winget install --id BrechtSanders.WinLibs.MCF.UCRT',
  gfortran: 'winget install --id BrechtSanders.WinLibs.MCF.UCRT',
  fpc: 'winget install --id FreePascal.FreePascalCompiler',
  cobc: 'winget install --id MSYS2.MSYS2 then pacman -S mingw-w64-x86_64-gnucobol',
  dart: 'winget install --id Google.DartSDK',
};

/** Command that actually verifies each ecosystem's generated project. */
export const ECOSYSTEM_TOOL: Partial<Record<EcosystemKey, string>> = {
  python: 'python3',
  bash: 'sh',
  nodejs: 'node',
  typescript: 'node',
  go: 'go',
  java: 'javac',
  csharp: 'dotnet',
  powershell: 'pwsh',
  rust: 'cargo',
  ruby: 'ruby',
  lua: 'lua',
  php: 'php',
  c: 'gcc',
  cpp: 'g++',
  fortran: 'gfortran',
  pascal: 'fpc',
  cobol: 'cobc',
  flutter: 'dart',
};

function probe(command: string): ToolStatus {
  let out: SpawnSyncReturns<string>;
  try {
    // POSIX sh has no --version flag; prove it can run a command instead.
    out = command === 'sh'
      ? spawnSync('sh', ['-c', 'echo genesis-ok'], { encoding: 'utf8', timeout: 15_000 })
      : spawnSync(command, VERSION_ARGS[command] || ['--version'], {
          encoding: 'utf8',
          timeout: 15_000,
        });
  } catch {
    return { command, available: false, version: null, installHint: TOOL_HINTS[command] || 'install from vendor' };
  }
  const text = `${out.stdout || ''}\n${out.stderr || ''}`.trim().split('\n')[0] || '';
  const available =
    command === 'sh'
      ? out.status === 0 && `${out.stdout || ''}`.includes('genesis-ok')
      : out.status === 0 || (out.status === null && text.length > 0);
  return {
    command,
    available,
    version: available ? text.slice(0, 90) : null,
    installHint: TOOL_HINTS[command] || 'install from vendor',
  };
}

export interface ToolchainReport {
  tools: ToolStatus[];
  readyEcosystems: number;
  totalEcosystems: number;
  readyDomains: number;
  totalDomains: number;
}

export function checkToolchains(): ToolchainReport {
  refreshToolchainPath();
  const commands = Array.from(new Set(Object.values(ECOSYSTEM_TOOL).filter(Boolean) as string[]));
  const tools = commands.map(probe);
  const available = new Set(tools.filter((t) => t.available).map((t) => t.command));
  const ecosystems = Object.keys(ECOSYSTEM_TOOL) as EcosystemKey[];
  const readyEcosystems = ecosystems.filter((e) => available.has(ECOSYSTEM_TOOL[e]!)).length;
  const readyDomains = SOLUTION_DOMAINS.filter((d) => available.has(ECOSYSTEM_TOOL[d.ecosystem] || '')).length;
  return {
    tools,
    readyEcosystems,
    totalEcosystems: ecosystems.length,
    readyDomains,
    totalDomains: SOLUTION_DOMAINS.length,
  };
}
