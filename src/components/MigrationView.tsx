import { t, type Language } from '../lib/i18n';
import React, { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, FolderPlus, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { LegacyMigrationResult } from '../lib/types';

interface MigrationViewProps {
  language: Language;
  onPromoteMigratedProject?: (payload: {
    title: string;
    prompt: string;
    files: Record<string, string>;
  }) => Promise<void>;
}

const LEGACY_PRESETS: Array<{ label: string; filename: string; code: string }> = [
  {
    label: 'COBOL Payroll',
    filename: 'PAYROLL.cob',
    code: `IDENTIFICATION DIVISION.
PROGRAM-ID. PAYROLL-CALC.
DATA DIVISION.
WORKING-STORAGE SECTION.
01 WS-HOURS       PIC 9(3) VALUE 40.
01 WS-RATE        PIC 9(4)V99 VALUE 55.50.
01 WS-GROSS-PAY   PIC 9(6)V99.
PROCEDURE DIVISION.
    COMPUTE WS-GROSS-PAY = WS-HOURS * WS-RATE.
    DISPLAY "GROSS PAY: " WS-GROSS-PAY.
    STOP RUN.`,
  },
  {
    label: 'Free Pascal Inventory',
    filename: 'INVENTORY.pas',
    code: `program InventoryLedger;
var
  stockCount: integer;
begin
  stockCount := 120;
  writeln('Available stock: ', stockCount);
end.`,
  },
  {
    label: 'Fortran 90 Physics',
    filename: 'MATRIX.f90',
    code: `program matrix_norm
  implicit none
  real :: energy
  energy = 42.5 * 2.0
  print *, "Energy output:", energy
end program matrix_norm`,
  },
  {
    label: 'Python 2 Legacy',
    filename: 'legacy_cli.py',
    code: `print "Starting legacy report processor"
name = raw_input("Account ID: ")
print "Done for", name`,
  },
];

export const MigrationView: React.FC<MigrationViewProps> = ({ onPromoteMigratedProject ,
  language,}) => {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(language, key, vars);

  const [filename, setFilename] = useState(LEGACY_PRESETS[0].filename);
  const [sourceCode, setSourceCode] = useState(LEGACY_PRESETS[0].code);
  const [targetLanguage, setTargetLanguage] = useState('Python 3.12');
  const [result, setResult] = useState<{
    migration: LegacyMigrationResult;
    generatedFiles: Record<string, string>;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const handleMigrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceCode.trim()) {
      setError(tr('mig.needCode'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch('/api/legacy/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, sourceCode, targetLanguage }),
      });
      const data = (await resp.json()) as {
        migration?: LegacyMigrationResult;
        generatedFiles?: Record<string, string>;
        error?: string;
      };
      if (!resp.ok || !data.migration || !data.generatedFiles) {
        setError(data.error || tr('mig.migrateError'));
        return;
      }
      setResult({ migration: data.migration, generatedFiles: data.generatedFiles });
      const firstKey = Object.keys(data.generatedFiles)[0] || '';
      setSelectedFile(firstKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('mig.connectError'));
    } finally {
      setBusy(false);
    }
  };

  const handlePromote = async () => {
    if (!result || !onPromoteMigratedProject || promoting) return;
    setPromoting(true);
    setError(null);
    try {
      await onPromoteMigratedProject({
        title: tr('mig.promoteTitle', { filename, target: targetLanguage }),
        prompt: tr('mig.promotePrompt', { filename, target: targetLanguage }),
        files: {
          [filename.trim() || 'legacy_source.txt']: sourceCode,
          ...result.generatedFiles,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('mig.promoteError'));
    } finally {
      setPromoting(false);
    }
  };

  const ver = result?.migration.verification;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100">{tr('mig.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {tr('mig.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Source Input Panel */}
        <form
          onSubmit={(e) => void handleMigrate(e)}
          className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">{tr('mig.source')}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {LEGACY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setFilename(preset.filename);
                    setSourceCode(preset.code);
                    setError(null);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/60 hover:text-cyan-300 whitespace-nowrap cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="legacy-filename" className="block text-xs text-slate-400 mb-1">
                {tr('mig.filename')}
              </label>
              <input
                id="legacy-filename"
                type="text"
                dir="ltr"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="legacy-target" className="block text-xs text-slate-400 mb-1">
                {tr('mig.target')}
              </label>
              <select
                id="legacy-target"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="Python 3.12">Python 3.12</option>
                <option value="Go 1.22">Go 1.22</option>
                <option value="Rust 1.77">Rust 1.77</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="legacy-source" className="block text-xs text-slate-400 mb-1">
              {tr('st.fileBody')}
            </label>
            <textarea
              id="legacy-source"
              dir="ltr"
              rows={11}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer"
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            <span>{busy ? tr('mig.busy') : tr('mig.run')}</span>
          </button>
        </form>

        {/* Modernized Output Panel */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">{tr('mig.output')}</h2>
            {result && onPromoteMigratedProject && (
              <button
                type="button"
                disabled={promoting}
                onClick={() => void handlePromote()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/60 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{promoting ? tr('mig.promoting') : tr('mig.promote')}</span>
              </button>
            )}
          </div>

          {!result ? (
            <div className="flex h-80 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center">
              <p className="text-sm text-slate-300">{tr('mig.ready')}</p>
              <p className="mt-1 text-xs text-slate-500">
                {tr('mig.hint')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>
                  {tr('mig.detected', { list: result.migration.legacyDetected.map((d) => `${d.path}: ${d.language}`).join(', ') })}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-300">{tr('mig.targetLabel', { target: result.migration.targetLanguage })}</span>
              </div>

              {ver && (
                <div
                  data-testid="migration-verification-card"
                  className={`rounded-lg border p-3 text-xs space-y-2 ${
                    ver.exitCode === 0
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-amber-500/40 bg-amber-500/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-slate-100">
                      {ver.exitCode === 0 ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      ) : (
                        <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
                      )}
                      <span>
                        {tr('mig.osVerify', { runtime: ver.runtime })} —{' '}
                        {ver.exitCode === 0 ? tr('mig.parityPassed') : tr('mig.parityWarning')}
                      </span>
                    </div>
                    <span dir="ltr" className="font-mono text-slate-300 tabular-nums">
                      {ver.testsPassed}/{ver.testsExecuted} passed · exit={ver.exitCode} · redTeam={ver.redTeamPassed ? 'OK' : 'WARN'}
                    </span>
                  </div>
                  {ver.outputSnippet && (
                    <pre
                      dir="ltr"
                      className="max-h-28 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] text-emerald-300/90"
                    >
                      {ver.outputSnippet}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {Object.keys(result.generatedFiles).map((fname) => (
                  <button
                    key={fname}
                    type="button"
                    onClick={() => setSelectedFile(fname)}
                    dir="ltr"
                    className={`rounded-md border px-3 py-1 font-mono text-xs transition-colors whitespace-nowrap cursor-pointer ${
                      selectedFile === fname
                        ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300'
                        : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fname}
                  </button>
                ))}
              </div>

              <pre
                dir="ltr"
                className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200"
              >
                {result.generatedFiles[selectedFile] || ''}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
