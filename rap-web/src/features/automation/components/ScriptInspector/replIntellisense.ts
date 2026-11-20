/**
 * REPL IntelliSense — the Monaco <-> backend bridge.
 *
 * Monaco asks; the add-in answers. The add-in compiles the buffer in an in-memory Roslyn
 * workspace that already holds the Revit + engine references, so completion resolves real
 * `Element` / `Document` members and this product's extension methods.
 *
 * ⚠ Read-only and side-effect free: the backend never executes the buffer, so this is safe
 *   to call on every keystroke.
 * ⚠ Failure is SILENT BY DESIGN. An editor convenience must degrade to "no suggestions",
 *   never to an error toast while the user is typing.
 */
import type * as Monaco from 'monaco-editor';
import api from '@/api/axios';
import { monaco } from './monacoSetup';

export interface ReplCompletionItem {
  label: string;
  insert_text: string;
  kind: string;
  detail: string;
  sort_text: string;
}

/**
 * The backend is the single authority for BOTH the suggestions and the span they
 * replace. Roslyn derives the span from the real syntax tree; the editor used to
 * re-guess it from raw line text, which silently filtered every suggestion inside
 * interpolated strings (`$"{wall.` became the replacement text `{wall.`).
 */
export interface ReplCompletionAnswer {
  items: ReplCompletionItem[];
  /** UTF-16 offsets in the buffer. 0/0 means "old add-in / no span" -> use word range. */
  rangeStart: number;
  rangeEnd: number;
}

/** Roslyn completion tag -> Monaco icon. Unknown tags fall back to Text. */
const KIND_BY_TAG: Record<string, number> = {
  Method: monaco.languages.CompletionItemKind.Method,
  ExtensionMethod: monaco.languages.CompletionItemKind.Method,
  Property: monaco.languages.CompletionItemKind.Property,
  Field: monaco.languages.CompletionItemKind.Field,
  Event: monaco.languages.CompletionItemKind.Event,
  Class: monaco.languages.CompletionItemKind.Class,
  Struct: monaco.languages.CompletionItemKind.Struct,
  Interface: monaco.languages.CompletionItemKind.Interface,
  Enum: monaco.languages.CompletionItemKind.Enum,
  EnumMember: monaco.languages.CompletionItemKind.EnumMember,
  Delegate: monaco.languages.CompletionItemKind.Function,
  Namespace: monaco.languages.CompletionItemKind.Module,
  Module: monaco.languages.CompletionItemKind.Module,
  Local: monaco.languages.CompletionItemKind.Variable,
  Parameter: monaco.languages.CompletionItemKind.Variable,
  RangeVariable: monaco.languages.CompletionItemKind.Variable,
  Constant: monaco.languages.CompletionItemKind.Constant,
  Keyword: monaco.languages.CompletionItemKind.Keyword,
  Operator: monaco.languages.CompletionItemKind.Operator,
  TypeParameter: monaco.languages.CompletionItemKind.TypeParameter,
  Label: monaco.languages.CompletionItemKind.Text,
};

/**
 * Monotonic request counter. Completion fires on every keystroke, so responses can arrive
 * out of order; only the newest request's answer is allowed through. This is the cheap
 * equivalent of a cancellation token across the HTTP hop.
 */
let requestSeq = 0;
let completionTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Completion fires on every keystroke (quickSuggestions + trigger chars). Without
 * debouncing, a slow backend answer is discarded by the seq check below before the
 * user ever sees it. Coalesce a burst of keystrokes into ONE request at the end.
 */
function fetchReplCompletions(code: string, caretOffset: number): Promise<ReplCompletionAnswer> {
  const seq = ++requestSeq;
  if (completionTimer !== undefined) clearTimeout(completionTimer);
  const empty: ReplCompletionAnswer = { items: [], rangeStart: 0, rangeEnd: 0 };

  return new Promise((resolve) => {
    completionTimer = setTimeout(async () => {
      if (seq !== requestSeq) return resolve(empty);
      try {
        const res = await api.post('/api/repl/completions', {
          code,
          caret_offset: caretOffset,
          session_id: 'global',
        });
        if (seq !== requestSeq) return resolve(empty);
        const ok = Boolean(res.data?.is_success);
        const items = ok ? ((res.data.items ?? []) as ReplCompletionItem[]) : [];
        const rangeStart = Number(res.data?.range_start ?? 0);
        const rangeEnd = Number(res.data?.range_end ?? 0);
        // No per-keystroke console logging: completion runs constantly, and a
        // chatty devtools console costs CPU on exactly the machine we are trying
        // to keep cool. Failures stay silent by design (see file header).
        return resolve({ items, rangeStart, rangeEnd });
      } catch {
        return resolve(empty);
      }
    }, 120);
  });
}

// ---------------------------------------------------------------------------
// NO client-side syntax guessing here. Roslyn decides the replacement span and
// sends it in the response. Any line-scan version of "am I inside a string?"
// will disagree with the parser inside `$"{...}"` and filter out real members.
// ---------------------------------------------------------------------------

let registered = false;

/**
 * Registers the C# completion provider with Monaco. Idempotent — the provider is global to
 * the editor, so it is registered once no matter how many times the REPL editor mounts.
 */
export function registerReplCompletionProvider(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider('csharp', {
    // `"` opens the string arguments we know how to fill; `.` is Roslyn's.
    triggerCharacters: ['.', '"'],
    provideCompletionItems: async (model, position) => {
      const answer = await fetchReplCompletions(
        model.getValue(),
        model.getOffsetAt(position),
      );

      // Use Roslyn's span verbatim. A span is usable whenever it is non-empty and
      // inside the buffer — INCLUDING start offset 0, which is where the very first
      // word in an empty REPL buffer begins. The old `rangeStart > 0` guard rejected
      // that case, silently turning `G` into a zero-width range, so `typed` came
      // back empty and no DSL name could be matched.
      const bufferLength = model.getValueLength();
      const hasSpan =
        answer.rangeEnd > answer.rangeStart &&
        answer.rangeStart >= 0 &&
        answer.rangeEnd <= bufferLength;
      const range = hasSpan
        ? monaco.Range.fromPositions(
            model.getPositionAt(answer.rangeStart),
            model.getPositionAt(answer.rangeEnd),
          )
        : monaco.Range.fromPositions(position, position);

      // Roslyn hands back its ENTIRE candidate set (thousands of items, with Roslyn's
      // own opaque sort keys). Monaco re-ranks that set by its own fuzzy scorer, which
      // is how `Get` ended up showing E-names. Filter by the exact text inside the
      // parser-provided range, and supply explicit filter/sort keys so Monaco has
      // nothing left to guess. This is not syntax inference — the span is Roslyn's.
      const typed = range.isEmpty() ? '' : model.getValueInRange(range).trim().toLowerCase();
      const matched = typed
        ? answer.items.filter((i) => i.label.toLowerCase().startsWith(typed))
        : answer.items;
      // Cap guards the pathological Roslyn "everything" list (~5100 items when a bare
      // identifier is completed). It must NOT truncate a finite curated domain catalog:
      // GetElements("") returns all ~590 Revit categories, alphabetically sorted — a 400
      // cap cut everything from 'Q' onward, so "Walls" vanished while "PierWalls" survived.
      // 2000 clears every curated catalog (categories and per-category parameters) while
      // still bounding the Roslyn case. Explicit filterText/sortText below already stop
      // Monaco re-ranking, so this is only a size guard, not a relevance mechanism.
      const visible = matched.slice(0, 2000);

      return {
        suggestions: visible.map((item, index) => ({
          label: item.label,
          kind: KIND_BY_TAG[item.kind] ?? monaco.languages.CompletionItemKind.Text,
          insertText: item.insert_text || item.label,
          detail: item.detail || undefined,
          // Explicit keys: Monaco must filter on the label we chose and keep
          // Roslyn's order, not invent its own ranking.
          filterText: item.label,
          sortText: String(index).padStart(4, '0'),
          range,
        })),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Diagnostics (red squiggles)
// ---------------------------------------------------------------------------

export interface ReplDiagnostic {
  start_line: number;    // 1-based, in the user's buffer
  start_column: number;  // 1-based
  end_line: number;      // 1-based
  end_column: number;    // 1-based
  message: string;
  severity: string;      // "Error", "Warning", …
}

/** Owner tag for the markers, so clearing them never touches another feature's markers. */
const MARKER_OWNER = 'paracore-roslyn';

const MARKER_SEVERITY: Record<string, number> = {
  Error: monaco.MarkerSeverity.Error,
  Warning: monaco.MarkerSeverity.Warning,
  Info: monaco.MarkerSeverity.Info,
};

/**
 * Compiles `code` and paints the result as editor markers.
 *
 * ⚠ Requested on IDLE (the caller debounces), never per keystroke: a full compilation is
 *   far heavier than a completion query, and squiggles arriving a moment late is fine.
 * ⚠ An empty result CLEARS the markers — that is the contract that makes a fixed error
 *   disappear.
 */
export async function refreshReplDiagnostics(
  model: Monaco.editor.ITextModel,
  code: string,
): Promise<void> {
  const diagnostics = await fetchReplDiagnostics(code);

  // The editor may have been torn down while the request was in flight.
  if (model.isDisposed()) return;

  monaco.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    diagnostics.map((d) => ({
      startLineNumber: d.start_line,
      startColumn: d.start_column,
      endLineNumber: d.end_line,
      endColumn: d.end_column,
      message: d.message,
      severity: MARKER_SEVERITY[d.severity] ?? monaco.MarkerSeverity.Warning,
    })),
  );
}

async function fetchReplDiagnostics(code: string): Promise<ReplDiagnostic[]> {
  try {
    const res = await api.post('/api/repl/diagnostics', {
      code,
      session_id: 'global',
    });
    if (!res.data?.is_success) return [];
    return (res.data.items ?? []) as ReplDiagnostic[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hover (symbol documentation)
// ---------------------------------------------------------------------------

export interface ReplHoverInfo {
  signature: string;
  documentation: string;
  kind: string;
  start_line: number;    // 1-based, in the user's buffer
  start_column: number;  // 1-based
  end_line: number;      // 1-based
  end_column: number;    // 1-based
}

/**
 * Own counter, deliberately NOT shared with completions: hover fires as the mouse moves,
 * and letting it bump the completion sequence would cancel an in-flight suggestion list
 * that the user is still reading.
 */
let hoverSeq = 0;

async function fetchReplHover(code: string, caretOffset: number): Promise<ReplHoverInfo | null> {
  const seq = ++hoverSeq;
  try {
    const res = await api.post('/api/repl/hover', {
      code,
      caret_offset: caretOffset,
      session_id: 'global',
    });
    if (seq !== hoverSeq) return null;          // superseded — the mouse moved on
    if (!res.data?.is_success) return null;
    return (res.data.info ?? null) as ReplHoverInfo | null;
  } catch {
    // Never surface a hover failure — see the file header.
    return null;
  }
}

let hoverRegistered = false;

/**
 * Registers the C# hover provider with Monaco. Idempotent, same as the completion provider.
 *
 * ⚠ `null` is the correct answer for "nothing here" — Monaco then shows no tooltip at all.
 * Returning an empty hover object would render an empty box wherever the mouse rests.
 */
export function registerReplHoverProvider(): void {
  if (hoverRegistered) return;
  hoverRegistered = true;

  monaco.languages.registerHoverProvider('csharp', {
    provideHover: async (model, position) => {
      const info = await fetchReplHover(model.getValue(), model.getOffsetAt(position));
      if (!info || !info.signature) return null;

      // Highlight exactly the symbol the tooltip describes, not the whole line.
      const range = new monaco.Range(
        info.start_line,
        info.start_column,
        info.end_line,
        info.end_column,
      );

      // Signature as code, documentation as prose. A symbol with no documentation still
      // shows its signature — an empty tooltip would read as a broken feature.
      const contents: { value: string }[] = [
        { value: '```csharp\n' + info.signature + '\n```' },
      ];
      if (info.documentation) {
        contents.push({ value: info.documentation });
      }

      return { range, contents };
    },
  });
}
