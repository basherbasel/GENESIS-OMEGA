import React from 'react';
import { Plus } from 'lucide-react';
import { t, type Language, type TranslationKey } from '../lib/i18n';
import type { TopView } from '../lib/types';

interface TopNavProps {
  activeView: TopView;
  onSelectView: (view: TopView) => void;
  onNewProjectClick: () => void;
  language: Language;
  onToggleLanguage: () => void;
}

const NAV_ITEMS: Array<{ id: TopView; key: TranslationKey }> = [
  { id: 'studio', key: 'nav.studio' },
  { id: 'solutions', key: 'nav.solutions' },
  { id: 'watch', key: 'nav.watch' },
  { id: 'vault', key: 'nav.vault' },
  { id: 'dashboard', key: 'nav.dashboard' },
  { id: 'migration', key: 'nav.migration' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onSelectView,
  onNewProjectClick,
  language,
  onToggleLanguage,
}) => {
  return (
    <header className="md:sticky md:top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] flex-wrap md:flex-nowrap items-center justify-between gap-3 md:gap-8 px-4 py-3 sm:px-6">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('studio');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          GENESIS-OMEGA
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label={t(language, 'nav.main')}
          className="order-3 md:order-none w-full md:w-auto flex items-center justify-between md:justify-start gap-2 sm:gap-4 md:gap-6 text-xs sm:text-sm font-medium border-t border-slate-900 pt-2 md:border-0 md:pt-0"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  isActive
                    ? 'text-cyan-400 font-semibold border-b-2 border-cyan-400'
                    : 'text-slate-400 hover:text-slate-100 border-b-2 border-transparent'
                }`}
              >
                {t(language, item.key)}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Language toggle + primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400 whitespace-nowrap cursor-pointer"
          >
            {t(language, 'lang.toggle')}
          </button>
          <button
            type="button"
            onClick={onNewProjectClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t(language, 'action.newProject')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
