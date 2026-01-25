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
        result = String(actualValue) == String(expectedValueStr);
    } else if (operator === '!=') {
        result = String(actualValue) != String(expectedValueStr);
    }

    return result;
};

/**
 * Filters parameters based on their visibility conditions
 * @param params - All parameters
 * @returns Only the visible parameters
 */
export const filterVisibleParameters = (params: ScriptParameter[]): ScriptParameter[] => {
    return params.filter(p => {
        // 1. Check legacy visibleWhen
        const isVisible = evaluateVisibilityCondition(p.visibleWhen, params);
        if (!isVisible) return false;

        // 2. Check new enabledWhen (Phase 2)
        if (p.enabledWhenParam && p.enabledWhenValue !== undefined && p.enabledWhenValue !== "") {
            const targetParam = params.find(tp => tp.name === p.enabledWhenParam);
            if (targetParam) {
                return String(targetParam.value) === String(p.enabledWhenValue);
            }
        }

        return true;
    });
};

/**
 * Validates parameters according to their `required` and `pattern` attributes.
 * @param params - The parameters to validate (should be visible params).
 * @returns An array of validation error strings. Empty if all valid.
 */
export const validateParameters = (params: ScriptParameter[]): string[] => {
    const errors: string[] = [];
    params.forEach(p => {
        const valStr = p.value === undefined || p.value === null ? '' : String(p.value).trim();

        if (p.required && valStr === '') {
            errors.push(`- '${p.name}' is required`);
        }

        if (p.pattern && valStr !== '') {
            if (p.inputType === 'File' || p.inputType === 'SaveFile') {
                // File extension validation (e.g., "*.jpg;*.png")
                const extensions = p.pattern.split(';')
                    .map(ext => ext.replace('*', '').toLowerCase().trim())
                    .filter(ext => ext !== '');

                const valLower = valStr.toLowerCase();
                const isValid = extensions.some(ext => valLower.endsWith(ext));

                if (!isValid) {
                    errors.push(`- '${p.name}' must match: ${p.pattern}`);
                }
            } else {
                // Standard Regex validation
                try {
                    if (!new RegExp(p.pattern).test(valStr)) {
                        errors.push(`- '${p.name}' format is invalid`);
                    }
                } catch (e) {
                    console.error(`Invalid regex pattern for parameter ${p.name}:`, p.pattern);
                }
            }
        }
    });
    return errors;
};
