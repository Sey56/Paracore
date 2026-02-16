import { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faCode, faCogs, faFilter, faCheck, faSpinner, faTable, faTimes, faChevronDown, faGlobe, faSync, faArrowUp, faArrowDown, faMousePointer, faSearch, faInfoCircle, faShieldHeart } from '@fortawesome/free-solid-svg-icons';
import api from '@/api/axios';

interface ParameterDefinition {
  name: string;
  storage_type: string;
  is_builtin: boolean;
  builtin_id: number;
  builtin_name?: string;
  revit_element_type?: string;
  spec_type_id?: string;
}

interface QueryRule {
  type: 'rule';
  name: string;
  storage_type: string;
  operator: string;
  value: any;
  unit?: string;
  is_builtin: boolean;
  builtin_id: number;
  builtin_name?: string;
  revit_element_type?: string;
  spec_type_id?: string;
}

interface QueryGroup {
  type: 'group';
  combinator: 'AND' | 'OR';
  children: (QueryRule | QueryGroup)[];
}

interface VisualQueryBuilderProps {
  onQueryGenerated: (logic: string, params: string, isCompiled: boolean) => void;
  initialState?: {
    category: string;
    rootGroup: QueryGroup;
    selectedColumns: QueryRule[];
    scope?: 'project' | 'selection';
  };
  onConfigChange?: (config: { category: string, rootGroup: QueryGroup, scope: string }) => void;
}

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

const OPERATORS: Record<string, string[]> = {
  'Double': ['==', '!=', '>', '<', '>=', '<='],
  'Integer': ['==', '!=', '>', '<', '>=', '<='],
  'String': ['==', '!=', 'Contains', 'Starts With', 'Ends With'],
  'ElementId': ['==', '!='],
};

const UNIT_GROUPS: Record<string, string[]> = {
  length: ['mm', 'cm', 'm', 'in', 'ft'],
  area: ['m2', 'sqm', 'ft2'],
  volume: ['m3', 'cum', 'ft3'],
};

const getAvailableUnits = (specId?: string) => {
  if (!specId) return [];
  const sid = specId.toLowerCase();
  if (sid.includes('length') || sid.includes('distance')) return UNIT_GROUPS.length;
  if (sid.includes('area')) return UNIT_GROUPS.area;
  if (sid.includes('volume')) return UNIT_GROUPS.volume;
  return [];
};

export const VisualQueryBuilder = ({ onQueryGenerated, initialState, onConfigChange }: VisualQueryBuilderProps) => {
  const [scope, setScope] = useState<'project' | 'selection'>(initialState?.scope || 'project');
  const [category, setCategory] = useState(initialState?.category || 'OST_Walls');
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [allCategoriesList, setAllCategoriesList] = useState<{ id: string, label: string }[]>([]);
  const [isFetchingCategories, setIsFetchingCategories] = useState(false);

  const [columnSearch, setColumnSearch] = useState('');
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<QueryRule[]>(initialState?.selectedColumns || []);

  const [availableParams, setAvailableParams] = useState<ParameterDefinition[]>([]);
  const [rootGroup, setRootGroup] = useState<QueryGroup>(initialState?.rootGroup || {
    type: 'group',
    combinator: 'AND',
    children: []
  });
  const [isLoadingParams, setIsLoadingParams] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [lastGeneratedTimestamp, setLastGeneratedTimestamp] = useState<number | null>(null);

  useEffect(() => {
    if (onConfigChange) {
      onConfigChange({ category, rootGroup, scope });
    }
  }, [category, rootGroup, scope, onConfigChange]);

  useEffect(() => {
    console.log("[VisualQueryBuilder] Mounted");
    if (initialState) {
      setScope(initialState.scope || 'project');
      setCategory(initialState.category);
      setRootGroup(initialState.rootGroup);
      setSelectedColumns(initialState.selectedColumns || []);
    }
  }, [initialState]);

  const fetchAllCategories = async () => {
    if (allCategoriesList.length > 0) return;
    setIsFetchingCategories(true);
    try {
      const response = await api.get('/api/query/all-categories');
      setAllCategoriesList(response.data.categories || []);
    } catch (err) {
      console.error("Failed to fetch all categories:", err);
    } finally {
      setIsFetchingCategories(false);
    }
  };

  const categoryList = useMemo(() => {
    if (!showAllCategories) return COMMON_CATEGORIES;
    return allCategoriesList.length > 0 ? allCategoriesList : COMMON_CATEGORIES;
  }, [showAllCategories, allCategoriesList]);

  const filteredCategories = categoryList.filter(cat =>
    cat.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
    cat.id.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const filteredColumns = availableParams.filter(p =>
    p.name.toLowerCase().includes(columnSearch.toLowerCase()) &&
    !selectedColumns.some(sc => sc.name === p.name)
  );

  const currentCategoryLabel = useMemo(() => {
    const found = categoryList.find(c => c.id === category);
    return found ? found.label : category.replace("OST_", "");
  }, [category, categoryList]);

  useEffect(() => {
    const fetchParams = async () => {
      setIsLoadingParams(true);
      try {
        const response = await api.get(`/api/query/parameters/${category}`);
        setAvailableParams(response.data.parameters || []);
      } catch (err) {
        console.error("Failed to fetch category parameters:", err);
      } finally {
        setIsLoadingParams(false);
      }
    };
    fetchParams();
  }, [category]);

  const updateRootGroupRecursive = (path: number[], updates: any, action: 'update' | 'remove' | 'add_rule' | 'add_group' | 'move_up' | 'move_down') => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    const newRoot = JSON.parse(JSON.stringify(rootGroup));
    let current = newRoot;
    const depth = (action === 'update' || action === 'remove' || action === 'move_up' || action === 'move_down') ? path.length - 1 : path.length;
    for (let i = 0; i < depth; i++) current = current.children[path[i]];
    const index = path[path.length - 1];

    if (action === 'update') {
      current.children[index] = { ...current.children[index], ...updates };
      if (updates.name && current.children[index].type === 'rule') {
        const pDef = availableParams.find(p => p.name === updates.name);
        if (pDef) {
          const rule = current.children[index];
          rule.storage_type = pDef.storage_type;
          rule.is_builtin = pDef.is_builtin;
          rule.builtin_id = pDef.builtin_id;
          rule.builtin_name = pDef.builtin_name;
          rule.revit_element_type = pDef.revit_element_type;
          rule.spec_type_id = pDef.spec_type_id;
          rule.operator = OPERATORS[pDef.storage_type][0];
          rule.value = pDef.storage_type === 'String' ? '' : '0';
          rule.unit = undefined;
        }
      }
    } else if (action === 'remove') current.children.splice(index, 1);
    else if (action === 'add_rule') {
      const firstParam = availableParams[0];
      if (firstParam) current.children.push({
        type: 'rule', name: firstParam.name, storage_type: firstParam.storage_type,
        operator: OPERATORS[firstParam.storage_type][0], value: firstParam.storage_type === 'String' ? '' : '0',
        is_builtin: firstParam.is_builtin, builtin_id: firstParam.builtin_id,
        builtin_name: firstParam.builtin_name, revit_element_type: firstParam.revit_element_type,
        spec_type_id: firstParam.spec_type_id,
      });
    } else if (action === 'add_group') current.children.push({ type: 'group', combinator: 'AND', children: [] });
    else if (action === 'move_up' && index > 0) [current.children[index], current.children[index - 1]] = [current.children[index - 1], current.children[index]];
    else if (action === 'move_down' && index < current.children.length - 1) [current.children[index], current.children[index + 1]] = [current.children[index + 1], current.children[index]];
    setRootGroup(newRoot);
  };

  const addColumn = (param: ParameterDefinition) => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    setSelectedColumns([...selectedColumns, {
      type: 'rule', name: param.name, storage_type: param.storage_type, operator: '==', value: '',
      is_builtin: param.is_builtin, builtin_id: param.builtin_id, builtin_name: param.builtin_name,
      revit_element_type: param.revit_element_type, unit: undefined, spec_type_id: param.spec_type_id
    }]);
    setColumnSearch('');
    setIsColumnDropdownOpen(false);
  };

  const removeColumn = (name: string) => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    setSelectedColumns(selectedColumns.filter(c => c.name !== name));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setLastGeneratedTimestamp(null);
    try {
      const mappedColumns = selectedColumns.map(col => ({
        type: 'rule', name: col.name, storage_type: col.storage_type, operator: '==', value: '',
        is_builtin: col.is_builtin, builtin_id: col.builtin_id, builtin_name: col.builtin_name,
        revit_element_type: col.revit_element_type, unit: col.unit, spec_type_id: col.spec_type_id
      }));

      const response = await api.post('/api/query/generate', {
        category_name: category,
        root_group: rootGroup,
        selected_columns: mappedColumns,
        scope: scope
      });

      if (response.data.logic && response.data.params) {
        onQueryGenerated(response.data.logic, response.data.params, true);
        setLastGeneratedTimestamp(Date.now());
      }
    } catch (err) {
      console.error("Failed to generate query code:", err);
      onQueryGenerated('', '', false);
    } finally { setIsGenerating(false); }
  };

  const renderGroup = (group: QueryGroup, path: number[] = []) => {
    const isRoot = path.length === 0;
    return (
      <div className={`space-y-4 ${!isRoot ? 'pl-6 border-l-2 border-gray-100 dark:border-gray-800 ml-2 py-2' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <select value={group.combinator} onChange={(e) => {
              setLastGeneratedTimestamp(null);
              onQueryGenerated('', '', false);
              const newRoot = JSON.parse(JSON.stringify(rootGroup));
              let target = newRoot;
              for (const p of path) target = target.children[p];
              target.combinator = e.target.value as 'AND' | 'OR';
              setRootGroup(newRoot);
            }} className={`text-[10px] font-black px-3 py-1 rounded-full outline-none cursor-pointer transition-colors ${group.combinator === 'AND' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}>
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
            {isRoot && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Logic Workspace</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => updateRootGroupRecursive(path, {}, 'add_rule')} className="text-[9px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all flex items-center gap-1.5"><FontAwesomeIcon icon={faPlus} /> FILTER</button>
            <button onClick={() => updateRootGroupRecursive(path, {}, 'add_group')} className="text-[9px] font-black text-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all flex items-center gap-1.5"><FontAwesomeIcon icon={faPlus} /> GROUP</button>
            {!isRoot && <button onClick={() => updateRootGroupRecursive(path, {}, 'remove')} className="w-7 h-7 flex items-center justify-center text-[10px] text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"><FontAwesomeIcon icon={faTrash} /></button>}
          </div>
        </div>
        <div className="space-y-2">
          {group.children.map((child, idx) => {
            const childPath = [...path, idx];
            if (child.type === 'group') return <div key={idx}>{renderGroup(child, childPath)}</div>;
            const relevantUnits = getAvailableUnits(child.spec_type_id);
            return (
              <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 group/item">
                <div className="flex-[2] min-w-[150px]">
                  <select value={child.name} onChange={(e) => updateRootGroupRecursive(childPath, { name: e.target.value }, 'update')} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 dark:text-white transition-all">
                    {availableParams.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[80px]">
                  <select value={child.operator} onChange={(e) => updateRootGroupRecursive(childPath, { operator: e.target.value }, 'update')} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 outline-none">
                    {OPERATORS[child.storage_type]?.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
                <div className="flex-[1.5] min-w-[120px]">
                  {child.storage_type === 'ElementId' && child.revit_element_type && child.revit_element_type !== 'ElementId' ? (
                    <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg text-[10px] font-bold text-blue-600 dark:text-blue-400 italic text-center">Select {child.revit_element_type}</div>
                  ) : (
                    <input type="text" value={child.value} onChange={(e) => {
                      const val = e.target.value;
                      if (child.storage_type === 'String' || val === "" || /^-?\d*\.?\d*$/.test(val)) updateRootGroupRecursive(childPath, { value: val }, 'update');
                    }} placeholder="Value..." className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 dark:text-white transition-all" inputMode={child.storage_type === 'String' ? 'text' : 'decimal'} />
                  )}
                </div>
                {relevantUnits.length > 0 && (
                  <div className="flex-[0.8] min-w-[80px]">
                    <select value={child.unit || ''} onChange={(e) => updateRootGroupRecursive(childPath, { unit: e.target.value || undefined }, 'update')} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-[10px] font-bold outline-none dark:text-white">
                      <option value="">UNIT</option>
                      {relevantUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                  <button onClick={() => updateRootGroupRecursive(childPath, {}, 'move_up')} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"><FontAwesomeIcon icon={faArrowUp} className="text-[10px]" /></button>
                  <button onClick={() => updateRootGroupRecursive(childPath, {}, 'move_down')} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all"><FontAwesomeIcon icon={faArrowDown} className="text-[10px]" /></button>
                  <button onClick={() => updateRootGroupRecursive(childPath, {}, 'remove')} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"><FontAwesomeIcon icon={faTrash} className="text-[10px]" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
        <div className="flex-1 max-w-md relative">
          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Target Category</label>
          <div className="relative">
            <input type="text" placeholder={currentCategoryLabel} value={categorySearch} onFocus={() => { setIsCategoryDropdownOpen(true); setCategorySearch(''); }} onChange={(e) => setCategorySearch(e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white shadow-sm pr-10" />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 flex items-center gap-2">
              {isFetchingCategories ? <FontAwesomeIcon icon={faSync} spin className="text-[10px]" /> : <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />}
            </div>
            {isCategoryDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[100] max-h-80 overflow-y-auto custom-scrollbar border-t-4 border-t-blue-500">
                <div className="p-2 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">{showAllCategories ? 'All Categories' : 'Common Categories'}</span>
                  <button onClick={(e) => { e.stopPropagation(); const nextState = !showAllCategories; setShowAllCategories(nextState); if (nextState) fetchAllCategories(); }} className={`text-[9px] font-black px-2 py-1 rounded-md transition-all flex items-center gap-1.5 ${showAllCategories ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                    <FontAwesomeIcon icon={isFetchingCategories ? faSync : faGlobe} className={isFetchingCategories ? 'animate-spin' : ''} />
                    {isFetchingCategories ? 'SYNCING...' : (showAllCategories ? 'MODE: ALL' : 'MODE: COMMON')}
                  </button>
                </div>
                {filteredCategories.map(cat => (
                  <div key={cat.id} onClick={() => { setCategory(cat.id); setCategorySearch(''); setIsCategoryDropdownOpen(false); }} className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors flex items-center justify-between group ${category === cat.id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                    <span>{cat.label}</span>
                    <span className="text-[9px] font-black text-gray-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity">{cat.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex bg-gray-50 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner">
          <button onClick={() => { setScope('project'); setLastGeneratedTimestamp(null); onQueryGenerated('', '', false); }} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${scope === 'project' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm border border-gray-100 dark:border-gray-700' : 'text-gray-400 hover:text-gray-600'}`}>
            <FontAwesomeIcon icon={faSearch} className="text-[9px]" /> Project Scope
          </button>
          <button onClick={() => { setScope('selection'); setLastGeneratedTimestamp(null); onQueryGenerated('', '', false); }} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${scope === 'selection' ? 'bg-white dark:bg-gray-900 text-purple-600 shadow-sm border border-gray-100 dark:border-gray-700' : 'text-gray-400 hover:text-gray-600'}`}>
            <FontAwesomeIcon icon={faMousePointer} className="text-[9px]" /> Active Selection
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 min-h-[300px]">
        {renderGroup(rootGroup)}
        {rootGroup.children.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-300 mb-3">
              <FontAwesomeIcon icon={faFilter} />
            </div>
            <div className="text-xs font-bold text-gray-400">No logic defined. Click 'FILTER' to begin.</div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <FontAwesomeIcon icon={faTable} className="text-gray-400 text-xs" />
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reporting Parameters</h3>
        </div>
        <div className="bg-gray-50/50 dark:bg-gray-800/30 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
          <div className="flex flex-col gap-6">
            <div className="relative max-w-md">
              <input type="text" placeholder="Add additional data columns..." value={columnSearch} onFocus={() => setIsColumnDropdownOpen(true)} onChange={(e) => setColumnSearch(e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white shadow-sm" />
              {isColumnDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setIsColumnDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto custom-scrollbar border-t-4 border-t-blue-500">
                    {filteredColumns.map(p => (
                      <div key={p.name} onClick={() => addColumn(p)} className="px-4 py-3 text-sm font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between group">
                        <span>{p.name}</span>
                        <div className="flex items-center gap-2">
                          {JSON.stringify(rootGroup).includes(`"${p.name}"`) && <span className="text-[8px] font-black text-blue-500">FILTERED</span>}
                          <span className="text-[9px] font-black text-gray-400">{p.storage_type}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {availableParams.filter(p => JSON.stringify(rootGroup).includes(`"${p.name}"`)).map(p => (
                <div key={p.name} className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 flex items-center gap-2"><FontAwesomeIcon icon={faFilter} className="text-[10px] text-blue-500" /><span className="text-xs font-bold text-blue-700 dark:text-blue-300">{p.name}</span></div>
              ))}
              {selectedColumns.map(col => {
                const relevantUnits = getAvailableUnits(col.spec_type_id);
                return (
                  <div key={col.name} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center gap-3 shadow-sm">
                    <div className="flex items-center gap-2"><FontAwesomeIcon icon={faTable} className="text-[10px] text-gray-400" /><span className="text-xs font-bold text-gray-700 dark:text-gray-200">{col.name}</span></div>
                    {relevantUnits.length > 0 && (
                      <select value={col.unit || ''} onChange={(e) => { setLastGeneratedTimestamp(null); onQueryGenerated('', '', false); setSelectedColumns(selectedColumns.map(c => c.name === col.name ? { ...c, unit: e.target.value || undefined } : c)); }} className="bg-gray-100 dark:bg-gray-700 border-none rounded px-1.5 py-0.5 text-[9px] font-black text-gray-600 dark:text-gray-400 outline-none cursor-pointer">
                        <option value="">UNIT</option>
                        {relevantUnits.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    )}
                    <button onClick={() => removeColumn(col.name)} className="text-gray-400 hover:text-red-500 transition-colors ml-1"><FontAwesomeIcon icon={faTimes} className="text-[10px]" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isLoadingParams || isGenerating ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{isLoadingParams ? 'Syncing Parameters...' : (isGenerating ? 'Compiling Logic...' : 'System Ready')}</span>
              {lastGeneratedTimestamp && !isGenerating && (
                <span className="text-[9px] font-bold text-green-600 dark:text-green-400 animate-in fade-in duration-500"><FontAwesomeIcon icon={faCheck} className="mr-1" /> Logic Synchronized</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleGenerate} disabled={(rootGroup.children.length === 0 && selectedColumns.length === 0) || isGenerating} className="group px-8 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-30 flex items-center gap-3 active:scale-95">
              {isGenerating ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCode} className="group-hover:rotate-12 transition-transform" />}
              {isGenerating ? 'Generating...' : 'Compile Logic'}
            </button>
          </div>
        </div>

        {lastGeneratedTimestamp && !isGenerating && (
          <div className="px-6 py-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/50 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
              <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 mt-0.5" />
              <div>
                <div className="text-[11px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-tight">C# Logic Compiled Successfully</div>
                <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-bold mt-0.5 leading-relaxed">The visual rules have been converted to high-performance Revit API code. Click <strong>{initialState ? 'Confirm Changes' : 'Create Tool'}</strong> below to finalize the injection.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
