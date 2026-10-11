/**
 * Monaco bootstrap for the REPL playground.
 *
 * ⚠ Why `monaco-editor` (editor.main) and not the leaner `editor.api`:
 *   the suggestion widget that completions render into is a CONTRIBUTION, not part of
 *   the API surface. `editor.api` alone gives you a text box that accepts completion
 *   registrations and never shows them.
 *
 * ⚠ Why only ONE worker: the REPL's intelligence is our own Roslyn backend, not Monaco's.
 *   The editor still needs a web worker for its own services, but no *language* worker is
 *   ever created — the only language this editor opens is `csharp`, which in Monaco is a
 *   basic-language (tokenizer only) with no worker behind it.
 */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Module scope on purpose: any module that imports monaco THROUGH here must get a
// configured worker environment, or Monaco throws on the first create().
(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

/** Monaco's dark themes; anything else is treated as light. */
const DARK_THEMES = new Set(['dark', 'midnight', 'eclipse']);

/** Maps the app's theme name to a Monaco theme name. */
export function monacoThemeFor(appTheme: string | undefined): string {
  return appTheme && DARK_THEMES.has(appTheme) ? 'vs-dark' : 'vs';
}

export { monaco };
