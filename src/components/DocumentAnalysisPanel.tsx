import { useState } from 'react';
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import type { DocumentAnalysis, GameArchetype } from '../types/game';

interface DocumentAnalysisPanelProps {
  analysis: DocumentAnalysis | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  onReanalyze: () => void;
  onUseSeed: (seedText: string, archetype?: GameArchetype) => void;
}

export function DocumentAnalysisPanel({
  analysis,
  isAnalyzing,
  analysisError,
  onReanalyze,
  onUseSeed,
}: DocumentAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<'entities' | 'narrative' | 'seeds' | 'json'>(
    'entities'
  );
  const [copied, setCopied] = useState(false);

  const handleCopyJson = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  if (isAnalyzing) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#151922] p-6">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-[#e85d3f]" />
          <span>
            Analyzing document entities, themes, and plot elements...
          </span>
        </div>
      </div>
    );
  }

  if (analysisError) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 flex items-center justify-between gap-4">
        <p className="text-xs text-rose-200">{analysisError}</p>
        <button
          type="button"
          onClick={onReanalyze}
          className="rounded-lg border border-rose-300/30 bg-black/25 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/40 whitespace-nowrap shrink-0"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#151922] p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Document Analysis</span>
            <span aria-hidden="true">·</span>
            <span>{analysis.genreOrDomain}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {analysis.characters.length} actors · {analysis.locations.length} locations ·{' '}
              {analysis.objects.length} objects
            </span>
          </div>
          <h3 className="font-display text-xl font-bold text-white">
            {analysis.documentTitle}
          </h3>
          <p className="text-xs leading-relaxed text-slate-300">{analysis.summary}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReanalyze}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-analyze
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#0e1116] p-1">
        {(
          [
            ['entities', 'Entities'],
            ['narrative', 'Themes & Plot'],
            ['seeds', 'Mechanic Seeds'],
            ['json', 'Structured JSON'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'bg-[#222836] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entities Tab */}
      {activeTab === 'entities' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Characters */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300">
              Characters & Actors
            </div>
            <div className="divide-y divide-white/10">
              {analysis.characters.map((ch, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{ch.name}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {ch.role.replace('_', ' ')}
                    </span>
                  </div>
                  {ch.traits.length > 0 && (
                    <div className="text-[11px] text-slate-400">
                      {ch.traits.join(' · ')}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-slate-300">
                    {ch.mechanicPotential}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Locations */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300">Locations</div>
            <div className="divide-y divide-white/10">
              {analysis.locations.map((loc, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                  <div className="text-sm font-semibold text-white">{loc.name}</div>
                  <div className="text-[11px] text-slate-400">{loc.atmosphere}</div>
                  {loc.hazardsOrFeatures.length > 0 && (
                    <div className="text-[11px] text-amber-200/80">
                      {loc.hazardsOrFeatures.join(' · ')}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-slate-300">
                    {loc.arenaSuitability}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Objects */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300">Objects & Artifacts</div>
            <div className="divide-y divide-white/10">
              {analysis.objects.map((obj, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{obj.name}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {obj.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{obj.significance}</p>
                  <p className="text-xs leading-relaxed text-slate-300">
                    {obj.gameplayUse}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Themes & Plot Tab */}
      {activeTab === 'narrative' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300">Extracted Themes</div>
            <div className="divide-y divide-white/10">
              {analysis.themes.map((th, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                  <div className="text-sm font-semibold text-white">{th.name}</div>
                  <p className="text-xs text-slate-300">{th.tension}</p>
                  <p className="text-xs text-amber-200/90">
                    Mechanic seed: {th.mechanicSeed}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-300">
              Plot & Causal Elements
            </div>
            <div className="divide-y divide-white/10">
              {analysis.plotElements.map((pl, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                      {String(pl.sequence).padStart(2, '0')}. {pl.stage.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-white">{pl.event}</p>
                  <p className="text-xs text-slate-400">Trigger: {pl.causalTrigger}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mechanic Seeds Tab */}
      {activeTab === 'seeds' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Recommended engine: <strong className="text-white">{analysis.recommendedArchetype.replace('_', ' ')}</strong>
            </span>
            <button
              type="button"
              onClick={() =>
                onUseSeed(
                  `Apply ${analysis.recommendedArchetype} using extracted entities and themes.`,
                  analysis.recommendedArchetype
                )
              }
              className="text-xs font-medium text-[#e85d3f] hover:underline whitespace-nowrap"
            >
              Use Recommended Engine
            </button>
          </div>
          <div className="divide-y divide-white/10">
            {analysis.mechanicSeeds.map((seed, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{seed.title}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      from {seed.sourceType}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300">{seed.ruleIdea}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUseSeed(`${seed.title}: ${seed.ruleIdea}`)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                >
                  Apply Focus
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structured JSON Tab */}
      {activeTab === 'json' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Structured representation passed to the game mechanic generator
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-[#0e1116] p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {JSON.stringify(analysis, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
