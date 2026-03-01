export interface ParameterDefinition {
  name: string;
  storage_type: string;
  is_builtin: boolean;
  builtin_id: number;
  builtin_name?: string;
  revit_element_type?: string;
  spec_type_id?: string;
  is_type: boolean;
}

export interface QueryRule {
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
  is_type: boolean;
}

export interface QueryGroup {
  type: 'group';
  combinator: 'AND' | 'OR';
  children: (QueryRule | QueryGroup)[];
}

export const OPERATORS: Record<string, string[]> = {
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

export const getAvailableUnits = (specId?: string) => {
  if (!specId || typeof specId !== 'string') return [];
  const sid = specId.toLowerCase();
  if (sid.includes('length') || sid.includes('distance')) return UNIT_GROUPS.length;
  if (sid.includes('area')) return UNIT_GROUPS.area;
  if (sid.includes('volume')) return UNIT_GROUPS.volume;
  return [];
};
