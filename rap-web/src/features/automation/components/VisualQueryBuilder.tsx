import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faCode, faCogs, faFilter } from '@fortawesome/free-solid-svg-icons';
import api from '@/api/axios';

interface ParameterDefinition {
  name: string;
  storage_type: string;
  is_builtin: boolean;
  builtin_id: number;
  revit_element_type?: string;
}

interface QueryRule {
  name: string;
  storage_type: string;
  operator: string;
  value: any;
  unit?: string;
  is_builtin: boolean;
  builtin_id: number;
  revit_element_type?: string;
}

interface VisualQueryBuilderProps {
  onQueryGenerated: (logic: string, params: string) => void;
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
  { id: 'OST_GenericModel', label: 'Generic Models' },
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
  const [availableParams, setAvailableParams] = useState<ParameterDefinition[]>([]);
  const [rules, setRules] = useState<QueryRule[]>([]);
  const [isLoadingParams, setIsLoadingParams] = useState(false);

  // Fetch parameters when category changes
  useEffect(() => {
    const fetchParams = async () => {
      setIsLoadingParams(true);
      try {
        const response = await api.get(`/api/query/parameters/${category}`);
        setAvailableParams(response.data.parameters || []);
        // Reset rules when category changes to avoid type mismatches
        setRules([]);
      } catch (err) {
        console.error("Failed to fetch category parameters:", err);
      } finally {
        setIsLoadingParams(false);
      }
    };
    fetchParams();
  }, [category]);

  const addRule = () => {
    if (availableParams.length === 0) return;
    const firstParam = availableParams[0];
    const newRule: QueryRule = {
      name: firstParam.name,
      storage_type: firstParam.storage_type,
      operator: OPERATORS[firstParam.storage_type][0],
      value: firstParam.storage_type === 'String' ? '' : 0,
      is_builtin: firstParam.is_builtin,
      builtin_id: firstParam.builtin_id,
      revit_element_type: firstParam.revit_element_type,
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<QueryRule>) => {
    const newRules = [...rules];
    const updatedRule = { ...newRules[index], ...updates };

    // If changing parameter, reset operator and value type
    if (updates.name) {
      const pDef = availableParams.find(p => p.name === updates.name);
      if (pDef) {
        updatedRule.storage_type = pDef.storage_type;
        updatedRule.is_builtin = pDef.is_builtin;
        updatedRule.builtin_id = pDef.builtin_id;
        updatedRule.revit_element_type = pDef.revit_element_type;
        updatedRule.operator = OPERATORS[pDef.storage_type][0];
        updatedRule.value = pDef.storage_type === 'String' ? '' : 0;
        updatedRule.unit = undefined;
      }
    }

    newRules[index] = updatedRule;
    setRules(newRules);
  };

  const handleGenerate = async () => {
    try {
      const response = await api.post('/api/query/generate', {
        category_name: category,
        rules: rules
      });
      onQueryGenerated(response.data.logic, response.data.params);
    } catch (err) {
      console.error("Failed to generate query code:", err);
    }
  };

  return (
    <div className="border border-gray-100 dark:border-gray-800/50 rounded-3xl p-6 space-y-6 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mr-3">
            <FontAwesomeIcon icon={faFilter} className="text-blue-500 text-xs" />
          </div>
          <div>
            <div className="text-sm font-black text-gray-800 dark:text-gray-100 tracking-tight">Logic Query Engine</div>
            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Visual LINQ Generator</div>
          </div>
        </div>
        <div className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800">
          <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter">
            Revit v{new Date().getFullYear()} Compliant
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Category Selector */}
        <div className="max-w-md">
          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Target Category</label>
          <div className="relative group">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-transparent dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all appearance-none cursor-pointer dark:text-white"
            >
              {COMMON_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-300">
              <FontAwesomeIcon icon={faCogs} className="text-xs" />
            </div>
          </div>
        </div>

        {/* Rules List */}
        <div className="space-y-3">
          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Condition Pipeline (AND)</label>

          <div className="space-y-2">
            {rules.map((rule, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-transparent dark:bg-gray-900/80 rounded-2xl border border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-left-4 duration-300">
                {/* Parameter */}
                <div className="flex-[2] min-w-[150px]">
                  <select
                    value={rule.name}
                    onChange={(e) => updateRule(idx, { name: e.target.value })}
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
                    value={rule.operator}
                    onChange={(e) => updateRule(idx, { operator: e.target.value })}
                    className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2 text-xs font-black text-blue-600 dark:text-blue-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                  >
                    {OPERATORS[rule.storage_type]?.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>

                {/* Value Input */}
                <div className="flex-[1.5] min-w-[120px]">
                  {rule.storage_type === 'ElementId' && rule.revit_element_type && rule.revit_element_type !== 'Element' ? (
                    <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl text-[10px] font-bold text-blue-600 dark:text-blue-400 italic">
                      Select {rule.revit_element_type} in Paracore UI after creation
                    </div>
                  ) : (
                    <input
                      type={rule.storage_type === 'String' ? 'text' : 'number'}
                      value={rule.value}
                      onChange={(e) => updateRule(idx, { value: rule.storage_type === 'String' ? e.target.value : parseFloat(e.target.value) })}
                      placeholder="Value..."
                      className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-400/10 focus:border-blue-400 transition-all placeholder:text-gray-300 dark:text-white"
                    />
                  )}
                </div>

                {/* Optional Unit (only for numbers) */}
                {(rule.storage_type === 'Double' || rule.storage_type === 'Integer') && (
                  <div className="flex-[0.8] min-w-[80px]">
                    <select
                      value={rule.unit || ''}
                      onChange={(e) => updateRule(idx, { unit: e.target.value || undefined })}
                      className="w-full bg-transparent dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-2 py-2 text-[10px] font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer dark:text-white"
                    >
                      <option value="">UNIT</option>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}

                {/* Delete */}
                <button
                  onClick={() => removeRule(idx)}
                  className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all active:scale-95 shrink-0"
                >
                  <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                </button>
              </div>
            ))}

            {/* Add Rule Button */}
            <button
              onClick={addRule}
              disabled={isLoadingParams || availableParams.length === 0}
              className="w-full py-4 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl text-gray-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-900/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all text-xs flex items-center justify-center font-black uppercase tracking-widest"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-3 text-[10px]" />
              Add Pipeline Filter
            </button>
          </div>
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
        <button
          onClick={handleGenerate}
          disabled={rules.length === 0}
          className="group relative bg-gray-900 dark:bg-gray-800 text-white px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:shadow-blue-500/20 hover:bg-blue-600 transition-all flex items-center active:scale-95 disabled:opacity-30 border border-transparent dark:border-gray-700"
        >
          <FontAwesomeIcon icon={faCode} className="mr-3 text-blue-400 group-hover:text-white transition-colors" />
          Compile Logic
          <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-10 transition-opacity rounded-xl" />
        </button>
      </div>
    </div>
  );
};
