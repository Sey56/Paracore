import {
  useMemo,
  useState,
  useRef,
  useLayoutEffect
} from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faSync, faCompressAlt, faExpandAlt, faBullseye, faGlobe, faShieldHeart, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { ScriptCard } from '../ScriptCard/ScriptCard';
import { useScripts } from '../../hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import type { Script } from '@/types/scriptModel';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { NewScriptModal } from '@/features/automation/components/NewScriptModal';
import { FilterPills } from '@/components/common/FilterPills';
import { defaultCategories } from '@/data/categories';
import styles from './ScriptGallery.module.css';

import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useWatchdog } from '@/context/providers/WatchdogProvider';

interface FocusOverlayProps {
  script: Script;
  sourceRect: DOMRect | null;
  onExit: () => void;
  isFromActiveSource: boolean;
  targetElement: HTMLElement | null;
}

const FocusOverlay: React.FC<FocusOverlayProps> = ({ script, sourceRect, onExit, isFromActiveSource, targetElement }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 1. Position & Resize Logic (Must run before animation)
  useLayoutEffect(() => {
    if (!targetElement || !wrapperRef.current) return;

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect();
      if (wrapperRef.current) {
        wrapperRef.current.style.top = `${rect.top}px`;
        wrapperRef.current.style.left = `${rect.left}px`;
        wrapperRef.current.style.width = `${rect.width}px`;
        wrapperRef.current.style.height = `${rect.height}px`;
      }
    };

    // Initial position
    updatePosition();

    // Track resize/layout changes (zero-latency direct DOM)
    const observer = new ResizeObserver(updatePosition);
    observer.observe(targetElement); // Observe parent size changes
    // Also track window resize just in case
    window.addEventListener('resize', updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [targetElement]);

  // 2. Scroll Initialization (Center content)
  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    // Scroll to center (80px is half of ~160px extra height added in CSS)
    overlayRef.current.scrollTop = 80;
  }, []);

  // 3. FLIP Animation
  useLayoutEffect(() => {
    if (!containerRef.current || !sourceRect) return;

    // Use requestAnimationFrame to ensure the styles (like .focusHero) are applied
    // and layout has settled before measuring and animating.
    const animationFrame = requestAnimationFrame(() => {
      if (!containerRef.current || !sourceRect) return;

      // Measure Last (final state)
      const lastRect = containerRef.current.getBoundingClientRect();

      const deltaX = sourceRect.left - lastRect.left;
      const deltaY = sourceRect.top - lastRect.top;
      const deltaW = sourceRect.width / lastRect.width;

      containerRef.current.animate([
        {
          transformOrigin: 'top left',
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${deltaW})`,
          opacity: 0.8
        },
        {
          transformOrigin: 'top left',
          transform: 'none',
          opacity: 1
        }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both'
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [sourceRect]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'fixed',
        zIndex: 1000,
        // Dimensions set by JS
      }}
    >
      <div className={styles.inlineFocusEffects}>
        <div className={styles.animatedBackdrop}></div>
      </div>

      <div
        ref={overlayRef}
        className={styles.focusOverlayContainer}
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto'
        }}
      >
        <div ref={containerRef} className={styles.heroGrid}>
          <ScriptCard
            script={script}
            onSelect={() => { }}
            isFromActiveSource={isFromActiveSource}
            isCompact={false}
            showExitFocus={true}
            onExitFocus={onExit}
          />
        </div>
      </div>
    </div>
  );
};

const parseSearchTerm = (term: string) => {
  const filters: {
    author: string[];
    param: string[];
    desc: string[];
    doctype: string[];
    created: string[];
    modified: string[];
    categories: string[];
    general: string[];
  } = { author: [], param: [], desc: [], doctype: [], created: [], modified: [], categories: [], general: [] };
  const pillFilters: { type: string; value: string }[] = [];
  const parts = term.split(/\s+/).filter(Boolean);

  parts.forEach(part => {
    const lowerPart = part.toLowerCase();
    if (lowerPart.startsWith('author:')) {
      const value = part.substring(7);
      filters.author.push(value.toLowerCase());
      pillFilters.push({ type: 'author', value });
    } else if (lowerPart.startsWith('param:')) {
      const value = part.substring(6);
      filters.param.push(value.toLowerCase());
      pillFilters.push({ type: 'param', value });
    } else if (lowerPart.startsWith('desc:')) {
      const value = part.substring(5);
      filters.desc.push(value.toLowerCase());
      pillFilters.push({ type: 'desc', value });
    } else if (lowerPart.startsWith('doctype:')) {
      const value = part.substring(8);
      filters.doctype.push(value.toLowerCase());
      pillFilters.push({ type: 'doctype', value });
    } else if (lowerPart.startsWith('categories:')) {
      const value = part.substring(11);
      filters.categories.push(value.toLowerCase());
      pillFilters.push({ type: 'categories', value });
    } else if (lowerPart.startsWith('created:')) {
      const value = part.substring(8);
      filters.created.push(value);
      pillFilters.push({ type: 'created', value });
    } else if (lowerPart.startsWith('modified:')) {
      const value = part.substring(9);
      filters.modified.push(value);
      pillFilters.push({ type: 'modified', value });
    } else {
      filters.general.push(lowerPart);
    }
  });
  return { filters, pillFilters };
};

const dateFilterHelper = (dateString: string | undefined, filterValue: string): boolean => {
  if (!dateString) return false;
  const scriptDate = new Date(dateString);
  scriptDate.setHours(0, 0, 0, 0);
  if (isNaN(scriptDate.getTime())) return false;
  let operator = '=';
  let datePart = filterValue;
  if (filterValue.startsWith('>=')) { operator = ' >= '; datePart = filterValue.substring(2); }
  else if (filterValue.startsWith('<=')) { operator = ' <= '; datePart = filterValue.substring(2); }
  else if (filterValue.startsWith('>')) { operator = ' > '; datePart = filterValue.substring(1); }
  else if (filterValue.startsWith('<')) { operator = ' < '; datePart = filterValue.substring(1); }
  const filterDate = new Date(datePart);
  filterDate.setHours(0, 0, 0, 0);
  if (isNaN(filterDate.getTime())) return false;
  switch (operator) {
    case ' >= ': return scriptDate >= filterDate;
    case ' <= ': return scriptDate <= filterDate;
    case ' > ': return scriptDate > filterDate;
    case ' < ': return scriptDate < filterDate;
    case '=': return scriptDate.getTime() === filterDate.getTime();
    default: return false;
  }
};

export const ScriptGallery: React.FC = () => {
  const { ParacoreConnected } = useRevitStatus();
  const isParacoreDisconnected = !ParacoreConnected;
  const { scripts, selectedFolder, loadScriptsForFolder, favoriteScripts: favoriteIds } = useScripts();
  const { isArmingWatchdogs } = useWatchdog();
  const {
    openNewScriptModal,
    closeNewScriptModal,
    isNewScriptModalOpen,
    activeScriptSource,
    isFocusMode,
    setFocusMode,
    setInspectorOpen,
    selectedCategory,
    setActiveInspectorTab
  } = useUI();
  const { setSelectedScript, selectedScript } = useScriptExecution();
  const { isAuthenticated, activeRole } = useAuth();
  const isMobile = useBreakpoint();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [selectedDefaultCategories, setSelectedDefaultCategories] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'scripts' | 'guards'>('all');
  const [isCompactView, setIsCompactView] = useState(false);
  const [scriptToReplace, setScriptToReplace] = useState<Script | null>(null);

  // Scroll Preservation Logic
  const galleryRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  const handleReplaceScript = (script: Script) => {
    setScriptToReplace(script);
    openNewScriptModal();
  };

  const handleCloseModal = (resultScript?: Script) => {
    setScriptToReplace(null);
    closeNewScriptModal();

    if (resultScript && resultScript.id) {
      setSelectedScript(resultScript);
      setActiveInspectorTab('parameters');

      // Use requestAnimationFrame to wait for the gallery to re-render with the new script
      requestAnimationFrame(() => {
        const cardElement = document.getElementById(`script-card-${resultScript.id}`);
        if (cardElement && galleryRef.current?.parentElement) {
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  };

  const handleEnterFocusMode = (rect: DOMRect) => {
    if (galleryRef.current && galleryRef.current.parentElement) {
      savedScrollTop.current = galleryRef.current.parentElement.scrollTop;
    }
    setSourceRect(rect);
    setFocusMode(true);
  };

  const handleExitFocusMode = () => {
    setFocusMode(false);
    setSourceRect(null);
  };

  useLayoutEffect(() => {
    const parent = galleryRef.current?.parentElement;
    if (!parent) return;

    if (isFocusMode) {
      // Lock parent scroll
      const originalOverflow = parent.style.overflow;
      parent.style.overflow = 'hidden';

      return () => {
        parent.style.overflow = originalOverflow;
      };
    } else {
      // Restore scroll position
      parent.scrollTop = savedScrollTop.current;
    }
  }, [isFocusMode]);

  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';

  const handleDefaultCategoryChange = (categoryName: string) => {
    setSelectedDefaultCategories(prev =>
      prev.includes(categoryName) ? prev.filter(c => c !== categoryName) : [...prev, categoryName]
    );
  };

  const getNewScriptButtonTooltip = () => {
    if (!isAuthenticated) return "You must sign in to create scripts";
    if (isParacoreDisconnected) return "Paracore is disconnected. Please connect to create scripts.";
    if (!canCreateScripts) return "You do not have permission to create scripts.";
    return "";
  };

  const isFromActiveSource = (script: Script) => {
    if (!script || !script.absolutePath) return false;
    // Safely check if path exists on the active source
    const sourcePath = (activeScriptSource && 'path' in activeScriptSource) ? activeScriptSource.path : null;
    if (sourcePath) {
      // CASE INSENSITIVE check for Windows paths
      return script.absolutePath.toLowerCase().startsWith(sourcePath.toLowerCase());
    }
    return false;
  };

  const { filters, pillFilters } = useMemo(() => parseSearchTerm(searchTerm), [searchTerm]);

  const { favoriteScripts, otherScripts } = useMemo(() => {
    // HYDRATION: Mark scripts as favorite if their ID is in the favoriteIds list
    const sourceScripts = scripts.map(s => ({
      ...s,
      isFavorite: favoriteIds.includes(s.id)
    }));

    const filteredBySidebarCategory = selectedCategory
      ? sourceScripts.filter(script => (script.metadata?.categories || []).includes(selectedCategory))
      : sourceScripts;
    const filteredByDefaultCategories = selectedDefaultCategories.length > 0
      ? filteredBySidebarCategory.filter(script =>
        selectedDefaultCategories.every(cat => (script.metadata?.categories || []).includes(cat))
      )
      : filteredBySidebarCategory;

    const filteredByType = (() => {
      if (typeFilter === 'all') return filteredByDefaultCategories;

      const checkPath = (s: Script) => (s.absolutePath || s.id || "").toLowerCase();
      const isGuard = (s: Script) => s.metadata?.isWatchdog === true || s.metadata?.is_watchdog === true || checkPath(s).endsWith('.wtool') || checkPath(s).includes('.wtool');

      if (typeFilter === 'scripts') return filteredByDefaultCategories.filter(s => !isGuard(s));
      if (typeFilter === 'guards') return filteredByDefaultCategories.filter(isGuard);

      return filteredByDefaultCategories;
    })();
    let searchedScripts = filteredByType;
    if (searchTerm) {
      const { author, param, desc, doctype, created, modified, general, categories } = filters;
      searchedScripts = filteredByType.filter((script: Script) => {
        const lowercasedName = script.name.toLowerCase();
        const lowercasedDisplayName = (script.metadata?.displayName || '').toLowerCase();
        const lowercasedDescription = (script.metadata?.description || '').toLowerCase();
        const lowercasedAuthor = (script.metadata?.author || 'Unknown').toLowerCase();
        const scriptCategories = (script.metadata?.categories || []).map(cat => cat.toLowerCase());
        const scriptParameters = (script.parameters ?? []).map(p => ({ name: p.name.toLowerCase(), description: (p.description || '').toLowerCase() }));
        const scriptDocumentType = (script.metadata?.documentType || 'any').toLowerCase();

        const matchesAuthor = author.length === 0 || author.every(a => a === 'unknown' ? (!script.metadata?.author || lowercasedAuthor === '') : lowercasedAuthor.includes(a));
        const matchesParam = param.length === 0 || param.every(p => scriptParameters.some(sp => sp.name.includes(p) || sp.description.includes(p)));
        const matchesDesc = desc.length === 0 || desc.every(d => lowercasedDescription.includes(d));
        const matchesDocType = doctype.length === 0 || doctype.every(dt => scriptDocumentType.includes(dt));
        const matchesCreated = created.length === 0 || created.every(c => dateFilterHelper(script.metadata?.dateCreated, c));
        const matchesModified = modified.length === 0 || modified.every(m => dateFilterHelper(script.metadata?.dateModified, m));
        const matchesCategories = categories.length === 0 || categories.every(c => c.split(',').map(cat => cat.trim()).some(sc => scriptCategories.includes(sc)));
        const matchesGeneral = general.length === 0 || general.every(g =>
          lowercasedName.includes(g) ||
          lowercasedDisplayName.includes(g) ||
          lowercasedDescription.includes(g) ||
          scriptCategories.some(cat => cat.includes(g)) ||
          scriptParameters.some(sp => sp.name.includes(g) || sp.description.includes(g))
        );
        return matchesAuthor && matchesParam && matchesDesc && matchesDocType && matchesCreated && matchesModified && matchesCategories && matchesGeneral;
      });
    }

    const sortedScripts = [...searchedScripts];
    sortedScripts.sort((a, b) => {
      const [sortBy, order] = sortOrder.split('-');
      const direction = order === 'asc' ? 1 : -1;
      const dateSortHelper = (dateA: string | undefined, dateB: string | undefined): number => {
        if (!dateA) return 1; if (!dateB) return -1; return new Date(dateA).getTime() - new Date(dateB).getTime();
      };
      if (sortBy === 'name') return a.name.localeCompare(b.name) * direction;
      if (sortBy === 'author') return (a.metadata?.author || '').localeCompare(b.metadata?.author || '') * direction;
      if (sortBy === 'lastRun') return dateSortHelper(a.metadata?.lastRun ?? undefined, b.metadata?.lastRun ?? undefined) * direction;
      if (sortBy === 'created') return dateSortHelper(a.metadata?.dateCreated, b.metadata?.dateCreated) * direction;
      if (sortBy === 'modified') return dateSortHelper(a.metadata?.dateModified, b.metadata?.dateModified) * direction;
      return 0;
    });

    const favoriteScripts = sortedScripts.filter(script => script.isFavorite);
    const otherScripts = sortedScripts.filter(script => !script.isFavorite);
    return { favoriteScripts, otherScripts };
  }, [scripts, searchTerm, sortOrder, selectedCategory, filters, selectedDefaultCategories, typeFilter]);

  const handleScriptSelect = (script: Script) => {
    setSelectedScript(script);
    setActiveInspectorTab('parameters');
    if (isMobile) setInspectorOpen(true);
  };

  const handleRemoveFilter = (type: string, value: string) => {
    const currentSearchParts = searchTerm.split(/\s+/).filter(Boolean);
    const newSearchParts = currentSearchParts.filter(part => {
      const lowerPart = part.toLowerCase();
      const filterPrefix = `${type}:`.toLowerCase();
      if (lowerPart.startsWith(filterPrefix)) {
        const valueFromPart = part.substring(type.length + 1);
        if (valueFromPart.toLowerCase() === value.toLowerCase()) return false;
      }
      return true;
    });
    setSearchTerm(newSearchParts.join(' '));
  };

  // FLIP Animation: Store source card position
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);

  return (
    <div ref={galleryRef} className={`relative min-h-full min-w-0 ${isFocusMode || isArmingWatchdogs ? 'overflow-hidden' : ''}`}>
      {/* --- NORMAL VIEW CONTENT --- */}
      <div className={`p-4 transition-opacity duration-300 ${(isFocusMode || isArmingWatchdogs) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <>
          {/* 1. Main Header & Category Chips (Compact Layout) */}
          <div className="flex flex-col space-y-4 mb-6">
            {/* Category Filter Chips */}
            <div className={`flex flex-wrap gap-1.5 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
              {defaultCategories.map(category => {
                const isActive = selectedDefaultCategories.includes(category.name);
                return (
                  <button
                    key={category.name}
                    onClick={() => handleDefaultCategoryChange(category.name)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all duration-200 border uppercase tracking-wider
                      ${isActive
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400'
                      }`}
                  >
                    <FontAwesomeIcon icon={category.icon} className={isActive ? 'text-white' : `text-[9px] ${category.color}`} />
                    <span>{category.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-start">
              <div className="flex flex-col space-y-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <div className="w-1 h-4 bg-blue-600 dark:bg-blue-500 rounded-full" />
                  <h1 className="text-sm font-black text-slate-700 dark:text-slate-200 tracking-tight uppercase">
                    {activeScriptSource?.type === 'team' ? 'Team Scripts' : (activeScriptSource?.type === 'local' ? 'Local Scripts' : 'All Scripts')}
                  </h1>
                </div>
                {/* Long Path as a subtle Station Location */}
                {selectedFolder && (
                  <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/30 max-w-[500px]">
                    <FontAwesomeIcon icon={faGlobe} className="text-[10px] text-slate-400" />
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate lowercase italic">
                      {selectedFolder}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end space-y-1 shrink-0">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tabular-nums tracking-[0.15em]">
                  {favoriteScripts.length + otherScripts.length} UNITS STATIONED
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const path = activeScriptSource && 'path' in activeScriptSource ? activeScriptSource.path : selectedFolder;
                      if (path) loadScriptsForFolder(path);
                    }}
                    className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                    title="Refresh Registry"
                  >
                    <FontAwesomeIcon icon={faSync} className="text-xs" />
                  </button>
                  {canCreateScripts && (
                    <button
                      onClick={openNewScriptModal}
                      className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline"
                    >
                      + New Script
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {pillFilters.length > 0 && (
            <div className="mb-6">
              <FilterPills filters={pillFilters} onRemoveFilter={handleRemoveFilter} />
            </div>
          )}

          {/* 2. Unified Command Console (Search, Family, Sort, View) */}
          <div className={`flex flex-col xl:flex-row xl:items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 shadow-xl mb-8 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Search Cluster */}
            <div className="flex-1 relative group">
              <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search foundry..."
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-transparent bg-slate-50 dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!isAuthenticated}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Family Segmented Control */}
              <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/50">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'scripts', label: 'Scripts' },
                  { id: 'guards', label: 'Sentinels' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTypeFilter(t.id as any)}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all
                      ${typeFilter === t.id
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Sort Selector */}
              <div className="relative min-w-[160px]">
                <select
                  className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-8 py-2 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 focus:outline-none transition-all cursor-pointer"
                  onChange={(e) => setSortOrder(e.target.value)}
                  value={sortOrder}
                  disabled={!isAuthenticated}
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="author-asc">Author (A-Z)</option>
                  <option value="author-desc">Author (Z-A)</option>
                  <option value="lastRun-desc">Last Run (Newest)</option>
                  <option value="lastRun-asc">Last Run (Oldest)</option>
                  <option value="created-desc">Created (Newest)</option>
                  <option value="created-asc">Created (Oldest)</option>
                  <option value="modified-desc">Modified (Newest)</option>
                  <option value="modified-asc">Modified (Oldest)</option>
                </select>
                <FontAwesomeIcon icon={faExpandAlt} className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 pointer-events-none rotate-45" />
              </div>

              {/* View Toggle */}
              <button
                onClick={() => setIsCompactView(!isCompactView)}
                className={`p-2 px-3 rounded-xl border transition-all flex items-center gap-2
                  ${isCompactView
                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}
                title={isCompactView ? "Expand List" : "Compact View"}
              >
                <FontAwesomeIcon icon={isCompactView ? faExpandAlt : faCompressAlt} className="text-xs" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-col">
            {/* Favorites Section */}
            {favoriteScripts.length > 0 && (
              <div className="mb-8 w-full order-1">
                {/* Foundry Style Divider */}
                <div className="flex items-center gap-4 mb-6 opacity-60">
                  <div className="flex items-center gap-2 shrink-0">
                    <FontAwesomeIcon icon={faShieldHeart} className="text-[10px] text-yellow-500" />
                    <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em]">
                      Pinned Units
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favoriteScripts.map((script) => (
                    <ScriptCard
                      key={script.id}
                      script={script}
                      onSelect={() => handleScriptSelect(script)}
                      isFromActiveSource={isFromActiveSource(script)}
                      isCompact={true}
                      onFocus={handleEnterFocusMode}
                      onReplace={handleReplaceScript}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Divider between sections (only if both exist) */}
            {favoriteScripts.length > 0 && otherScripts.length > 0 && (
              <div className="flex items-center gap-4 mt-2 mb-8 order-2 w-full opacity-60">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-1 h-1 rounded-full bg-slate-400" />
                  <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em]">
                    General Registry
                  </span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
              </div>
            )}

            {/* Other Scripts Section */}
            {otherScripts.length > 0 && (
              <div className="w-full order-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {otherScripts.map((script) => (
                    <ScriptCard
                      key={script.id}
                      script={script}
                      onSelect={() => handleScriptSelect(script)}
                      isFromActiveSource={isFromActiveSource(script)}
                      isCompact={isCompactView}
                      onFocus={handleEnterFocusMode}
                      onReplace={handleReplaceScript}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty States */}
            {favoriteScripts.length === 0 && otherScripts.length === 0 && (
              <div className="text-gray-500 dark:text-gray-400 text-sm italic py-20 text-center order-4 w-full">
                {isAuthenticated ? (searchTerm ? 'No matches.' : 'No scripts found.') : 'Sign in to load scripts.'}
              </div>
            )}
          </div>
        </>
      </div>

      {/* --- FOCUS MODE OVERLAY --- */}
      {isFocusMode && selectedScript && (
        <FocusOverlay
          script={selectedScript}
          sourceRect={sourceRect}
          onExit={handleExitFocusMode}
          isFromActiveSource={isFromActiveSource(selectedScript)}
          targetElement={galleryRef.current?.parentElement || null}
        />
      )}

      {selectedFolder && (
        <NewScriptModal
          isOpen={isNewScriptModalOpen}
          onClose={handleCloseModal}
          selectedFolder={selectedFolder as string}
          scriptToReplace={scriptToReplace}
        />
      )}
    </div>
  );
}
