import type { ScriptParameter } from '@/types/scriptModel';

/**
 * Evaluates a visibility condition for a parameter
 * @param condition - The condition string (e.g., "creationMode == 'Grid'" or just "ShowAdvanced")
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
        // No operator found - treat as a simple boolean property reference
        // e.g., "ShowAdvanced" means "visible when ShowAdvanced is true"
        const paramName = condition.trim();
        const param = allParams.find(p => p.name === paramName);
        if (!param) {
            return true; // If referenced param doesn't exist, default to visible
        }
        // Evaluate truthiness: true, "true", "True", non-empty strings, non-zero numbers
        const val = param.value;
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') return val.toLowerCase() === 'true';
        if (typeof val === 'number') return val !== 0;
        return false;
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
        // Only check legacy visibleWhen for hiding
        return evaluateVisibilityCondition(p.visibleWhen, params);
    });
};

/**
 * Determines if a parameter should be enabled based on its condition
 */
export const isParameterEnabled = (param: ScriptParameter, allParams: ScriptParameter[]): boolean => {
    if (param.enabledWhenParam && param.enabledWhenValue !== undefined && param.enabledWhenValue !== "") {
        const targetParam = allParams.find(tp => tp.name === param.enabledWhenParam);
        if (targetParam) {
            return String(targetParam.value) === String(param.enabledWhenValue);
        }
    }
    return true;
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

        if ((p.required || p.pattern) && valStr === '') {
            errors.push(`- '${p.name}' is required`);
        }

        if (p.pattern && valStr !== '') {
            if (p.inputType === 'File' || p.inputType === 'SaveFile') {
                // File extension validation (e.g., "*.jpg;*.png" or "jpg,png")
                const extensions = p.pattern.split(/[,;]/)
                    .map(ext => ext.replace('*', '').replace('.', '').toLowerCase().trim())
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
                        // V3 Enhancement: If the pattern is a simple anchored string (like ^APPLY$), 
                        // extract the word and show a helpful hint.
                        const match = p.pattern.match(/^\^([a-zA-Z0-9_-]+)\$$/);
                        if (match) {
                            errors.push(`- '${p.name}' must be exactly: ${match[1]}`);
                        } else {
                            errors.push(`- '${p.name}' format is invalid`);
                        }
                    }
                } catch (e) {
                    console.error(`Invalid regex pattern for parameter ${p.name}:`, p.pattern);
                }
            }
        }
    });
    return errors;
};
