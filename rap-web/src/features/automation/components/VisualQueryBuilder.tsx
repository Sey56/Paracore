import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faCode, faCogs, faFilter, faCheck, faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '@/api/axios';

interface ParameterDefinition {
  name: string;
  storage_type: string;
  is_builtin: boolean;
  builtin_id: number;
  builtin_name?: string;
  revit_element_type?: string;
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
}

interface QueryGroup {
  type: 'group';
  combinator: 'AND' | 'OR';
  children: (QueryRule | QueryGroup)[];
}

interface VisualQueryBuilderProps {
  onQueryGenerated: (logic: string, params: string, isCompiled: boolean) => void;
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

const UNITS = ['mm', 'cm', 'm', 'in', 'm2', 'sqm', 'm3', 'cum'];

export const VisualQueryBuilder = ({ onQueryGenerated }: VisualQueryBuilderProps) => {
  const [category, setCategory] = useState('OST_Walls');
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [availableParams, setAvailableParams] = useState<ParameterDefinition[]>([]);
  const [rootGroup, setRootGroup] = useState<QueryGroup>({
    type: 'group',
    combinator: 'AND',
    children: []
  });
  const [isLoadingParams, setIsLoadingParams] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratedTimestamp, setLastGeneratedTimestamp] = useState<number | null>(null);

  const filteredCategories = COMMON_CATEGORIES.filter(cat => 
    cat.label.toLowerCase().includes(categorySearch.toLowerCase()) ||
    cat.id.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const currentCategoryLabel = COMMON_CATEGORIES.find(c => c.id === category)?.label || category;

  // Fetch parameters when category changes
  useEffect(() => {
    const fetchParams = async () => {
      setIsLoadingParams(true);
      try {
        const response = await api.get(`/api/query/parameters/${category}`);
        setAvailableParams(response.data.parameters || []);
        // Reset rules when category changes to avoid type mismatches
        setRootGroup({
          type: 'group',
          combinator: 'AND',
          children: []
        });
        setLastGeneratedTimestamp(null);
        onQueryGenerated('', '', false);
      } catch (err) {
        console.error("Failed to fetch category parameters:", err);
      } finally {
        setIsLoadingParams(false);
      }
    };
    fetchParams();
  }, [category]);

  const updateRootGroupRecursive = (path: number[], updates: any, action: 'update' | 'remove' | 'add_rule' | 'add_group') => {
    setLastGeneratedTimestamp(null); // Reset on any change
    onQueryGenerated('', '', false);
    const newRoot = JSON.parse(JSON.stringify(rootGroup));
    
    let current = newRoot;
    for (let i = 0; i < path.length - (action === 'update' || action === 'remove' ? 1 : 0); i++) {
      current = current.children[path[i]];
    }

    const index = path[path.length - 1];

    if (action === 'update') {
      current.children[index] = { ...current.children[index], ...updates };
      
      // Handle param change side effects
      if (updates.name && current.children[index].type === 'rule') {
        const pDef = availableParams.find(p => p.name === updates.name);
        if (pDef) {
          const rule = current.children[index];
          rule.storage_type = pDef.storage_type;
          rule.is_builtin = pDef.is_builtin;
          rule.builtin_id = pDef.builtin_id;
          rule.builtin_name = pDef.builtin_name;
          rule.revit_element_type = pDef.revit_element_type;
          rule.operator = OPERATORS[pDef.storage_type][0];
          rule.value = pDef.storage_type === 'String' ? '' : '0';
          rule.unit = undefined;
        }
      }
    } else if (action === 'remove') {
      current.children.splice(index, 1);
    } else if (action === 'add_rule') {
      const firstParam = availableParams[0];
      const target = path.length === 0 ? newRoot : current;
      target.children.push({
        type: 'rule',
        name: firstParam.name,
        storage_type: firstParam.storage_type,
        operator: OPERATORS[firstParam.storage_type][0],
        value: firstParam.storage_type === 'String' ? '' : '0',
        is_builtin: firstParam.is_builtin,
        builtin_id: firstParam.builtin_id,
        builtin_name: firstParam.builtin_name,
        revit_element_type: firstParam.revit_element_type,
      });
    } else if (action === 'add_group') {
      const target = path.length === 0 ? newRoot : current;
      target.children.push({
        type: 'group',
        combinator: 'AND',
        children: []
      });
    }

    setRootGroup(newRoot);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await api.post('/api/query/generate', {
        category_name: category,
        root_group: rootGroup
      });
      onQueryGenerated(response.data.logic, response.data.params, true);
      setLastGeneratedTimestamp(Date.now());
    } catch (err) {
      console.error("Failed to generate query code:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // RECURSIVE RENDERER
  const renderGroup = (group: QueryGroup, path: number[] = []) => {
    const isRoot = path.length === 0;
    return (
      <div className={`space-y-3 ${!isRoot ? 'pl-6 border-l-2 border-blue-500/20 ml-2 py-2' : ''}`}>
        <div className="flex items-center justify-between mb-2">
           <div className="flex items-center gap-2">
              <select 
                value={group.combinator}
                onChange={(e) => {
                  setLastGeneratedTimestamp(null);
                  onQueryGenerated('', '', false);
                  const newRoot = JSON.parse(JSON.stringify(rootGroup));
                  let target = newRoot;
                  for (const p of path) target = target.children[p];
                  target.combinator = e.target.value;
                  setRootGroup(newRoot);
                }}
                className={`text-[10px] font-black px-2 py-1 rounded-md outline-none cursor-pointer transition-colors ${
                  group.combinator === 'AND' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
                }`}
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
              {isRoot && <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Logic Pipeline</label>}
           </div>
           
           <div className="flex items-center gap-1">
              <button 
                onClick={() => updateRootGroupRecursive(path, {}, 'add_rule')}
                className="text-[9px] font-black text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded-md transition-all flex items-center"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
                FILTER
              </button>
              <button 
                onClick={() => updateRootGroupRecursive(path, {}, 'add_group')}
                className="text-[9px] font-black text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-2 py-1 rounded-md transition-all flex items-center"
              >
                <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
                GROUP
              </button>
              {!isRoot && (
                <button 
                  onClick={() => {
                    updateRootGroupRecursive(path, {}, 'remove');
                  }}
                  className="text-[9px] font-black text-red-400 hover:bg-red-50 px-2 py-1 rounded-md transition-all"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              )}
           </div>
        </div>

        <div className="space-y-2">
          {group.children.map((child, idx) => {
            const childPath = [...path, idx];
            if (child.type === 'group') return <div key={idx}>{renderGroup(child, childPath)}</div>;
            
            return (
              <div key={idx} className="flex items-center gap-2 p-2 bg-white/80 dark:bg-gray-900/80 rounded-2xl border border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-left-4 duration-300 shadow-sm group">
                {/* Parameter */}
                <div className="flex-[2] min-w-[150px]">
                  <select
                    value={child.name}
                    onChange={(e) => updateRootGroupRecursive(childPath, { name: e.target.value }, 'update')}
                    className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer dark:text-white"
                  >
                    {availableParams.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Operator */}
                <div className="flex-1 min-w-[100px]">
                  <select
                    value={child.operator}
                    onChange={(e) => updateRootGroupRecursive(childPath, { operator: e.target.value }, 'update')}
                    className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2 text-xs font-black text-blue-600 dark:text-blue-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                  >
                    {OPERATORS[child.storage_type]?.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>

                {/* Value Input */}
                <div className="flex-[1.5] min-w-[120px]">
                  {child.storage_type === 'ElementId' && child.revit_element_type && child.revit_element_type !== 'ElementId' ? (
                    <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl text-[10px] font-bold text-blue-600 dark:text-blue-400 italic">
                      Select {child.revit_element_type}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={child.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (child.storage_type === 'String' || val === "" || /^-?\d*\.?\d*$/.test(val)) {
                          updateRootGroupRecursive(childPath, { value: val }, 'update');
                        }
                      }}
                      placeholder="Value..."
                      className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-400/10 focus:border-blue-400 transition-all placeholder:text-gray-300 dark:text-white"
                      inputMode={child.storage_type === 'String' ? 'text' : 'decimal'}
                    />
                  )}
                </div>

                {/* Optional Unit (only for numbers) */}
                {(child.storage_type === 'Double' || child.storage_type === 'Integer') && (
                  <div className="flex-[0.8] min-w-[80px]">
                    <select
                      value={child.unit || ''}
                      onChange={(e) => updateRootGroupRecursive(childPath, { unit: e.target.value || undefined }, 'update')}
                      className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer dark:text-white"
                    >
                      <option value="">UNIT</option>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}

                {/* Delete */}
                <button
                  onClick={() => updateRootGroupRecursive(childPath, {}, 'remove')}
                  className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-95 shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="border border-gray-100 dark:border-gray-800/50 rounded-3xl p-6 space-y-6 shadow-sm overflow-hidden bg-white/50 dark:bg-gray-900/10 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mr-3 shadow-lg shadow-blue-500/20">
            <FontAwesomeIcon icon={faFilter} className="text-white text-sm" />
          </div>
          <div>
            <div className="text-sm font-black text-gray-800 dark:text-gray-100 tracking-tight">Visual Query Engine</div>
            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">High Performance Revit Filtering</div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Category Selector (Searchable) */}
        <div className="max-w-md relative">
          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Target Category</label>
          
          <div className="relative">
            <input 
              type="text"
              placeholder={currentCategoryLabel}
              value={categorySearch}
              onFocus={() => { setIsCategoryDropdownOpen(true); setCategorySearch(''); }}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white shadow-sm pr-10"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              <FontAwesomeIcon icon={isCategoryDropdownOpen ? faTrash : faCogs} className="text-xs cursor-pointer" onClick={() => { if(isCategoryDropdownOpen) setCategorySearch(''); setIsCategoryDropdownOpen(!isCategoryDropdownOpen); }} />
            </div>

            {isCategoryDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-2xl z-[100] max-h-60 overflow-y-auto custom-scrollbar border-t-4 border-t-blue-500">
                {filteredCategories.length > 0 ? filteredCategories.map(cat => (
                  <div 
                    key={cat.id}
                    onClick={() => {
                      setCategory(cat.id);
                      setCategorySearch('');
                      setIsCategoryDropdownOpen(false);
                    }}
                    className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors flex items-center justify-between group
                      ${category === cat.id ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}
                    `}
                  >
                    <span>{cat.label}</span>
                    <span className="text-[9px] font-black opacity-0 group-hover:opacity-100 text-gray-400 uppercase tracking-tighter">{cat.id}</span>
                  </div>
                )) : (
                  <div className="px-4 py-8 text-center text-xs text-gray-400 italic font-bold">No categories match your search</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RECURSIVE RULES */}
        <div className="min-h-[200px] bg-gray-50/50 dark:bg-gray-900/30 rounded-3xl p-4 border-2 border-dashed border-gray-100 dark:border-gray-800">
          {renderGroup(rootGroup)}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 flex justify-between items-center border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isLoadingParams ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
            {isLoadingParams ? 'Synchronizing Schema...' : `${availableParams.length} Parameters Synced`}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {lastGeneratedTimestamp && (
            <div className="animate-in slide-in-from-right-4 fade-in duration-300 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 text-green-600 dark:text-green-400">
              <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
              <span className="text-[10px] font-black uppercase tracking-tighter">Logic Ready</span>
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={rootGroup.children.length === 0 || isGenerating}
            className="group relative bg-blue-600 text-white px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center active:scale-95 disabled:opacity-30 border border-blue-500/20"
          >
            {isGenerating ? <FontAwesomeIcon icon={faSpinner} spin className="mr-3 text-white/80" /> : <FontAwesomeIcon icon={faCode} className="mr-3 text-white/80 group-hover:scale-110 transition-transform" />}
            {isGenerating ? 'Compiling Logic...' : 'Compile Logic'}
          </button>
        </div>
      </div>
    </div>
  );
};
