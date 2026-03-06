import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter } from '@fortawesome/free-solid-svg-icons';

// Hooks
import { useQueryBuilderLogic } from './hooks/useQueryBuilderLogic';

// Components
import { CategorySelector } from './components/CategorySelector';
import { ScopeSelector } from './components/ScopeSelector';
import { RuleGroup } from './components/RuleGroup';
import { ReportingParameters } from './components/ReportingParameters';
import { GenerationFooter } from './components/GenerationFooter';

// Types
import { QueryRule, QueryGroup } from './types/queryBuilderTypes';

interface VisualQueryBuilderProps {
  onQueryGenerated: (logic: string, params: string, isCompiled: boolean) => void;
  initialState?: {
    category: string;
    rootGroup: QueryGroup;
    selectedColumns: QueryRule[];
    scope?: 'project' | 'selection';
  };
  onConfigChange?: (config: { category: string, rootGroup: QueryGroup, selectedColumns: QueryRule[], scope: string }) => void;
  isWatchdog?: boolean;
  name?: string;
  description?: string;
}

export const VisualQueryBuilder: React.FC<VisualQueryBuilderProps> = ({
  onQueryGenerated,
  initialState,
  onConfigChange,
  isWatchdog = false,
  name,
  description
}) => {
  const {
    scope, setScope,
    category, setCategory,
    categorySearch, setCategorySearch,
    isCategoryDropdownOpen, setIsCategoryDropdownOpen,
    showAllCategories, setShowAllCategories,
    allCategoriesList,
    isFetchingCategories,
    fetchAllCategories,
    columnSearch, setColumnSearch,
    isColumnDropdownOpen, setIsColumnDropdownOpen,
    selectedColumns,
    availableParams,
    rootGroup,
    isLoadingParams,
    isGenerating,
    lastGeneratedTimestamp,
    updateRootGroupRecursive,
    addColumn,
    removeColumn,
    updateColumnUnit,
    handleGenerate,
    setGroupCombinator,
    setLastGeneratedTimestamp
  } = useQueryBuilderLogic(onQueryGenerated, initialState, onConfigChange, isWatchdog, name, description);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Header: Category & Scope */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
        <CategorySelector
          category={category}
          setCategory={setCategory}
          categorySearch={categorySearch}
          setCategorySearch={setCategorySearch}
          isCategoryDropdownOpen={isCategoryDropdownOpen}
          setIsCategoryDropdownOpen={setIsCategoryDropdownOpen}
          showAllCategories={showAllCategories}
          setShowAllCategories={setShowAllCategories}
          allCategoriesList={allCategoriesList}
          isFetchingCategories={isFetchingCategories}
          fetchAllCategories={fetchAllCategories}
        />
        <ScopeSelector
          scope={scope}
          setScope={setScope}
          onReset={() => {
            setLastGeneratedTimestamp(null);
            onQueryGenerated('', '', false);
          }}
        />
      </div>

      {/* 2. Main Logic Canvas */}
      <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 min-h-[200px]">
        {rootGroup.children.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-300 mb-3">
              <FontAwesomeIcon icon={faFilter} />
            </div>
            <div className="text-xs font-bold text-gray-400">No logic defined. Click 'ADD FIRST FILTER' to begin.</div>
            <button
              onClick={() => updateRootGroupRecursive([], {}, 'add_rule')}
              className="mt-4 text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-lg hover:bg-blue-100 transition-all"
            >
              ADD FIRST FILTER
            </button>
          </div>
        ) : (
          <RuleGroup
            group={rootGroup}
            availableParams={availableParams}
            updateRootGroupRecursive={updateRootGroupRecursive}
            setGroupCombinator={setGroupCombinator}
          />
        )}
      </div>

      {/* 3. Reporting Parameters (Columns) */}
      <ReportingParameters
        availableParams={availableParams}
        selectedColumns={selectedColumns}
        columnSearch={columnSearch}
        setColumnSearch={setColumnSearch}
        isColumnDropdownOpen={isColumnDropdownOpen}
        setIsColumnDropdownOpen={setIsColumnDropdownOpen}
        addColumn={addColumn}
        removeColumn={removeColumn}
        updateColumnUnit={updateColumnUnit}
        rootGroup={rootGroup}
      />

      {/* 4. Footer: Generation Status & Actions */}
      <GenerationFooter
        isLoadingParams={isLoadingParams}
        isGenerating={isGenerating}
        lastGeneratedTimestamp={lastGeneratedTimestamp}
        handleGenerate={handleGenerate}
        canGenerate={(rootGroup.children.length > 0 || selectedColumns.length > 0 || !!initialState) && !isLoadingParams}
        isReplacing={!!initialState}
        hasName={!!name && name.trim().length > 0}
      />
    </div>
  );
};
