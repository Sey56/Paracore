import { useState, useMemo } from 'react';
import { Script } from '@/types/scriptModel';

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

export const useGalleryFilters = (scripts: Script[], favoriteIds: string[], selectedSidebarCategory: string | null) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('name-asc');
  const [selectedDefaultCategories, setSelectedDefaultCategories] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'scripts' | 'guards'>('all');

  const { filters, pillFilters } = useMemo(() => parseSearchTerm(searchTerm), [searchTerm]);

  const { favoriteScripts, otherScripts } = useMemo(() => {
    const sourceScripts = scripts.map(s => ({
      ...s,
      isFavorite: favoriteIds.includes(s.id)
    }));

    const filteredBySidebarCategory = selectedSidebarCategory
      ? sourceScripts.filter(script => (script.metadata?.categories || []).includes(selectedSidebarCategory))
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

    return { 
      favoriteScripts: sortedScripts.filter(script => script.isFavorite), 
      otherScripts: sortedScripts.filter(script => !script.isFavorite) 
    };
  }, [scripts, searchTerm, sortOrder, selectedSidebarCategory, filters, selectedDefaultCategories, typeFilter, favoriteIds]);

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

  const handleDefaultCategoryChange = (categoryName: string) => {
    setSelectedDefaultCategories(prev =>
      prev.includes(categoryName) ? prev.filter(c => c !== categoryName) : [...prev, categoryName]
    );
  };

  return {
    searchTerm, setSearchTerm,
    sortOrder, setSortOrder,
    selectedDefaultCategories, handleDefaultCategoryChange,
    typeFilter, setTypeFilter,
    pillFilters, handleRemoveFilter,
    favoriteScripts, otherScripts
  };
};
