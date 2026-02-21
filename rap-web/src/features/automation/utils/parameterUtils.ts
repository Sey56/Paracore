import { ScriptParameter } from '@/types/scriptModel';

// Helper function for robust value comparison
export const areValuesEqual = (val1: unknown, val2: unknown, type?: string): boolean => {
  if (val1 === val2) return true;
  if ((val1 === null || val1 === undefined) && (val2 === null || val2 === undefined)) return true;

  if (type === 'boolean') {
    const b1 = typeof val1 === 'string' ? val1.toLowerCase() === 'true' : !!val1;
    const b2 = typeof val2 === 'string' ? val2.toLowerCase() === 'true' : !!val2;
    return b1 === b2;
  }

  if (type === 'number') {
    const EPSILON = 0.000001;
    const n1 = typeof val1 === 'string' ? parseFloat(val1) : val1 as number;
    const n2 = typeof val2 === 'string' ? parseFloat(val2) : val2 as number;
    return Math.abs((n1 || 0) - (n2 || 0)) < EPSILON;
  }

  if (Array.isArray(val1) || Array.isArray(val2)) {
    const toArr = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            return JSON.parse(trimmed) as unknown[];
          } catch (e) {
            return [];
          }
        }
      }
      return [];
    };

    const arr1 = toArr(val1);
    const arr2 = toArr(val2);

    if (arr1.length !== arr2.length) return false;
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    return sorted1.every((val, index) => val === sorted2[index]);
  }

  return String(val1) === String(val2);
};

// Helper function for deep comparison of parameters
export const areParametersEqual = (params1: ScriptParameter[], params2: ScriptParameter[]): boolean => {
  if (params1 === params2) return true;
  if (params1.length !== params2.length) return false;

  const sortedParams1 = [...params1].sort((a, b) => a.name.localeCompare(b.name));
  const sortedParams2 = [...params2].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sortedParams1.length; i++) {
    const p1 = sortedParams1[i];
    const p2 = sortedParams2[i];

    if (p1.name !== p2.name || p1.type !== p2.type) return false;

    const options1 = p1.options || [];
    const options2 = p2.options || [];
    if (options1.length !== options2.length) return false;
    if (options1.some((opt, idx) => opt !== options2[idx])) return false;

    if (!areValuesEqual(p1.value, p2.value, p1.type)) return false;
  }
  return true;
};
