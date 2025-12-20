import type { ScriptParameter } from '@/types/scriptModel';

/**
 * Evaluates a visibility condition for a parameter
 * @param condition - The condition string (e.g., "creationMode == 'Grid'")
 * @param allParams - All parameters to evaluate against
 * @returns true if the parameter should be visible, false otherwise
 */
export const evaluateVisibilityCondition = (
    condition: string | undefined,
    allParams: ScriptParameter[]
): boolean => {
    if (!condition) return true;

    const operators = ['==', '!='];
    const operator = operators.find(op => condition.includes(op));

    if (!operator) {
        return true;
    }

    const parts = condition.split(operator);
    if (parts.length !== 2) {
        return true;
    }

    const paramName = parts[0].trim();
    let expectedValueStr = parts[1].trim();

    if ((expectedValueStr.startsWith("'") && expectedValueStr.endsWith("'")) || (expectedValueStr.startsWith('"') && expectedValueStr.endsWith('"'))) {
        expectedValueStr = expectedValueStr.substring(1, expectedValueStr.length - 1);
    }

    const param = allParams.find(p => p.name === paramName);
    if (!param) {
        return true;
    }

    const actualValue = param.value;
    let result = false;

    if (operator === '==') {
        result = actualValue == expectedValueStr;
    } else if (operator === '!=') {
        result = actualValue != expectedValueStr;
    }

    return result;
};

/**
 * Filters parameters based on their visibility conditions
 * @param params - All parameters
 * @returns Only the visible parameters
 */
export const filterVisibleParameters = (params: ScriptParameter[]): ScriptParameter[] => {

    const visible = params.filter(p => {
        const isVisible = evaluateVisibilityCondition(p.visibleWhen, params);
        return isVisible;
    });
    return visible;
};
