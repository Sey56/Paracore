import {
  useMemo,
  useState
} from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faSync, faCompressAlt, faExpandAlt } from '@fortawesome/free-solid-svg-icons';
import { ScriptCard } from '../ScriptCard/ScriptCard';
import { useScripts } from '@/hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { NewScriptModal } from '@/components/common/NewScriptModal';
import { FilterPills } from '@/components/common/FilterPills';
import { defaultCategories } from '@/data/categories';
import styles from './ScriptGallery.module.css';

import { useAuth } from '@/hooks/useAuth';

const getFolderNameFromPath = (path: string | null): string => {
  if (!path) return "";
  const parts = path.split(/[\\/]/); // Split by both forward and backward slashes
  return parts.filter(Boolean).pop() || path; // Filter out empty strings and get the last part, or return original path if no parts
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
  } = {
    author: [],
    param: [],
    desc: [],
    doctype: [],
    created: [],
    modified: [],
    categories: [],
    general: [],
  };

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
  // Set to start of the day to compare dates only, unless a specific time is part of the filter
  scriptDate.setHours(0, 0, 0, 0);

  if (isNaN(scriptDate.getTime())) return false;

  let operator = '=';
  let datePart = filterValue;

  if (filterValue.startsWith('>=')) {
    operator = ' >= ';
    datePart = filterValue.substring(2);
  } else if (filterValue.startsWith('<=')) {
    operator = ' <= ';
    datePart = filterValue.substring(2);
  } else if (filterValue.startsWith('>')) {
    operator = ' > ';
    datePart = filterValue.substring(1);
  } else if (filterValue.startsWith('<')) {
    operator = ' < ';
    datePart = filterValue.substring(1);
  }

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

import { useRevitStatus } from '@/hooks/useRevitStatus';

export const ScriptGallery: React.FC = () => {
  const { revitStatus, ParacoreConnected } = useRevitStatus();
  const isParacoreDisconnected = !ParacoreConnected;
  const { scripts, selectedFolder, teamWorkspaces, loadScriptsForFolder, reloadScript } = useScripts();
  const { selectedCategory, customCategories, setInspectorOpen, openNewScriptModal, closeNewScriptModal, isNewScriptModalOpen, activeScriptSource } = useUI();
  const { setSelectedScript, selectedScript } = useScriptExecution();
  const { isAuthenticated, activeRole, activeTeam, user } = useAuth();
  const isMobile = useBreakpoint();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [selectedDefaultCategories, setSelectedDefaultCategories] = useState<string[]>([]);
  const [isCompactView, setIsCompactView] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'single-file' | 'multi-file'>('all');

  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';

  const handleDefaultCategoryChange = (categoryName: string) => {
    setSelectedDefaultCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const getNewScriptButtonTooltip = () => {
    if (!isAuthenticated) return "You must sign in to create scripts";
    if (isParacoreDisconnected) return "Paracore is disconnected. Please connect to create scripts.";
    if (!canCreateScripts) return "You do not have permission to create scripts.";
    return "";
  };

  const categoryMap = useMemo(() => {
    const source = scripts;
    const map: Record<string, Script[]> = {};
    source.forEach((script: Script) => {
      (script.metadata?.categories || []).forEach((category: string) => {
        if (!map[category]) {
          map[category] = [];
        }
        map[category].push(script);
      });
    });
    return map;
  }, [scripts]);

  const allCategories = useMemo(() => {
    const defaultCategories = ["Architectural", "Structural", "MEP"];
    const categories = new Set(Object.keys(categoryMap));
    customCategories.forEach(category => categories.add(category));
    return Array.from(categories).filter(category => !defaultCategories.includes(category));
  }, [categoryMap, customCategories]);

  const isFromActiveWorkspace = (script: Script) => {
    if (!script || !script.absolutePath) {
      return false;
    }
    if (activeScriptSource?.type === 'workspace' && activeScriptSource.path) {
      return script.absolutePath.startsWith(activeScriptSource.path);
    }
    return false;
  };

  const { filters, pillFilters } = useMemo(() => parseSearchTerm(searchTerm), [searchTerm]);

  const { favoriteScripts, otherScripts } = useMemo(() => {
    const sourceScripts = scripts;

    const filteredBySidebarCategory = selectedCategory
      ? sourceScripts.filter(script => (script.metadata?.categories || []).includes(selectedCategory))
      : sourceScripts;

    const filteredByDefaultCategories = selectedDefaultCategories.length > 0
      ? filteredBySidebarCategory.filter(script =>
        selectedDefaultCategories.every(cat => (script.metadata?.categories || []).includes(cat))
      )
      : filteredBySidebarCategory;

    const filteredByType = typeFilter === 'all'
      ? filteredByDefaultCategories
      : filteredByDefaultCategories.filter(script => script.type === typeFilter);

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

        const matchesAuthor = author.length === 0 || author.every(a => {
          if (a === 'unknown') {
            return !script.metadata?.author || lowercasedAuthor === '';
          } else {
            return lowercasedAuthor.includes(a);
          }
        });
        const matchesParam = param.length === 0 || param.every(p => scriptParameters.some(sp => sp.name.includes(p) || sp.description.includes(p)));
        const matchesDesc = desc.length === 0 || desc.every(d => lowercasedDescription.includes(d));
        const matchesDocType = doctype.length === 0 || doctype.every(dt => scriptDocumentType.includes(dt));
        const matchesCreated = created.length === 0 || created.every(c => dateFilterHelper(script.metadata?.dateCreated, c));
        const matchesModified = modified.length === 0 || modified.every(m => dateFilterHelper(script.metadata?.dateModified, m));
        const matchesCategories = categories.length === 0 || categories.every(c => {
          const searchCategories = c.split(',').map(cat => cat.trim());
          return searchCategories.some(sc => scriptCategories.includes(sc));
        });

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
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      };

      if (sortBy === 'name') {
        return a.name.localeCompare(b.name) * direction;
      }
      if (sortBy === 'author') {
        const authorA = a.metadata?.author || '';
        const authorB = b.metadata?.author || '';
        return authorA.localeCompare(authorB) * direction;
      }
      if (sortBy === 'lastRun') {
        return dateSortHelper(a.metadata?.lastRun ?? undefined, b.metadata?.lastRun ?? undefined) * direction;
      }
      if (sortBy === 'created') {
        return dateSortHelper(a.metadata?.dateCreated, b.metadata?.dateCreated) * direction;
      }
      if (sortBy === 'modified') {
        return dateSortHelper(a.metadata?.dateModified, b.metadata?.dateModified) * direction;
      }
      return 0;
    });

    const favoriteScripts = sortedScripts.filter(script => script.isFavorite);
    const otherScripts = sortedScripts.filter(script => !script.isFavorite);

    return { favoriteScripts, otherScripts };
  }, [scripts, searchTerm, sortOrder, selectedCategory, filters, selectedDefaultCategories, typeFilter]);

  const handleScriptSelect = (script: Script) => {
    setSelectedScript(script);
    if (isMobile) {
      setInspectorOpen(true);
    }
  };

  const handleOpenNewScriptModal = () => {
    openNewScriptModal();
  };

  const handleRemoveFilter = (type: string, value: string) => {
    const currentSearchParts = searchTerm.split(/\s+/).filter(Boolean);
    const newSearchParts = currentSearchParts.filter(part => {
      const lowerPart = part.toLowerCase();
      const filterPrefix = `${type}:`.toLowerCase();
      if (lowerPart.startsWith(filterPrefix)) {
        const valueFromPart = part.substring(type.length + 1);
        if (valueFromPart.toLowerCase() === value.toLowerCase()) {
          return false; // It's a match, remove it
        }
      }
      return true; // Keep it
    });
    setSearchTerm(newSearchParts.join(' '));
  };

  return (
    <div className={`p-4`}> {/* This is a template literal, so the backticks are correct */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {activeScriptSource?.type === 'workspace' ? 'Workspace' : (activeScriptSource?.type === 'local' ? 'Local Scripts' : 'Script Gallery')}
          </h1>
        </div>
        <div className={`flex-grow flex justify-center items-center space-x-4 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
          {defaultCategories.map(category => (
            <div key={category.name} className="flex items-center">
              <input
                type="checkbox"
                id={`category-${category.name}`}
                checked={selectedDefaultCategories.includes(category.name)}
                onChange={() => handleDefaultCategoryChange(category.name)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={!isAuthenticated}
              />
              <label htmlFor={`category-${category.name}`} className="ml-2 text-sm text-gray-900 dark:text-gray-300">
                <FontAwesomeIcon icon={category.icon} className={`mr-1 ${category.color}`} />
                {category.name}
              </label>
            </div>
          ))}
        </div>
        <div className={`flex items-center ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {`${favoriteScripts.length + otherScripts.length} scripts`}
          </p>
        </div>
      </div>

      {pillFilters.length > 0 && (
        <div className="mb-4">
          <FilterPills filters={pillFilters} onRemoveFilter={handleRemoveFilter} />
        </div>
      )}

      <div className={`flex items-center space-x-4 mb-6 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex-grow relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search scripts (e.g., author:John created:>2023-01-01)"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={!isAuthenticated}
          />
        </div>

        <div className="relative">
          <select
            className="appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            onChange={(e) => setSortOrder(e.target.value)}
            value={sortOrder}
            disabled={!isAuthenticated}
          >
            <option value="name-asc">Sort by Name (A-Z)</option>
            <option value="name-desc">Sort by Name (Z-A)</option>
            <option value="author-asc">Sort by Author (A-Z)</option>
            <option value="author-desc">Sort by Author (Z-A)</option>
            <option value="lastRun-desc">Sort by Last Run (Newest)</option>
            <option value="lastRun-asc">Sort by Last Run (Oldest)</option>
            <option value="created-desc">Sort by Date Created (Newest)</option>
            <option value="created-asc">Sort by Date Created (Oldest)</option>
            <option value="modified-desc">Sort by Date Modified (Newest)</option>
            <option value="modified-asc">Sort by Date Modified (Oldest)</option>
          </select>
        </div>
      </div>

      {favoriteScripts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-4">Favorites</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {favoriteScripts.filter(Boolean).map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                onSelect={() => handleScriptSelect(script)}
                isFromActiveWorkspace={isFromActiveWorkspace(script)}
                isCompact={true}
              />
            ))}
          </div>
        </div>
      )}

      {favoriteScripts.length > 0 && otherScripts.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 my-8"></div>
      )}

      {selectedFolder && (
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm text-gray-400 dark:text-gray-500">
                {selectedFolder ? selectedFolder : 'All Scripts'}
              </h2>
            </div>
            {canCreateScripts && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const path = activeScriptSource && 'path' in activeScriptSource ? activeScriptSource.path : selectedFolder;
                    if (path) {
                      loadScriptsForFolder(path);
                    }
                  }}
                  className="p-1 px-2 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                  title="Rescan folder for new/deleted scripts"
                  disabled={!isAuthenticated || isParacoreDisconnected || !activeScriptSource}
                >
                  <FontAwesomeIcon icon={faSync} />
                </button>
                <button
                  onClick={() => setIsCompactView(!isCompactView)}
                  className="p-1 px-2 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                  title={isCompactView ? "Expand all cards" : "Collapse all cards"}
                  disabled={!isAuthenticated}
                >
                  <FontAwesomeIcon icon={isCompactView ? faExpandAlt : faCompressAlt} />
                </button>
                <div className="relative" title={getNewScriptButtonTooltip()}>
                  <button
                    onClick={handleOpenNewScriptModal}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!isAuthenticated || isParacoreDisconnected || !activeScriptSource}
                  >
                    New Script
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {otherScripts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherScripts.filter(Boolean).map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              onSelect={() => handleScriptSelect(script)}
              isFromActiveWorkspace={isFromActiveWorkspace(script)}
              isCompact={isCompactView}
            />
          ))}
        </div>
      )}

      {favoriteScripts.length === 0 && otherScripts.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 text-sm italic">
          {!isAuthenticated
            ? "Sign in to load scripts"
            : isParacoreDisconnected && !activeScriptSource
              ? "To load scripts from a source open Revit and toggle on the Paracore."
              : searchTerm
                ? 'No scripts match your search.'
                : (activeScriptSource
                  ? 'No scripts found in this source. Why not create one?'
                  : 'Add or select a script source in the sidebar to get started.')
          }
        </div>
      )}

      {selectedFolder && (
        <NewScriptModal
          isOpen={isNewScriptModalOpen}
          onClose={closeNewScriptModal}
          selectedFolder={selectedFolder as string}
        />
      )}

      {/* Script Type Filter Bar */}
      <div className={styles.filterBar}>
        <div
          className={`${styles.filterItem} ${typeFilter === 'all' ? styles.activeFilter : ''}`}
          onClick={() => setTypeFilter('all')}
        >
          <input
            type="radio"
            id="type-all"
            name="script-type"
            checked={typeFilter === 'all'}
            onChange={() => setTypeFilter('all')}
          />
          <label htmlFor="type-all">All</label>
        </div>
        <div
          className={`${styles.filterItem} ${typeFilter === 'single-file' ? styles.activeFilter : ''}`}
          onClick={() => setTypeFilter('single-file')}
        >
          <input
            type="radio"
            id="type-single"
            name="script-type"
            checked={typeFilter === 'single-file'}
            onChange={() => setTypeFilter('single-file')}
          />
          <label htmlFor="type-single">Single</label>
        </div>
        <div
          className={`${styles.filterItem} ${typeFilter === 'multi-file' ? styles.activeFilter : ''}`}
          onClick={() => setTypeFilter('multi-file')}
        >
          <input
            type="radio"
            id="type-multi"
            name="script-type"
            checked={typeFilter === 'multi-file'}
            onChange={() => setTypeFilter('multi-file')}
          />
          <label htmlFor="type-multi">Multi</label>
        </div>
      </div>
    </div>
  );
}
