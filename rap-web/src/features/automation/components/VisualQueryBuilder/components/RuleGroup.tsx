import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { ParameterDefinition, QueryGroup } from '../types/queryBuilderTypes';
import { RuleRow } from './RuleRow';

interface RuleGroupProps {
  group: QueryGroup;
  path?: number[];
  availableParams: ParameterDefinition[];
  updateRootGroupRecursive: (path: number[], updates: any, action: 'update' | 'remove' | 'add_rule' | 'add_group' | 'move_up' | 'move_down') => void;
  setGroupCombinator: (path: number[], combinator: 'AND' | 'OR') => void;
}

export const RuleGroup: React.FC<RuleGroupProps> = ({
  group,
  path = [],
  availableParams,
  updateRootGroupRecursive,
  setGroupCombinator
}) => {
  const isRoot = path.length === 0;

  return (
    <div className={`space-y-2 ${!isRoot ? 'pl-6 border-l-2 border-slate-100 dark:border-slate-800 ml-2 py-1' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <select
            value={group.combinator}
            onChange={(e) => setGroupCombinator(path, e.target.value as 'AND' | 'OR')}
            className={`text-xs font-black px-3 py-1 rounded-full outline-none cursor-pointer transition-colors ${group.combinator === 'AND' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'}`}
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
          {isRoot && <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1">Logic Canvas</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => updateRootGroupRecursive(path, {}, 'add_rule')} className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all flex items-center gap-1.5"><FontAwesomeIcon icon={faPlus} /> FILTER</button>
          <button onClick={() => updateRootGroupRecursive(path, {}, 'add_group')} className="text-xs font-black text-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all flex items-center gap-1.5"><FontAwesomeIcon icon={faPlus} /> GROUP</button>
          {!isRoot && <button onClick={() => updateRootGroupRecursive(path, {}, 'remove')} className="w-7 h-7 flex items-center justify-center text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"><FontAwesomeIcon icon={faTrash} /></button>}
        </div>
      </div>
      <div className="space-y-2">
        {group.children.map((child, idx) => {
          const childPath = [...path, idx];
          if (child.type === 'group') {
            return (
              <div key={idx}>
                <RuleGroup
                  group={child}
                  path={childPath}
                  availableParams={availableParams}
                  updateRootGroupRecursive={updateRootGroupRecursive}
                  setGroupCombinator={setGroupCombinator}
                />
              </div>
            );
          }
          return (
            <RuleRow
              key={idx}
              child={child}
              childPath={childPath}
              availableParams={availableParams}
              updateRootGroupRecursive={updateRootGroupRecursive}
            />
          );
        })}
      </div>
    </div>
  );
};
