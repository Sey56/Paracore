import React, { useMemo, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faGlobe, faChevronDown } from '@fortawesome/free-solid-svg-icons';

const COMMON_CATEGORIES = [
  { id: 'OST_Walls', label: 'Walls' },
  { id: 'OST_Doors', label: 'Doors' },
  { id: 'OST_Windows', label: 'Windows' },
  { id: 'OST_Rooms', label: 'Rooms' },
  { id: 'OST_Furniture', label: 'Furniture' },
  { id: 'OST_Sheets', label: 'Sheets' },
  { id: 'OST_Views', label: 'Views' },
  { id: 'OST_Levels', label: 'Levels' },
  { id: 'OST_Floors', label: 'Floors' },
  { id: 'OST_Columns', label: 'Columns' },
  { id: 'OST_StructuralColumns', label: 'Structural Columns' },
  { id: 'OST_StructuralFraming', label: 'Structural Framing (Beams)' },
  { id: 'OST_StructuralFoundation', label: 'Foundations' },
  { id: 'OST_Ceilings', label: 'Ceilings' },
  { id: 'OST_Roofs', label: 'Roofs' },
  { id: 'OST_GenericModel', label: 'Generic Models' },
  { id: 'OST_MechanicalEquipment', label: 'Mechanical Equipment' },
  { id: 'OST_DuctCurves', label: 'Ducts' },
  { id: 'OST_PipeCurves', label: 'Pipes' },
  { id: 'OST_CableTray', label: 'Cable Trays' },
  { id: 'OST_Conduit', label: 'Conduits' },
  { id: 'OST_LightingFixtures', label: 'Lighting Fixtures' },
  { id: 'OST_ElectricalEquipment', label: 'Electrical Equipment' },
  { id: 'OST_PlumbingFixtures', label: 'Plumbing Fixtures' },
];

interface CategorySelectorProps {
  category: string;
  setCategory: (val: string) => void;
  categorySearch: string;
  setCategorySearch: (val: string) => void;
  isCategoryDropdownOpen: boolean;
  setIsCategoryDropdownOpen: (val: boolean) => void;
  showAllCategories: boolean;
  setShowAllCategories: (val: boolean) => void;
  allCategoriesList: { id: string, label: string }[];
  isFetchingCategories: boolean;
  fetchAllCategories: () => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  category, setCategory,
  categorySearch, setCategorySearch,
  isCategoryDropdownOpen, setIsCategoryDropdownOpen,
  showAllCategories, setShowAllCategories,
  allCategoriesList,
  isFetchingCategories,
  fetchAllCategories
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCategoryDropdownOpen(false);
      }
    };

    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isCategoryDropdownOpen, setIsCategoryDropdownOpen]);

  const categoryList = useMemo(() => {
    if (!showAllCategories) return COMMON_CATEGORIES;
    return allCategoriesList.length > 0 ? allCategoriesList : COMMON_CATEGORIES;
  }, [showAllCategories, allCategoriesList]);

  const filteredCategories = categoryList.filter(cat =>
    cat.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
    cat.id.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const currentCategoryLabel = useMemo(() => {
    const found = categoryList.find(c => c.id === category);
    return found ? found.label : category.replace("OST_", "");
  }, [category, categoryList]);

  return (
    <div className="flex-1 max-w-md relative" ref={dropdownRef}>
      <label className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 px-1">Target Category</label>
      <div className="relative">
        <input
          type="text"
          placeholder={currentCategoryLabel}
          value={categorySearch}
          onFocus={() => { setIsCategoryDropdownOpen(true); }}
          onChange={(e) => setCategorySearch(e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all dark:text-white shadow-sm pr-10"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 flex items-center gap-2">
          {isFetchingCategories ? <FontAwesomeIcon icon={faSync} spin className="text-[10px]" /> : <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />}
        </div>
        {isCategoryDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[100] max-h-80 overflow-y-auto custom-scrollbar border-t-4 border-t-blue-500 animate-in fade-in slide-in-from-top-2">
            <div className="p-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{showAllCategories ? 'All Categories' : 'Common Categories'}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextState = !showAllCategories;
                  setShowAllCategories(nextState);
                  if (nextState) fetchAllCategories();
                }}
                className={`text-[10px] font-black px-2 py-1 rounded-md transition-all flex items-center gap-1.5 ${showAllCategories ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
              >
                <FontAwesomeIcon icon={isFetchingCategories ? faSync : faGlobe} className={isFetchingCategories ? 'animate-spin' : ''} />
                {isFetchingCategories ? 'SYNCING...' : (showAllCategories ? 'MODE: ALL' : 'MODE: COMMON')}
              </button>
            </div>
            {filteredCategories.map(cat => (
              <div key={cat.id} onClick={() => { setCategory(cat.id); setCategorySearch(''); setIsCategoryDropdownOpen(false); }} className={`px-4 py-1.5 text-sm font-bold cursor-pointer transition-colors flex items-center justify-between group ${category === cat.id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                <span>{cat.label}</span>
                <span className="text-xs font-black text-slate-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity">{cat.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
