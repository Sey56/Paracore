import React, { useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { autocompletion, type Completion } from '@codemirror/autocomplete';

interface REPLCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRun?: () => void;
  onSave?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const csharpLanguage = StreamLanguage.define(csharp);

// ── Paracore + Revit API autocomplete source ──
const paracoreCompletions: Completion[] = [
  // ── Paracore Globals ──
  { label: 'GetElements', type: 'function', detail: 'Paracore', info: 'Get all elements of a type. Usage: GetElements<Wall>("Name")' },
  { label: 'GetStr', type: 'function', detail: 'Element extension', info: 'Get parameter value as string. Usage: element.GetStr("ParameterName")' },
  { label: 'GetNum', type: 'function', detail: 'Element extension', info: 'Get parameter value as double. Usage: element.GetNum("Length", "m")' },
  { label: 'GetInt', type: 'function', detail: 'Element extension', info: 'Get parameter value as integer. Usage: element.GetInt("Count")' },
  { label: 'GetVal', type: 'function', detail: 'Element extension', info: 'Get formatted parameter value. Usage: element.GetVal("Area")' },
  { label: 'Transact', type: 'function', detail: 'Paracore', info: 'Wrap changes in a Revit transaction. Usage: Transact(() => { ... })' },
  { label: 'TransactAsync', type: 'function', detail: 'Paracore', info: 'Async transaction wrapper. Usage: await TransactAsync(async () => { ... })' },
  { label: 'PickObject', type: 'function', detail: 'Paracore', info: 'Pick an element in the Revit view. Usage: PickObject<Element>()' },
  { label: 'ShowNotification', type: 'function', detail: 'Paracore', info: 'Show a Revit notification. Usage: ShowNotification("Done")' },
  { label: 'Params', type: 'class', detail: 'Paracore', info: 'Auto-generate parameter UI from properties. Usage: public class Params { ... }' },
  { label: 'Watchdog', type: 'class', detail: 'Paracore', info: 'Reactive sentinel guard attribute. Usage: [Watchdog("Name", "* * * * *")]' },
  { label: 'DocumentType', type: 'keyword', detail: 'Paracore', info: 'Restrict script to document type. Usage: public DocumentType Type => "Project"' },
  { label: 'Alert', type: 'function', detail: 'Paracore', info: 'Show an alert dialog in Revit. Usage: Alert("message")' },

  // ── Revit API Types ──
  { label: 'BuiltInCategory', type: 'enum', detail: 'Revit API', info: 'Built-in Revit categories. Usage: BuiltInCategory.OST_Walls' },
  { label: 'BuiltInParameter', type: 'enum', detail: 'Revit API', info: 'Built-in Revit parameters. Usage: BuiltInParameter.ALL_MODEL_MARK' },
  { label: 'UnitType', type: 'enum', detail: 'Revit API', info: 'Unit types for conversion. Usage: UnitType.UT_Length' },

  // ── Revit Element Types ──
  { label: 'Wall', type: 'class', detail: 'Revit API', info: 'Revit Wall element' },
  { label: 'Floor', type: 'class', detail: 'Revit API', info: 'Revit Floor element' },
  { label: 'FamilyInstance', type: 'class', detail: 'Revit API', info: 'Revit family instance (doors, windows, furniture)' },
  { label: 'FamilySymbol', type: 'class', detail: 'Revit API', info: 'Revit family type/symbol' },
  { label: 'Level', type: 'class', detail: 'Revit API', info: 'Revit Level element' },
  { label: 'View', type: 'class', detail: 'Revit API', info: 'Revit View element' },
  { label: 'ViewPlan', type: 'class', detail: 'Revit API', info: 'Revit plan view' },
  { label: 'View3D', type: 'class', detail: 'Revit API', info: 'Revit 3D view' },
  { label: 'ViewSection', type: 'class', detail: 'Revit API', info: 'Revit section view' },
  { label: 'Element', type: 'class', detail: 'Revit API', info: 'Base Revit element class' },
  { label: 'ElementId', type: 'class', detail: 'Revit API', info: 'Revit element identifier' },
  { label: 'Document', type: 'class', detail: 'Revit API', info: 'Revit document' },
  { label: 'UIDocument', type: 'class', detail: 'Revit API', info: 'Revit UI document' },
  { label: 'XYZ', type: 'class', detail: 'Revit API', info: '3D point/vector. Usage: new XYZ(x, y, z)' },
  { label: 'UV', type: 'class', detail: 'Revit API', info: '2D point/vector' },
  { label: 'Line', type: 'class', detail: 'Revit API', info: 'Revit geometry line' },
  { label: 'Arc', type: 'class', detail: 'Revit API', info: 'Revit geometry arc' },
  { label: 'Curve', type: 'class', detail: 'Revit API', info: 'Revit curve base class' },
  { label: 'CurveLoop', type: 'class', detail: 'Revit API', info: 'Closed curve loop' },
  { label: 'Transform', type: 'class', detail: 'Revit API', info: 'Revit geometric transform' },
  { label: 'BoundingBoxXYZ', type: 'class', detail: 'Revit API', info: 'Revit 3D bounding box' },
  { label: 'Location', type: 'class', detail: 'Revit API', info: 'Element location' },
  { label: 'LocationPoint', type: 'class', detail: 'Revit API', info: 'Point-based element location' },
  { label: 'LocationCurve', type: 'class', detail: 'Revit API', info: 'Curve-based element location' },
  { label: 'Parameter', type: 'class', detail: 'Revit API', info: 'Revit parameter' },
  { label: 'FilteredElementCollector', type: 'class', detail: 'Revit API', info: 'Collect and filter elements. Usage: new FilteredElementCollector(doc).OfClass(typeof(Wall))' },
  { label: 'ElementFilter', type: 'class', detail: 'Revit API', info: 'Base class for element filters' },
  { label: 'ElementClassFilter', type: 'class', detail: 'Revit API', info: 'Filter by element class' },
  { label: 'ElementCategoryFilter', type: 'class', detail: 'Revit API', info: 'Filter by category' },

  // ── Common Revit Element Properties ──
  { label: 'get_Parameter', type: 'method', detail: 'Element', info: 'Get parameter by BuiltInParameter. Usage: element.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)' },
  { label: 'LookupParameter', type: 'method', detail: 'Element', info: 'Get parameter by name. Usage: element.LookupParameter("Mark")' },
  { label: 'get_Geometry', type: 'method', detail: 'Element', info: 'Get element geometry. Usage: element.get_Geometry(new Options())' },
  { label: 'LevelId', type: 'property', detail: 'Element', info: 'Level ID of the element' },
  { label: 'Category', type: 'property', detail: 'Element', info: 'Category of the element' },
  { label: 'Location', type: 'property', detail: 'Element', info: 'Location of the element' },

  // ── C# Keywords ──
  { label: 'var', type: 'keyword', detail: 'C#', info: 'Implicitly typed variable' },
  { label: 'using', type: 'keyword', detail: 'C#', info: 'Import namespace or dispose pattern' },
  { label: 'foreach', type: 'keyword', detail: 'C#', info: 'Iterate over collection. Usage: foreach (var item in collection) { }' },
  { label: 'List', type: 'class', detail: 'System.Collections.Generic', info: 'Generic list. Usage: new List<T>()' },
  { label: 'Dictionary', type: 'class', detail: 'System.Collections.Generic', info: 'Key-value dictionary. Usage: new Dictionary<K,V>()' },
  { label: 'string', type: 'type', detail: 'C#', info: 'String type' },
  { label: 'int', type: 'type', detail: 'C#', info: '32-bit integer' },
  { label: 'double', type: 'type', detail: 'C#', info: 'Double-precision float' },
  { label: 'bool', type: 'type', detail: 'C#', info: 'Boolean' },
  { label: 'void', type: 'type', detail: 'C#', info: 'No return type' },
  { label: 'new', type: 'keyword', detail: 'C#', info: 'Instantiate object. Usage: new TypeName()' },
  { label: 'Where', type: 'keyword', detail: 'LINQ', info: 'LINQ filter. Usage: collection.Where(x => x.condition)' },
  { label: 'Select', type: 'keyword', detail: 'LINQ', info: 'LINQ projection. Usage: collection.Select(x => x.property)' },
  { label: 'FirstOrDefault', type: 'keyword', detail: 'LINQ', info: 'First element or default. Usage: collection.FirstOrDefault()' },
  { label: 'OrderBy', type: 'keyword', detail: 'LINQ', info: 'LINQ ordering. Usage: collection.OrderBy(x => x.key)' },
  { label: 'ToList', type: 'keyword', detail: 'LINQ', info: 'Convert to List. Usage: collection.ToList()' },
];

function paracoreAutocomplete() {
  return autocompletion({
    override: [(_context) => {
      return { from: 0, options: paracoreCompletions, validFor: (_text, _from, _to, _completion) => true };
    }],
    activateOnTyping: true,
    closeOnBlur: true,
    defaultKeymap: true,
  });
}

// ── Unified theme driven by Paracore CSS variables (works in all 3 themes) ──
const paracoreEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-main)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border-main)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-muted)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-main)',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
  },
  '.cm-tooltip-autocomplete': {
    '& .cm-completionDetail': {
      color: 'var(--text-muted)',
      fontStyle: 'normal',
    },
    '& .cm-completionInfo': {
      padding: '4px 8px',
      fontSize: '12px',
      color: 'var(--text-muted)',
    },
  },
}, { dark: false }); // dark:false means we control colors via CSS vars, not CodeMirror's dark mode

export const REPLCodeEditor = React.forwardRef<HTMLTextAreaElement, REPLCodeEditorProps>(({
  value,
  onChange,
  onKeyDown: _onKeyDown,
  onRun,
  onSave,
  disabled = false,
  placeholder = "Write your code here...",
}, _ref) => {
  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  // Ctrl+Enter to run, Ctrl+S to save
  const runKeymap: readonly KeyBinding[] = useMemo(() => [
    ...(onRun ? [
      { key: 'Ctrl-Enter', run: () => { onRun(); return true; } },
      { key: 'Cmd-Enter', run: () => { onRun(); return true; } },
    ] : []),
    ...(onSave ? [
      { key: 'Ctrl-s', run: () => { onSave(); return true; }, preventDefault: true },
      { key: 'Cmd-s', run: () => { onSave(); return true; }, preventDefault: true },
    ] : []),
  ], [onRun, onSave]);

  const extensions = useMemo(() => [
    csharpLanguage,
    EditorView.lineWrapping,
    keymap.of(runKeymap),
    paracoreAutocomplete(),
    paracoreEditorTheme,
  ], [runKeymap]);

  return (
    <div className="h-full w-full overflow-hidden">
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          indentOnInput: true,
          tabSize: 4,
          crosshairCursor: false,
          rectangularSelection: false,
        }}
        placeholder={placeholder}
        editable={!disabled}
        style={{ height: '100%', overflow: 'auto' }}
        className="custom-scrollbar"
      />
    </div>
  );
});
REPLCodeEditor.displayName = 'REPLCodeEditor';
