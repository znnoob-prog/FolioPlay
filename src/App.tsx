import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/firebaseAuth';
import {
  extractDocIdFromInput,
  fetchGoogleDocContent,
  listGoogleDocs,
  openGoogleDocPicker,
  parseLocalDocument,
  uploadTextAsGoogleDoc,
} from './lib/googleDocs';
import type {
  DocumentAnalysis,
  GameArchetype,
  GameBlueprint,
  GoogleDocSummary,
  LoadedDocument,
} from './types/game';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmDriveUploadModal } from './components/ConfirmDriveUploadModal';
import { DocumentAnalysisPanel } from './components/DocumentAnalysisPanel';
import { GameShellModal } from './components/GameShellModal';

const BACKDROP_URL = '/src/assets/images/forge_studio_backdrop_1795438759457.jpg';

interface MechanicTwist {
  label: string;
  prompt: string;
}

export default function App() {
  // Google Auth & Docs state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [docsList, setDocsList] = useState<GoogleDocSummary[]>([]);
  const [docsSearch, setDocsSearch] = useState('');
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docUrlInput, setDocUrlInput] = useState('');
  const [isFetchingDoc, setIsFetchingDoc] = useState(false);

  // Loaded document + Forge inputs
  const [sourceTab, setSourceTab] = useState<'google' | 'upload'>('google');
  const [loadedDoc, setLoadedDoc] = useState<LoadedDocument | null>(null);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteBody, setPasteBody] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Confirm Drive upload modal state
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  // Document Analysis state
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Forge & Blueprint state
  const [preferredArchetype, setPreferredArchetype] = useState<'AUTO' | GameArchetype>('AUTO');
  const [designDirective, setDesignDirective] = useState('');
  const [isForging, setIsForging] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<GameBlueprint | null>(null);

  // Inspector & Remix state
  const [codexTab, setCodexTab] = useState<'entities' | 'cards' | 'codex'>('entities');
  const [remixPrompt, setRemixPrompt] = useState('');
  const [isRemixing, setIsRemixing] = useState(false);
  const [twists, setTwists] = useState<MechanicTwist[]>([]);
  const [isLoadingTwists, setIsLoadingTwists] = useState(false);

  // Active Game Shell state
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
      },
      (maybeUser) => {
        setUser(maybeUser);
        setAccessToken(getAccessToken());
        if (!maybeUser) {
          setDocsList([]);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  const refreshGoogleDocs = async (tokenOverride?: string, queryOverride?: string) => {
    const token = tokenOverride || accessToken || getAccessToken();
    if (!token) return;
    setIsLoadingDocs(true);
    setAuthError(null);
    try {
      const files = await listGoogleDocs(token, queryOverride ?? docsSearch);
      setDocsList(files);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to list Google Docs.');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setAccessToken(res.accessToken);
      await refreshGoogleDocs(res.accessToken, '');
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setDocsList([]);
  };

  const runDocumentAnalysis = async (doc: LoadedDocument) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/analyze-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          content: doc.content,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Document analysis failed.');
      }
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Unable to analyze document.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadDocById = async (docId: string) => {
    const token = accessToken || getAccessToken();
    if (!token) {
      setAuthError('Sign in with Google first to read a Google Doc.');
      return;
    }
    setIsFetchingDoc(true);
    setAuthError(null);
    setForgeError(null);
    try {
      const doc = await fetchGoogleDocContent(token, docId);
      setLoadedDoc(doc);
      setAnalysis(null);
      runDocumentAnalysis(doc);
      fetchTwistSuggestions(doc);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to read Google Doc.');
    } finally {
      setIsFetchingDoc(false);
    }
  };

  const handleOpenPicker = () => {
    const token = accessToken || getAccessToken();
    if (!token) {
      setAuthError('Sign in with Google first to open Google Picker.');
      return;
    }
    openGoogleDocPicker(
      token,
      (picked) => {
        loadDocById(picked.id);
      },
      (msg) => setAuthError(msg)
    );
  };

  const handleLoadFromUrl = () => {
    const id = extractDocIdFromInput(docUrlInput);
    if (!id) {
      setAuthError('Enter a valid Google Docs URL or document ID.');
      return;
    }
    loadDocById(id);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseLocalDocument(file.name, text);
      setLoadedDoc(parsed);
      setPasteTitle(parsed.title);
      setPasteBody(parsed.content);
      setForgeError(null);
      setAnalysis(null);
      runDocumentAnalysis(parsed);
      fetchTwistSuggestions(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyPastedDoc = () => {
    if (pasteBody.trim().length < 30) {
      setForgeError('Provide at least 30 characters of document content.');
      return;
    }
    const parsed = parseLocalDocument(pasteTitle.trim() || 'Uploaded Draft', pasteBody);
    setLoadedDoc(parsed);
    setForgeError(null);
    setAnalysis(null);
    runDocumentAnalysis(parsed);
    fetchTwistSuggestions(parsed);
  };

  const handleConfirmUploadToDrive = async () => {
    const token = accessToken || getAccessToken();
    if (!token || !loadedDoc) return;
    setIsUploadingToDrive(true);
    try {
      const created = await uploadTextAsGoogleDoc(
        token,
        loadedDoc.title,
        loadedDoc.content
      );
      setLoadedDoc({
        ...loadedDoc,
        id: created.id,
        source: 'google-docs',
      });
      setShowUploadConfirm(false);
      await refreshGoogleDocs(token);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Failed to save document to Google Docs.'
      );
      setShowUploadConfirm(false);
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const fetchTwistSuggestions = async (doc: LoadedDocument) => {
    setIsLoadingTwists(true);
    try {
      const res = await fetch('/api/suggest-twists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          content: doc.content.slice(0, 10000),
          currentArchetype: preferredArchetype,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTwists(Array.isArray(data.twists) ? data.twists : []);
      }
    } catch {
      // Non-blocking twist suggestions
    } finally {
      setIsLoadingTwists(false);
    }
  };

  const handleForgeGame = async () => {
    if (!loadedDoc) {
      setForgeError('Load a Google Doc or upload a document first.');
      return;
    }
    setIsForging(true);
    setForgeError(null);
    try {
      const res = await fetch('/api/forge-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: loadedDoc.title,
          content: loadedDoc.content,
          preferredArchetype,
          designDirective,
          analysis,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate game from document.');
      }
      setBlueprint(data.blueprint);
    } catch (err) {
      setForgeError(err instanceof Error ? err.message : 'Game generation failed.');
    } finally {
      setIsForging(false);
    }
  };

  const handleRemixMechanic = async (promptOverride?: string) => {
    const promptToUse = (promptOverride ?? remixPrompt).trim();
    if (!blueprint || !loadedDoc || !promptToUse) return;
    setIsRemixing(true);
    setForgeError(null);
    try {
      const res = await fetch('/api/remix-mechanic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint,
          documentTitle: loadedDoc.title,
          documentExcerpt: loadedDoc.content.slice(0, 18000),
          remixPrompt: promptToUse,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mutate mechanics.');
      }
      setBlueprint(data.blueprint);
      if (!promptOverride) setRemixPrompt('');
    } catch (err) {
      setForgeError(err instanceof Error ? err.message : 'Mechanic remix failed.');
    } finally {
      setIsRemixing(false);
    }
  };

  const formatArchetypeLabel = (arch: GameArchetype) => {
    switch (arch) {
      case 'ARENA_SURVIVOR':
        return 'Arena Survivor';
      case 'LANE_DEFENSE':
        return 'Lane Defense';
      case 'ORBIT_HARVEST':
        return 'Orbit Harvest';
      case 'TACTICAL_DUEL':
        return 'Tactical Duel';
    }
  };

  return (
    <div className="min-h-screen bg-[#0e1116] text-[#f3efe6]">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="mx-auto flex max-w-[1380px] items-center justify-between gap-8 border-b border-white/10 px-6 py-4">
        <a
          href="#top"
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          FolioPlay
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a
            href="#document-source"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Documents
          </a>
          <a
            href="#mechanics-blueprint"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Mechanics
          </a>
          <a
            href="#document-codex"
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Codex
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          {blueprint ? (
            <button
              type="button"
              onClick={() => setIsPlaying(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#e85d3f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d94f32] transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              Play Game
            </button>
          ) : (
            <button
              type="button"
              onClick={user && accessToken ? handleOpenPicker : handleSignIn}
              disabled={isLoggingIn}
              className="rounded-lg bg-[#f3efe6] px-4 py-2 text-xs font-semibold text-[#0e1116] hover:bg-white transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {user && accessToken ? 'Browse Google Docs' : 'Connect Google Docs'}
            </button>
          )}
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main
        id="top"
        className="mx-auto grid max-w-[1380px] grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-12 items-start"
      >
        {/* Left Column: Document Source & Forge Controls */}
        <section
          id="document-source"
          className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#151922] p-6 space-y-6"
        >
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold text-white text-balance">
              Document Source
            </h1>
            <p className="text-sm text-slate-400">
              Select a Google Doc from your account or upload a text document to synthesize custom mechanics.
            </p>
          </div>

          {/* Source Switcher */}
          <div className="flex items-center gap-1 rounded-lg bg-[#0e1116] p-1">
            <button
              type="button"
              onClick={() => setSourceTab('google')}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                sourceTab === 'google'
                  ? 'bg-[#222836] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Google Docs
            </button>
            <button
              type="button"
              onClick={() => setSourceTab('upload')}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                sourceTab === 'upload'
                  ? 'bg-[#222836] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Upload or Paste Text
            </button>
          </div>

          {authError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              {authError}
            </div>
          )}

          {sourceTab === 'google' ? (
            <div className="space-y-4">
              {!user || !accessToken ? (
                <div className="space-y-3 py-2">
                  <GoogleSignInButton
                    onClick={handleSignIn}
                    disabled={isLoggingIn}
                    label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                  />
                  <p className="text-xs leading-relaxed text-slate-400">
                    Sign in to browse your Google Docs, open Google Picker, or load any document by link.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 text-xs">
                    <span className="text-slate-300 truncate">
                      Signed in as <strong className="text-white">{user.email}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="text-slate-400 hover:text-white underline whitespace-nowrap shrink-0"
                    >
                      Sign out
                    </button>
                  </div>

                  {/* URL / ID quick loader */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={docUrlInput}
                        onChange={(e) => setDocUrlInput(e.target.value)}
                        placeholder="Paste Google Doc URL or ID..."
                        className="w-full rounded-lg border border-white/10 bg-[#0e1116] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-[#e85d3f] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleLoadFromUrl}
                      disabled={isFetchingDoc}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      Load
                    </button>
                  </div>

                  {/* Search & Picker */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={docsSearch}
                        onChange={(e) => setDocsSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') refreshGoogleDocs();
                        }}
                        placeholder="Search your Google Docs..."
                        className="w-full rounded-lg border border-white/10 bg-[#0e1116] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-[#e85d3f] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshGoogleDocs()}
                      disabled={isLoadingDocs}
                      aria-label="Refresh Google Docs list"
                      className="rounded-lg border border-white/15 bg-white/[0.05] p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenPicker}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Picker
                    </button>
                  </div>

                  {/* Real Google Docs List */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-white/10 rounded-lg border border-white/10 bg-[#0e1116]">
                    {isLoadingDocs ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading your Google Docs...
                      </div>
                    ) : docsList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No Google Docs found. Try refreshing or using Google Picker.
                      </div>
                    ) : (
                      docsList.map((doc) => {
                        const selected = loadedDoc?.id === doc.id;
                        return (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => loadDocById(doc.id)}
                            disabled={isFetchingDoc}
                            className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                              selected ? 'bg-[#e85d3f]/15' : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate text-xs font-medium text-white">
                                {doc.name}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                              {doc.modifiedTime
                                ? new Date(doc.modifiedTime).toLocaleDateString()
                                : 'Doc'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-[#0e1116] px-4 py-4 text-xs font-medium text-slate-300 hover:border-white/40 hover:text-white transition-colors"
              >
                <Upload className="h-4 w-4" />
                Upload .txt or .md document
              </button>

              <input
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="Document title..."
                className="w-full rounded-lg border border-white/10 bg-[#0e1116] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[#e85d3f] focus:outline-none"
              />
              <textarea
                rows={5}
                value={pasteBody}
                onChange={(e) => setPasteBody(e.target.value)}
                placeholder="Or paste your lore, design doc, rules, essay, or specification here..."
                className="w-full rounded-lg border border-white/10 bg-[#0e1116] p-3 text-xs leading-relaxed text-white placeholder:text-slate-500 focus:border-[#e85d3f] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleApplyPastedDoc}
                className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-medium text-white hover:bg-white/10"
              >
                Use This Document
              </button>
            </div>
          )}

          {/* Loaded Document Summary */}
          {loadedDoc && (
            <div className="border-t border-white/10 pt-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {loadedDoc.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span>
                      {loadedDoc.source === 'google-docs' ? 'Google Docs' : 'Uploaded File'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{loadedDoc.wordCount.toLocaleString()} words</span>
                    <span aria-hidden="true">·</span>
                    <span>{loadedDoc.sections.length} sections</span>
                  </div>
                </div>
                {loadedDoc.source === 'uploaded-file' && user && accessToken && (
                  <button
                    type="button"
                    onClick={() => setShowUploadConfirm(true)}
                    className="rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                  >
                    Save to Google Docs
                  </button>
                )}
              </div>

              {loadedDoc.sections.length > 0 && (
                <p className="text-xs leading-relaxed text-slate-400 line-clamp-3">
                  {loadedDoc.sections[0].excerpt}
                </p>
              )}
            </div>
          )}

          {/* Forge Controls */}
          <div className="border-t border-white/10 pt-5 space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Gameplay Engine
              </label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(
                  [
                    ['AUTO', 'Auto (AI Choice)'],
                    ['ARENA_SURVIVOR', 'Arena Survivor'],
                    ['LANE_DEFENSE', 'Lane Defense'],
                    ['ORBIT_HARVEST', 'Orbit Harvest'],
                    ['TACTICAL_DUEL', 'Tactical Duel'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPreferredArchetype(val)}
                    className={`rounded-md px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap truncate ${
                      preferredArchetype === val
                        ? 'bg-[#f3efe6] text-[#0e1116]'
                        : 'bg-[#0e1116] text-slate-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="design-directive"
                className="block text-xs font-medium text-slate-300"
              >
                Mechanic Focus (Optional)
              </label>
              <input
                id="design-directive"
                type="text"
                value={designDirective}
                onChange={(e) => setDesignDirective(e.target.value)}
                placeholder="e.g., Focus on chain-reaction tradeoffs or negotiation..."
                className="w-full rounded-lg border border-white/10 bg-[#0e1116] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[#e85d3f] focus:outline-none"
              />
            </div>

            {forgeError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                {forgeError}
              </div>
            )}

            <button
              type="button"
              onClick={handleForgeGame}
              disabled={!loadedDoc || isForging || isFetchingDoc}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#e85d3f] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d94f32] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
            >
              {isForging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Designing Custom Mechanics...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generate Game
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right Column: Document Analysis, Generated Game & Custom Mechanics Inspector */}
        <section
          id="mechanics-blueprint"
          className="lg:col-span-7 space-y-6"
        >
          {loadedDoc && (
            <DocumentAnalysisPanel
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              onReanalyze={() => runDocumentAnalysis(loadedDoc)}
              onUseSeed={(seedText, arch) => {
                setDesignDirective(seedText);
                if (arch) setPreferredArchetype(arch);
              }}
            />
          )}

          {!blueprint ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#151922]">
              <div className="relative h-72 w-full">
                <img
                  src={BACKDROP_URL}
                  alt="FolioPlay game blueprint drafting table"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#151922] via-[#151922]/55 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 space-y-2">
                  <h2 className="font-display text-3xl font-bold text-white text-balance">
                    Turn any Google Doc into a playable game
                  </h2>
                  <p className="max-w-xl text-sm leading-relaxed text-slate-300">
                    FolioPlay analyzes your document's themes, entities, and tradeoffs to invent custom game mechanics, active abilities, world mutators, and playable rulesets.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
                <div className="p-6 space-y-1.5">
                  <div className="font-mono text-xs text-slate-400">01</div>
                  <h3 className="font-display text-base font-semibold text-white">
                    Load a Google Doc
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Connect Google Docs to browse your files or upload a draft directly.
                  </p>
                </div>
                <div className="p-6 space-y-1.5">
                  <div className="font-mono text-xs text-slate-400">02</div>
                  <h3 className="font-display text-base font-semibold text-white">
                    Synthesize Mechanics
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Deep reasoning translates document concepts into custom resources, mutators, and enemy behaviors.
                  </p>
                </div>
                <div className="p-6 space-y-1.5">
                  <div className="font-mono text-xs text-slate-400">03</div>
                  <h3 className="font-display text-base font-semibold text-white">
                    Play & Mutate Live
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Launch the 60fps canvas or tactical card duel, then remix rules on the fly.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Blueprint Hero Header */}
              <div className="rounded-2xl border border-white/10 bg-[#151922] p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{formatArchetypeLabel(blueprint.archetype)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{blueprint.theme.mood}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{blueprint.winCondition.label}</span>
                    </div>
                    <h2 className="font-display text-3xl font-bold text-white text-balance">
                      {blueprint.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-slate-300">
                      {blueprint.subtitle}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPlaying(true)}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-slate-950 transition-transform duration-150 hover:scale-[1.02] whitespace-nowrap shrink-0"
                    style={{ backgroundColor: blueprint.theme.accentHex || '#e85d3f' }}
                  >
                    <Play className="h-4 w-4" />
                    Play Game
                  </button>
                </div>

                {/* Core Rule + Reasoning */}
                <div className="border-t border-white/10 pt-5 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-lg font-semibold text-white">
                      Core Mechanic: {blueprint.coreRule.name}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200">
                    {blueprint.coreRule.summary}
                  </p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    From document: "{blueprint.coreRule.docSourceSnippet}"
                  </p>
                </div>

                {/* Asymmetric Resources & Special Ability */}
                <div className="grid grid-cols-1 gap-6 border-t border-white/10 pt-5 md:grid-cols-3">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-400">Primary Resource</div>
                    <div
                      className="font-display text-base font-semibold"
                      style={{ color: blueprint.resources.primary.color }}
                    >
                      {blueprint.resources.primary.name}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {blueprint.resources.primary.gainAction}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-400">Secondary Resource</div>
                    <div
                      className="font-display text-base font-semibold"
                      style={{ color: blueprint.resources.secondary.color }}
                    >
                      {blueprint.resources.secondary.name}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {blueprint.resources.secondary.spendOrDrainRule}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-400">Signature Ability [E]</div>
                    <div className="font-display text-base font-semibold text-white">
                      {blueprint.specialAbility.name}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {blueprint.specialAbility.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Passive World Mutators */}
              <div className="rounded-2xl border border-white/10 bg-[#151922] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-white">
                    Custom World Mutators
                  </h3>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {blueprint.mutators.length} active rules
                  </span>
                </div>

                <div className="divide-y divide-white/10">
                  {blueprint.mutators.map((mut, i) => (
                    <div key={i} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-white">{mut.name}</span>
                        <span className="font-mono text-xs text-slate-400 tabular-nums">
                          {mut.type} · every {mut.intervalSec}s
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-300">{mut.description}</p>
                      <p className="text-xs text-slate-400">
                        Document link: {mut.docConnection}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Entities, Cards & Document Codex */}
              <div
                id="document-codex"
                className="rounded-2xl border border-white/10 bg-[#151922] p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="font-display text-lg font-semibold text-white">
                    Entities & Document Codex
                  </h3>
                  <div className="flex items-center gap-1 rounded-lg bg-[#0e1116] p-1">
                    {(
                      [
                        ['entities', 'Threats & Nodes'],
                        ['cards', 'Tactical Deck'],
                        ['codex', 'Lore Codex'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCodexTab(id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          codexTab === id
                            ? 'bg-[#222836] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {codexTab === 'entities' && (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-slate-400">Threats</div>
                      <div className="divide-y divide-white/10">
                        {blueprint.enemies.map((en, idx) => (
                          <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-sm font-semibold"
                                style={{ color: en.color }}
                              >
                                {en.name}
                              </span>
                              <span className="font-mono text-xs text-slate-400 tabular-nums">
                                {en.behavior} · HP {en.hp}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300">{en.docConcept}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-medium text-slate-400">Collectibles</div>
                      <div className="divide-y divide-white/10">
                        {blueprint.collectibles.map((col, idx) => (
                          <div key={idx} className="py-2.5 first:pt-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-sm font-semibold"
                                style={{ color: col.color }}
                              >
                                {col.name}
                              </span>
                              <span className="font-mono text-xs text-slate-400 tabular-nums">
                                +{col.points} pts · +{col.secondaryGain}{' '}
                                {blueprint.resources.secondary.name}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300">{col.docReference}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {codexTab === 'cards' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {blueprint.tacticalCards.map((card) => (
                      <div
                        key={card.id}
                        className="rounded-xl border border-white/10 bg-[#0e1116] p-4 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{card.name}</span>
                          <span className="font-mono text-xs text-amber-300 tabular-nums">
                            {card.cost}E · {card.effectType} {card.power}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{card.description}</p>
                        <p className="text-[11px] text-slate-400">"{card.docQuote}"</p>
                      </div>
                    ))}
                  </div>
                )}

                {codexTab === 'codex' && (
                  <div className="space-y-4">
                    <p className="text-xs leading-relaxed text-slate-300">
                      {blueprint.designReasoning}
                    </p>
                    <div className="divide-y divide-white/10">
                      {blueprint.glossary.map((entry, idx) => (
                        <div key={idx} className="py-2.5 first:pt-0 space-y-0.5">
                          <div className="text-xs font-semibold text-white">
                            {entry.gameElement}{' '}
                            <span className="font-normal text-slate-400">
                              ← {entry.docTerm}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300">{entry.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Live Mechanic Remix */}
              <div className="rounded-2xl border border-white/10 bg-[#151922] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-white">
                    Mutate & Remix Mechanics
                  </h3>
                  {isLoadingTwists && (
                    <span className="text-xs text-slate-400">Finding ideas...</span>
                  )}
                </div>

                {twists.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {twists.map((twist, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isRemixing}
                        onClick={() => handleRemixMechanic(twist.prompt)}
                        title={twist.prompt}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0e1116] px-3 py-2 text-xs font-medium text-slate-200 hover:border-white/30 hover:text-white disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#e85d3f]" />
                        {twist.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={remixPrompt}
                    onChange={(e) => setRemixPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRemixMechanic();
                    }}
                    placeholder="Describe a custom mechanic change (e.g., Add volatile decay to collectibles)..."
                    className="flex-1 rounded-lg border border-white/10 bg-[#0e1116] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-[#e85d3f] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemixMechanic()}
                    disabled={isRemixing || !remixPrompt.trim()}
                    className="rounded-lg bg-[#f3efe6] px-4 py-2.5 text-xs font-semibold text-[#0e1116] hover:bg-white disabled:opacity-45 whitespace-nowrap shrink-0"
                  >
                    {isRemixing ? 'Remixing...' : 'Mutate Mechanics'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Explicit Confirmation Dialog for Drive Upload */}
      {showUploadConfirm && loadedDoc && (
        <ConfirmDriveUploadModal
          docTitle={loadedDoc.title}
          wordCount={loadedDoc.wordCount}
          isUploading={isUploadingToDrive}
          onConfirm={handleConfirmUploadToDrive}
          onCancel={() => setShowUploadConfirm(false)}
        />
      )}

      {/* Full-Viewport Game Shell */}
      {isPlaying && blueprint && (
        <GameShellModal
          blueprint={blueprint}
          onExitStudio={() => setIsPlaying(false)}
        />
      )}
    </div>
  );
}
