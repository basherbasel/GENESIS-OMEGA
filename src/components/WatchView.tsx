import React, { useState } from 'react';
import { FolderSearch, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import type { WatchFolder } from '../lib/types';

interface WatchViewProps {
  watches: WatchFolder[];
  onAddWatch: (payload: { folderPath: string; goal: string; intervalSec: number }) => Promise<void>;
  onToggleWatch: (id: number) => Promise<void>;
  onScanAll: (watchId?: number) => Promise<void>;
  onDeleteWatch: (id: number) => Promise<void>;
}

export const WatchView: React.FC<WatchViewProps> = ({
  watches,
  onAddWatch,
  onToggleWatch,
  onScanAll,
  onDeleteWatch,
}) => {
  const [folderPath, setFolderPath] = useState('');
  const [goal, setGoal] = useState('');
  const [intervalSec, setIntervalSec] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim() || !goal.trim()) {
      setError('يرجى إدخال مسار المجلد وهدف المراقبة.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onAddWatch({
        folderPath: folderPath.trim(),
        goal: goal.trim(),
        intervalSec,
      });
      setFolderPath('');
      setGoal('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة المجلد للمراقبة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">مراقبة المجلدات والتدقيق التلقائي</h1>
          <p className="mt-1 text-sm text-slate-400">
            رصد مستمر للتغييرات البرمجية في مسارات العمل وإعادة حساب SBOM والأمان تلقائياً.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onScanAll()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>فحص جميع المجلدات الآن</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Add Watch Folder Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="lg:col-span-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 h-fit"
        >
          <h2 className="text-sm font-semibold text-slate-100">إضافة مسار مراقبة جديد</h2>

          <div>
            <label htmlFor="watch-folder-path" className="block text-xs font-medium text-slate-300 mb-1.5">
              مسار المجلد المحلي
            </label>
            <input
              id="watch-folder-path"
              type="text"
              dir="ltr"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="data/watched_demo/billing_service"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="watch-folder-goal" className="block text-xs font-medium text-slate-300 mb-1.5">
              هدف التدقيق التلقائي
            </label>
            <input
              id="watch-folder-goal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="مثال: فحص الأسرار وتوليد SBOM عند كل تعديل"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="watch-interval" className="block text-xs font-medium text-slate-300 mb-1.5">
              فترة الفحص (ثانية)
            </label>
            <input
              id="watch-interval"
              type="number"
              min={10}
              max={3600}
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value) || 30)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-white disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'جاري الإضافة...' : 'تفعيل المراقبة'}
          </button>
        </form>

        {/* Active Watch Folders List */}
        <div className="lg:col-span-8 space-y-3">
          {watches.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center">
              <FolderSearch className="mx-auto h-8 w-8 text-slate-500 mb-2" aria-hidden="true" />
              <p className="text-sm text-slate-300">لا توجد مجلدات مراقبة مضافة بعد.</p>
              <p className="mt-1 text-xs text-slate-500">أضف مسار مشروع من النموذج المجاور لبدء التدقيق المستمر.</p>
            </div>
          ) : (
            watches.map((w) => (
              <div
                key={w.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="font-mono text-sm font-semibold text-slate-100 truncate">
                      {w.folderPath}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className={`text-xs font-medium ${w.enabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {w.enabled ? 'نشط' : 'متوقف مؤقتاً'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{w.goal}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                    <span>{w.filesCount} ملف مرصود</span>
                    <span aria-hidden="true">·</span>
                    <span>كل {w.intervalSec} ثانية</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      آخر فحص: {w.lastCheckedAt ? new Date(w.lastCheckedAt).toLocaleTimeString('ar-EG') : 'لم يبدأ'}
                    </span>
                    {w.lastTriggeredProjectId && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-cyan-400">تدقيق مرتبط #{w.lastTriggeredProjectId}</span>
                      </>
                    )}
                    {w.changedFiles && w.changedFiles.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300" dir="ltr">
                          تغييرات: {w.changedFiles.slice(0, 3).join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onToggleWatch(w.id)}
                    aria-label={w.enabled ? `إيقاف مراقبة ${w.folderPath}` : `تفعيل مراقبة ${w.folderPath}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-600 whitespace-nowrap cursor-pointer"
                  >
                    {w.enabled ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span>{w.enabled ? 'إيقاف' : 'تشغيل'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void onScanAll(w.id)}
                    aria-label={`فحص فوري للمسار ${w.folderPath}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-cyan-300 hover:border-cyan-500/50 whitespace-nowrap cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>فحص</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void onDeleteWatch(w.id)}
                    aria-label={`حذف مراقبة ${w.folderPath}`}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
