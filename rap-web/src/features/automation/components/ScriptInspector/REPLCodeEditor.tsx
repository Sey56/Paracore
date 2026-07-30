import React, { useCallback, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { autocompletion, type Completion } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { useTheme } from '@/context/ThemeContext';

interface REPLCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  onSave?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const csharpLanguage = StreamLanguage.define(csharp);

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#569cd6' },
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.number, color: '#b5cea8' },
  { tag: tags.typeName, color: '#4ec9b0' },
  { tag: tags.className, color: '#4ec9b0' },
  { tag: tags.function(tags.variableName), color: '#dcdcaa' },
  { tag: tags.definition(tags.variableName), color: '#9cdcfe' },
  { tag: tags.operator, color: '#d4d4d4' },
  { tag: tags.punctuation, color: '#d4d4d4' },
  { tag: tags.bracket, color: '#d4d4d4' },
  { tag: tags.meta, color: '#d4d4d4' },
]);

const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000ff' },
  { tag: tags.comment, color: '#008000', fontStyle: 'italic' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.typeName, color: '#267f99' },
  { tag: tags.className, color: '#267f99' },
  { tag: tags.function(tags.variableName), color: '#795e26' },
  { tag: tags.definition(tags.variableName), color: '#001080' },
  { tag: tags.operator, color: '#000000' },
  { tag: tags.punctuation, color: '#000000' },
  { tag: tags.bracket, color: '#000000' },
  { tag: tags.meta, color: '#000000' },
]);

// ── Paracore + Revit API autocomplete ──
const paracoreCompletions: Completion[] = [
  { label: 'GetElements', type: 'function', detail: 'Paracore', info: 'Get all elements of a type. Usage: GetElements<Wall>("Name")' },
  { label: 'GetStr', type: 'function', detail: 'Element extension', info: 'Get parameter value as string. Usage: element.GetStr("ParameterName")' },
  { label: 'GetNum', type: 'function', detail: 'Element extension', info: 'Get parameter value as double. Usage: element.GetNum("Length", "m")' },
  { label: 'GetInt', type: 'function', detail: 'Element extension', info: 'Get parameter value as integer. Usage: element.GetInt("Count")' },
  { label: 'GetVal', type: 'function', detail: 'Element extension', info: 'Get formatted parameter value. Usage: element.GetVal("Area")' },
  { label: 'Transact', type: 'function', detail: 'Paracore', info: 'Wrap changes in a Revit transaction. Usage: Transact(() => { ... })' },
  { label: 'TransactAsync', type: 'function', detail: 'Paracore', info: 'Async transaction wrapper.' },
  { label: 'PickObject', type: 'function', detail: 'Paracore', info: 'Pick an element in the Revit view.' },
  { label: 'ShowNotification', type: 'function', detail: 'Paracore', info: 'Show a Revit notification.' },
  { label: 'Params', type: 'class', detail: 'Paracore', info: 'Auto-generate parameter UI from properties.' },
  { label: 'FilteredElementCollector', type: 'class', detail: 'Revit API', info: 'Collect and filter elements.' },
  { label: 'BuiltInCategory', type: 'enum', detail: 'Revit API', info: 'Built-in Revit categories.' },
  { label: 'BuiltInParameter', type: 'enum', detail: 'Revit API', info: 'Built-in Revit parameters.' },
  { label: 'Wall', type: 'class', detail: 'Revit API', info: 'Revit Wall element' },
  { label: 'Floor', type: 'class', detail: 'Revit API', info: 'Revit Floor element' },
  { label: 'FamilyInstance', type: 'class', detail: 'Revit API', info: 'Revit family instance' },
  { label: 'FamilySymbol', type: 'class', detail: 'Revit API', info: 'Revit family type/symbol' },
  { label: 'Level', type: 'class', detail: 'Revit API', info: 'Revit Level element' },
  { label: 'View', type: 'class', detail: 'Revit API', info: 'Revit View element' },
  { label: 'ViewPlan', type: 'class', detail: 'Revit API', info: 'Revit plan view' },
  { label: 'View3D', type: 'class', detail: 'Revit API', info: 'Revit 3D view' },
  { label: 'Element', type: 'class', detail: 'Revit API', info: 'Base Revit element class' },
  { label: 'ElementId', type: 'class', detail: 'Revit API', info: 'Revit element identifier' },
  { label: 'Document', type: 'class', detail: 'Revit API', info: 'Revit document' },
  { label: 'UIDocument', type: 'class', detail: 'Revit API', info: 'Revit UI document' },
  { label: 'XYZ', type: 'class', detail: 'Revit API', info: '3D point/vector' },
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
  { label: 'get_Parameter', type: 'method', detail: 'Element', info: 'Get parameter by BuiltInParameter.' },
  { label: 'LookupParameter', type: 'method', detail: 'Element', info: 'Get parameter by name.' },
  { label: 'get_Geometry', type: 'method', detail: 'Element', info: 'Get element geometry.' },
  { label: 'LevelId', type: 'property', detail: 'Element', info: 'Level ID of the element' },
  { label: 'Category', type: 'property', detail: 'Element', info: 'Category of the element' },
  { label: 'var', type: 'keyword', detail: 'C#', info: 'Implicitly typed variable' },
  { label: 'using', type: 'keyword', detail: 'C#', info: 'Import namespace or dispose pattern' },
  { label: 'foreach', type: 'keyword', detail: 'C#', info: 'Iterate over collection' },
  { label: 'List', type: 'class', detail: 'System.Collections.Generic', info: 'Generic list' },
  { label: 'Dictionary', type: 'class', detail: 'System.Collections.Generic', info: 'Key-value dictionary' },
  { label: 'string', type: 'type', detail: 'C#', info: 'String type' },
  { label: 'int', type: 'type', detail: 'C#', info: '32-bit integer' },
  { label: 'double', type: 'type', detail: 'C#', info: 'Double-precision float' },
  { label: 'bool', type: 'type', detail: 'C#', info: 'Boolean' },
  { label: 'void', type: 'type', detail: 'C#', info: 'No return type' },
  { label: 'Where', type: 'keyword', detail: 'LINQ', info: 'LINQ filter' },
  { label: 'Select', type: 'keyword', detail: 'LINQ', info: 'LINQ projection' },
  { label: 'FirstOrDefault', type: 'keyword', detail: 'LINQ', info: 'First element or default' },
  { label: 'OrderBy', type: 'keyword', detail: 'LINQ', info: 'LINQ ordering' },
  { label: 'ToList', type: 'keyword', detail: 'LINQ', info: 'Convert to List' },
];

function paracoreAutocomplete() {
  return autocompletion({
    override: [(_context) => {
      return { from: 0, options: paracoreCompletions, validFor: () => true };
    }],
    activateOnTyping: true,
    closeOnBlur: true,
    defaultKeymap: true,
  });
}

export const REPLCodeEditor = React.forwardRef<HTMLTextAreaElement, REPLCodeEditorProps>(({
  value,
  onChange,
  onRun,
  onSave,
  disabled = false,
  placeholder = "Write your code here...",
}, _ref) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  const handleChange = useCallback((val: string) => { onChange(val); }, [onChange]);

  const runKeymap: readonly KeyBinding[] = useMemo(() => [
    ...(onRun ? [
      { key: 'Ctrl-Enter', run: () => { onRun(); return true; }, preventDefault: true },
      { key: 'Cmd-Enter', run: () => { onRun(); return true; }, preventDefault: true },
    ] : []),
    ...(onSave ? [
      { key: 'Ctrl-s', run: () => { onSave(); return true; }, preventDefault: true },
      { key: 'Cmd-s', run: () => { onSave(); return true; }, preventDefault: true },
    ] : []),
  ], [onRun, onSave]);

  const extensions = useMemo(() => [
    csharpLanguage,
    syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
    EditorView.lineWrapping,
    Prec.highest(keymap.of(runKeymap)),
    paracoreAutocomplete(),
    ...(isDark ? [oneDark] : []),
    EditorView.theme({
      '&': { backgroundColor: 'transparent' },
      '.cm-scroller': { backgroundColor: 'transparent' },
      '.cm-content': { backgroundColor: 'transparent' },
      '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none' },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
    }),
  ], [isDark, runKeymap]);

  const wrapperBg = isDark ? 'bg-slate-900' : 'bg-white';

  return (
    <div className={`h-full w-full overflow-hidden ${wrapperBg}`}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        theme={isDark ? 'dark' : 'light'}
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
