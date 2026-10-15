/**
 * A small, dependency-free C# formatter for the REPL playground.
 *
 * ⚠ WHY NOT ROSLYN — the "real" formatter is Roslyn's `Formatter.FormatAsync`, and the REPL
 *   already has a Roslyn workspace behind `/api/repl/*`. But reaching it means a NEW gRPC method
 *   (proto + add-in service + Python client) and the engine is FROZEN, so this stays entirely
 *   client-side.
 *
 * ⚠ SCOPE — one question per line: "how deep should this be indented?" It normalises indentation
 *   from brace depth and strips trailing whitespace, and deliberately does NOTHING else: it never
 *   reflows lines, inserts/removes spaces inside expressions, splits statements or reorders
 *   members. A re-indenter can only ever make code LOOK right; it can never change what the code
 *   MEANS, which is the whole point of keeping it this small.
 */
import type * as Monaco from 'monaco-editor';
import { monaco } from './monacoSetup';

/** What `provideDocumentFormattingEdits` hands us, narrowed to what we actually read. */
export interface CSharpFormatOptions {
  tabSize?: number;
  insertSpaces?: boolean;
}

/** Per-line summary of everything the indenter needs to know. */
interface LineScan {
  /** Net `{` minus `}` on this line, counting ONLY real code (never inside a string/comment). */
  delta: number;
  /** `}` characters at the very start of the line — the line is "closing" and dedents first. */
  leadingClosers: number;
  /** True when the line ends inside an unterminated block comment. */
  endsInBlockComment: boolean;
}

/**
 * Advance past a regular (non-verbatim) string body, honouring `\` escapes.
 * Returns the index just past the closing quote, or the end of the line if unterminated.
 */
function skipQuoted(line: string, from: number, quote: string): number {
  const n = line.length;
  let i = from;
  while (i < n) {
    const c = line[i];
    if (c === '\\') { i += 2; continue; }      // \" \\ \n … never closes the literal
    if (c === quote) return i + 1;
    i++;
  }
  return n;
}

/**
 * Advance past a VERBATIM string body (`@"…"`), where `""` is an escaped quote and `\` is
 * literal — so the two scanners cannot be shared.
 */
function skipVerbatim(line: string, from: number): number {
  const n = line.length;
  let i = from;
  while (i < n) {
    if (line[i] === '"') {
      if (line[i + 1] === '"') { i += 2; continue; }   // escaped quote
      return i + 1;
    }
    i++;
  }
  return n;
}

/**
 * Scan one line of C# and report its brace effect.
 *
 * ⚠ The point is to NOT count braces that are data: `Console.WriteLine("{")` must contribute
 *   nothing, or the whole file drifts one level deeper from that line onward.
 */
function scanLine(line: string, startsInBlockComment: boolean): LineScan {
  const n = line.length;
  let delta = 0;
  let inBlock = startsInBlockComment;
  let i = 0;

  // Only a line that is NOT continuing a comment can "close" a block.
  let leadingClosers = 0;
  if (!startsInBlockComment) {
    while (leadingClosers < n && line[leadingClosers] === '}') leadingClosers++;
  }

  while (i < n) {
    const c = line[i];

    if (inBlock) {
      if (c === '*' && line[i + 1] === '/') { inBlock = false; i += 2; continue; }
      i++;
      continue;
    }

    // Comments end the line's contribution.
    if (c === '/' && line[i + 1] === '/') break;
    if (c === '/' && line[i + 1] === '*') { inBlock = true; i += 2; continue; }

    // String / char literals — skip wholesale so their braces are never counted.
    // Order matters: `$@"` and `@$"` must be tested before `@"` and `$"`.
    if (c === '$' && line[i + 1] === '@' && line[i + 2] === '"') { i = skipVerbatim(line, i + 3); continue; }
    if (c === '@' && line[i + 1] === '$' && line[i + 2] === '"') { i = skipVerbatim(line, i + 3); continue; }
    if (c === '@' && line[i + 1] === '"') { i = skipVerbatim(line, i + 2); continue; }
    if (c === '$' && line[i + 1] === '"') { i = skipQuoted(line, i + 2, '"'); continue; }
    if (c === '"') { i = skipQuoted(line, i + 1, '"'); continue; }
    if (c === "'") { i = skipQuoted(line, i + 1, "'"); continue; }

    if (c === '{') { delta++; i++; continue; }
    if (c === '}') { delta--; i++; continue; }
    i++;
  }

  return { delta, leadingClosers, endsInBlockComment: inBlock };
}

/**
 * Re-indent `source` from brace depth.
 *
 * ⚠ Returns the input UNCHANGED (byte for byte) when nothing needs to move, so the caller can
 *   skip the edit entirely and the undo stack stays clean on an already-formatted buffer.
 */
export function formatCSharp(source: string, options: CSharpFormatOptions = {}): string {
  const tabSize = options.tabSize && options.tabSize > 0 ? options.tabSize : 4;
  const unit = options.insertSpaces === false ? '\t' : ' '.repeat(tabSize);

  // Split on any line ending; we always re-emit '\n' (the model normalises on its own).
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  const out: string[] = [];
  let depth = 0;
  let inBlockComment = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Blank line — keep it blank (a trimmed blank is just ""), and let it carry no indentation.
    if (trimmed === '') { out.push(''); continue; }

    const scan = scanLine(trimmed, inBlockComment);
    inBlockComment = scan.endsInBlockComment;

    // A line that starts with `}` belongs to the ENCLOSING block, so it dedents before printing.
    const lineDepth = Math.max(0, depth - scan.leadingClosers);
    out.push(unit.repeat(lineDepth) + trimmed);

    // …and only THEN does the line's net effect move the depth for the following lines.
    depth = Math.max(0, depth + scan.delta);
  }

  return out.join('\n');
}

let formatRegistered = false;

/**
 * Registers the C# document formatter with Monaco. Idempotent, like the completion/hover
 * providers — Monaco providers are global, so this is registered once however often the editor
 * mounts. Once registered, Monaco's built-in "Format Document" (Shift+Alt+F and the context
 * menu) works with no extra wiring.
 */
export function registerReplFormatProvider(): void {
  if (formatRegistered) return;
  formatRegistered = true;

  monaco.languages.registerDocumentFormattingEditProvider('csharp', {
    provideDocumentFormattingEdits(
      model: Monaco.editor.ITextModel,
      options: Monaco.languages.FormattingOptions,
    ) {
      const original = model.getValue();
      const formatted = formatCSharp(original, options);

      // No-op when already formatted — an empty edit list means Monaco does not even open an
      // undo step, so pressing Format on tidy code is invisible rather than a phantom change.
      if (formatted === original) return [];

      // Whole-document replace: Monaco maps the cursor through the edit, and the user gets a
      // single Ctrl+Z to undo the whole format.
      return [{ range: model.getFullModelRange(), text: formatted }];
    },
  });
}
