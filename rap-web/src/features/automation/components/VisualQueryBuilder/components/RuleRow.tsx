import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ParameterDefinition, QueryRule, OPERATORS, getAvailableUnits } from '../types/queryBuilderTypes';

interface RuleRowProps {
  child: QueryRule;
  childPath: number[];
  availableParams: ParameterDefinition[];
  updateRootGroupRecursive: (path: number[], updates: any, action: 'update' | 'remove' | 'add_rule' | 'add_group' | 'move_up' | 'move_down') => void;
}

export const RuleRow: React.FC<RuleRowProps> = ({
  child,
  childPath,
  availableParams,
  updateRootGroupRecursive
}) => {
  const relevantUnits = getAvailableUnits(child.spec_type_id);

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 group/item">
      <div className="flex-[2] min-w-[150px]">
        <select 
          value={child.name} 
          onChange={(e) => updateRootGroupRecursive(childPath, { name: e.target.value }, 'update')} 
          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 dark:text-white transition-all"
        >
          {availableParams.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[80px]">
        <select 
          value={child.operator} 
          onChange={(e) => updateRootGroupRecursive(childPath, { operator: e.target.value }, 'update')} 
          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 outline-none"
        >
          {OPERATORS[child.storage_type]?.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </div>
      <div className="flex-[1.5] min-w-[120px]">
        {child.storage_type === 'ElementId' && child.revit_element_type && child.revit_element_type !== 'ElementId' ? (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg text-[11px] font-bold text-blue-600 dark:text-blue-400 italic text-center uppercase tracking-tight">Select {child.revit_element_type}</div>
        ) : (
          <input 
            type="text" 
            value={child.value} 
            onChange={(e) => {
              const val = e.target.value;
              if (child.storage_type === 'String' || val === "" || /^-?\d*\.?\d*$/.test(val)) updateRootGroupRecursive(childPath, { value: val }, 'update');
            }} 
            placeholder="Value..." 
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 dark:text-white transition-all" 
            inputMode={child.storage_type === 'String' ? 'text' : 'decimal'} 
          />
        )}
      </div>
      {relevantUnits.length > 0 && (
        <div className="flex-[0.8] min-w-[80px]">
          <select 
            value={child.unit || ''} 
            onChange={(e) => updateRootGroupRecursive(childPath, { unit: e.target.value || undefined }, 'update')} 
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-[11px] font-bold outline-none dark:text-white uppercase"
          >
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
};
