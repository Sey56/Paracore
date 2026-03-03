import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/api/axios';
import { ParameterDefinition, QueryRule, QueryGroup, OPERATORS } from '../types/queryBuilderTypes';

export const useQueryBuilderLogic = (
  onQueryGenerated: (logic: string, params: string, isCompiled: boolean) => void,
  initialState?: {
    category: string;
    rootGroup: QueryGroup;
    selectedColumns: QueryRule[];
    scope?: 'project' | 'selection';
  },
  onConfigChange?: (config: { category: string, rootGroup: QueryGroup, selectedColumns: QueryRule[], scope: string }) => void,
  isWatchdog: boolean = false,
  name?: string,
  description?: string
) => {
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
      onConfigChange({ category, rootGroup, selectedColumns, scope });
    }
  }, [category, rootGroup, selectedColumns, scope, onConfigChange]);

  useEffect(() => {
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

  const updateRootGroupRecursive = useCallback((path: number[], updates: any, action: 'update' | 'remove' | 'add_rule' | 'add_group' | 'move_up' | 'move_down') => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    const newRoot = JSON.parse(JSON.stringify(rootGroup));
    let current = newRoot;
    const depth = (action === 'update' || action === 'remove' || action === 'move_up' || action === 'move_down') ? path.length - 1 : path.length;
    for (let i = 0; i < depth; i++) current = current.children[path[i]];
    const index = path[path.length - 1];

    if (action === 'update') {
      current.children[index] = { ...current.children[index], ...updates };
      if (updates && updates.name && current.children[index].type === 'rule') {
        const pDef = availableParams.find(p => p.name === updates.name);
        if (pDef) {
          const rule = current.children[index] as QueryRule;
          rule.displayName = pDef.displayName;
          rule.storage_type = pDef.storage_type;
          rule.is_builtin = pDef.is_builtin;
          rule.builtin_id = pDef.builtin_id;
          rule.builtin_name = pDef.builtin_name;
          rule.revit_element_type = pDef.revit_element_type;
          rule.spec_type_id = pDef.spec_type_id;
          rule.is_type = pDef.is_type;
          rule.operator = OPERATORS[pDef.storage_type] ? OPERATORS[pDef.storage_type][0] : '==';
          rule.value = pDef.storage_type === 'String' ? '' : '0';
          rule.unit = undefined;
        }
      }
    } else if (action === 'remove') current.children.splice(index, 1);
    else if (action === 'add_rule') {
      const firstParam = availableParams[0];
      if (firstParam) current.children.push({
        type: 'rule', name: firstParam.name, displayName: firstParam.displayName, storage_type: firstParam.storage_type,
        operator: OPERATORS[firstParam.storage_type][0], value: firstParam.storage_type === 'String' ? '' : '0',
        is_builtin: firstParam.is_builtin, builtin_id: firstParam.builtin_id,
        builtin_name: firstParam.builtin_name, revit_element_type: firstParam.revit_element_type,
        spec_type_id: firstParam.spec_type_id, is_type: firstParam.is_type,
      });
    }
 else if (action === 'add_group') current.children.push({ type: 'group', combinator: 'AND', children: [] });
    else if (action === 'move_up' && index > 0) [current.children[index], current.children[index - 1]] = [current.children[index - 1], current.children[index]];
    else if (action === 'move_down' && index < current.children.length - 1) [current.children[index], current.children[index + 1]] = [current.children[index + 1], current.children[index]];
    setRootGroup(newRoot);
  }, [rootGroup, availableParams, onQueryGenerated]);

  const addColumn = useCallback((param: ParameterDefinition) => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    setSelectedColumns(prev => [...prev, {
      type: 'rule', name: param.name, displayName: param.displayName, storage_type: param.storage_type, operator: '==', value: '',
      is_builtin: param.is_builtin, builtin_id: param.builtin_id, builtin_name: param.builtin_name,
      revit_element_type: param.revit_element_type, unit: undefined, spec_type_id: param.spec_type_id,
      is_type: param.is_type
    }]);
    setColumnSearch('');
    setIsColumnDropdownOpen(false);
  }, [onQueryGenerated]);

  const removeColumn = useCallback((name: string) => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    setSelectedColumns(prev => prev.filter(c => c.name !== name));
  }, [onQueryGenerated]);

  const updateColumnUnit = useCallback((name: string, unit: string | undefined) => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    setSelectedColumns(prev => prev.map(c => c.name === name ? { ...c, unit } : c));
  }, [onQueryGenerated]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setLastGeneratedTimestamp(null);
    try {
      const mappedColumns = selectedColumns.map(col => ({
        type: 'rule', name: col.name, displayName: col.displayName, storage_type: col.storage_type, operator: '==', value: '',
        is_builtin: col.is_builtin, builtin_id: col.builtin_id, builtin_name: col.builtin_name,
        revit_element_type: col.revit_element_type, unit: col.unit, spec_type_id: col.spec_type_id,
        is_type: col.is_type
      }));

      const response = await api.post('/api/query/generate', {
        category_name: category,
        root_group: rootGroup,
        selected_columns: mappedColumns,
        scope: scope,
        is_watchdog: isWatchdog,
        name: name,
        description: description
      });

      if (response.data.logic !== undefined && response.data.params !== undefined) {
        onQueryGenerated(response.data.logic, response.data.params, true);
        setLastGeneratedTimestamp(Date.now());
      }
    } catch (err) {
      console.error("Failed to generate query code:", err);
      onQueryGenerated('', '', false);
    } finally { setIsGenerating(false); }
  };

  const setGroupCombinator = useCallback((path: number[], combinator: 'AND' | 'OR') => {
    setLastGeneratedTimestamp(null);
    onQueryGenerated('', '', false);
    const newRoot = JSON.parse(JSON.stringify(rootGroup));
    let target = newRoot;
    for (const p of path) target = target.children[p];
    target.combinator = combinator;
    setRootGroup(newRoot);
  }, [rootGroup, onQueryGenerated]);

  return {
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
  };
};
