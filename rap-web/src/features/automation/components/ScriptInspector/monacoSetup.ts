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

/**
 * Maps the app's theme to a Monaco theme name.
 *
 * ⚠ The app has exactly TWO themes now, so this is plain equality. The old `DARK_THEMES` set — and
 *   the "'dark' is a CSS class, not a ThemeType value" footgun documented here — is gone: `'dark'`
 *   IS a real `ThemeType` value.
 */
export function monacoThemeFor(appTheme: string | undefined): string {
  return appTheme === 'dark' ? 'vs-dark' : 'vs';
}

/**
 * ⚠ Monaco writes "Click to expand the range." / "Click to collapse the range." as a NATIVE
 *   `title` tooltip on the folding chevrons (`.cldr` divs in the margin). There is NO editor
 *   option to disable it, and inside Tauri's WebView the tooltip renders deformed.
 *
 *   The decoration options live on the `FoldingDecorationProvider` singleton, so nulling their
 *   `linesDecorationsTooltip` stops the attribute from ever reaching the DOM. This reaches into
 *   an internal (non-API) Monaco module, so it is best-effort: `MonacoReplEditor` also sweeps the
 *   rendered DOM, which covers the first paint if this async patch has not resolved yet.
 */
export async function suppressFoldingTooltips(): Promise<void> {
  try {
    // @ts-ignore — internal Monaco module, not part of the public API (no typings shipped).
    const mod = await import('monaco-editor/esm/vs/editor/contrib/folding/browser/foldingDecorations.js');
    const Provider = (mod as { FoldingDecorationProvider?: Record<string, unknown> })
      .FoldingDecorationProvider;
    if (!Provider) return;
    for (const option of Object.values(Provider)) {
      if (option && typeof option === 'object' && 'linesDecorationsTooltip' in option) {
        (option as { linesDecorationsTooltip: string | null }).linesDecorationsTooltip = null;
      }
    }
  } catch {
    /* The internal path moved — the DOM sweep in MonacoReplEditor still removes the tooltip. */
  }
}

export { monaco };
