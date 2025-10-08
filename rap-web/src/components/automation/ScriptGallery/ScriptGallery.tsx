import {
  useMemo,
  useState
} from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faSearch } from '@fortawesome/free-solid-svg-icons';
import { ScriptCard } from '../ScriptCard/ScriptCard';
import { useScripts } from '@/hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { NewScriptModal } from '@/components/common/NewScriptModal';
import { FilterPills } from '@/components/common/FilterPills';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';

const getFolderNameFromPath = (path: string | null): string => {
  if (!path) return "";
  const parts = path.split(/[\\/]/); // Split by both forward and backward slashes
  return parts.filter(Boolean).pop() || path; // Filter out empty strings and get the last part, or return original path if no parts
};

const parseSearchTerm = (term: string) => {
  const filters: {
    tag: string[];
    author: string[];
    param: string[];
    desc: string[];
    doctype: string[];
    created: string[];
    modified: string[];
    categories: string[];
    general: string[];
  } = {
    tag: [],
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
    if (lowerPart.startsWith('tag:')) {
      const value = part.substring(4);
      filters.tag.push(value.toLowerCase());
      pillFilters.push({ type: 'tag', value });
    } else if (lowerPart.startsWith('author:')) {
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
  const { revitStatus, rserverConnected } = useRevitStatus();
  const isRServerDisconnected = !rserverConnected;
  const { scripts, allScripts, selectedFolder } = useScripts();
  const { selectedCategory, customCategories, setInspectorOpen, openNewScriptModal, closeNewScriptModal, isNewScriptModalOpen, activeScriptSource } = useUI();
  const { setSelectedScript } = useScriptExecution();
  const { activeWorkspace } = useWorkspaces();
  const { isAuthenticated } = useAuth();
  const isMobile = useBreakpoint();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [searchAllFolders, setSearchAllFolders] = useState(false);

  const categoryMap = useMemo(() => {
    const source = searchAllFolders ? allScripts : scripts;
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
  }, [scripts, allScripts, searchAllFolders]);

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
    if (!activeWorkspace || activeScriptSource?.type !== 'workspace') {
      return false;
    }
    return script.absolutePath.startsWith(activeWorkspace.path);
  };

  const { filters, pillFilters } = useMemo(() => parseSearchTerm(searchTerm), [searchTerm]);

  const { favoriteScripts, otherScripts } = useMemo(() => {
    const sourceScripts = searchAllFolders ? allScripts : scripts;

    const filteredBySidebarCategory = selectedCategory
      ? sourceScripts.filter(script => (script.metadata?.categories || []).includes(selectedCategory))
      : sourceScripts;

    let searchedScripts = filteredBySidebarCategory;

    if (searchTerm) {
      const { tag, author, param, desc, doctype, created, modified, general, categories } = filters;

      searchedScripts = filteredBySidebarCategory.filter((script: Script) => {
        const lowercasedName = script.name.toLowerCase();
        const lowercasedDisplayName = (script.metadata?.displayName || '').toLowerCase();
        const lowercasedDescription = (script.metadata?.description || '').toLowerCase();
        const lowercasedAuthor = (script.metadata?.author || '').toLowerCase();
        const scriptCategories = (script.metadata?.categories || []).map(cat => cat.toLowerCase());
        const scriptTags = (script.metadata?.tags || []).map(t => t.toLowerCase());
        const scriptParameters = (script.parameters ?? []).map(p => ({ name: p.name.toLowerCase(), description: (p.description || '').toLowerCase() }));
        const scriptDocumentType = (script.metadata?.documentType || 'any').toLowerCase();

        const matchesTag = tag.length === 0 || tag.every(t => scriptTags.includes(t));
        const matchesAuthor = author.length === 0 || author.every(a => lowercasedAuthor.includes(a));
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
          scriptTags.some(t => t.includes(g)) ||
          scriptParameters.some(sp => sp.name.includes(g) || sp.description.includes(g))
        );

        return matchesTag && matchesAuthor && matchesParam && matchesDesc && matchesDocType && matchesCreated && matchesModified && matchesCategories && matchesGeneral;
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
  }, [scripts, allScripts, searchAllFolders, searchTerm, sortOrder, selectedCategory, filters]);

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
    <div className={`p-4`}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          {activeScriptSource?.type === 'workspace' ? 'Workspace' : (activeScriptSource?.type === 'local' ? 'Local Scripts' : 'Script Gallery')}
        </h1>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="searchAllFolders"
            checked={searchAllFolders}
            onChange={(e) => setSearchAllFolders(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="searchAllFolders" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
            All
          </label>
        </div>
      </div>

      {pillFilters.length > 0 && (
        <div className="mb-4">
          <FilterPills filters={pillFilters} onRemoveFilter={handleRemoveFilter} />
        </div>
      )}

      <div className="flex items-center space-x-4 mb-6">
        <div className="flex-grow relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search scripts (e.g., author:John created:>2023-01-01)"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="relative">
          <select
            className="appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
            onChange={(e) => setSortOrder(e.target.value)}
            value={sortOrder}
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
          <FontAwesomeIcon
            icon={faChevronDown}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-300 pointer-events-none"
          />
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
                {selectedFolder && !searchAllFolders ? selectedFolder : 'All Scripts'}
              </h2>
            </div>
            <div className="relative" title={!isAuthenticated ? "You must sign in to create scripts" : ""}>
              <button 
                onClick={handleOpenNewScriptModal} 
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isAuthenticated || isRServerDisconnected}
              >
                New Script
              </button>
            </div>
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
            />
        ))}
        </div>
      )}

      {favoriteScripts.length === 0 && otherScripts.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 text-sm italic">
          {searchTerm
            ? 'No scripts match your search.'
            : (selectedFolder 
              ? 'No scripts found in this folder. Why not create one?' 
              : 'Add a script folder in the sidebar to get started.')
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
    </div>
  );
}