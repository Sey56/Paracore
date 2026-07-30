import { useEffect, useCallback } from 'react';

export type ShortcutAction =
  | 'command-palette'
  | 'toggle-sidebar'
  | 'toggle-inspector'
  | 'run-script'
  | 'focus-search'
  | 'toggle-layout-swap'
  | 'cycle-theme'
  | 'open-settings'
  | 'view-gallery'
  | 'view-repl'
  | 'view-playlists';

type ModKey = 'mod' | 'shift' | 'alt';

interface ShortcutDef {
  key: string;
  mod?: ModKey;
  shift?: boolean;
  alt?: boolean;
  label: string;
}

export const SHORTCUTS: Record<ShortcutAction, ShortcutDef> = {
  'command-palette':  { key: 'k', mod: 'mod', label: 'Command Palette' },
  'toggle-sidebar':   { key: 'b', mod: 'mod', label: 'Toggle Sidebar' },
  'toggle-inspector': { key: 'j', mod: 'mod', label: 'Toggle Inspector' },
  'run-script':       { key: 'Enter', mod: 'mod', label: 'Run Script' },
  'focus-search':     { key: 'f', mod: 'mod', shift: true, label: 'Focus Search' },
  'toggle-layout-swap': { key: 'l', mod: 'mod', shift: true, label: 'Swap Panels' },
  'cycle-theme':      { key: 't', mod: 'mod', shift: true, label: 'Cycle Theme' },
  'open-settings':    { key: ',', mod: 'mod', label: 'Settings' },
  'view-gallery':     { key: '1', mod: 'mod', label: 'Gallery View' },
  'view-repl':        { key: '2', mod: 'mod', label: 'REPL View' },
  'view-playlists':   { key: '3', mod: 'mod', label: 'Playlists View' },
};

function modKey(): 'metaKey' | 'ctrlKey' {
  // On Mac, use Cmd; on Windows/Linux, use Ctrl
  return navigator.platform.toLowerCase().includes('mac') ? 'metaKey' : 'ctrlKey';
}

function matchesShortcut(e: KeyboardEvent, def: ShortcutDef): boolean {
  const mod = modKey();
  const keyMatch = e.key.toLowerCase() === def.key.toLowerCase();

  if (def.mod === 'mod') {
    if (def.shift) return keyMatch && e[mod] && e.shiftKey;
    return keyMatch && e[mod];
  }
  if (def.shift) return keyMatch && e.shiftKey;
  if (def.alt) return keyMatch && e.altKey;
  return keyMatch;
}

export function formatShortcut(def: ShortcutDef): string {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const parts: string[] = [];
  if (def.mod === 'mod') parts.push(isMac ? '⌘' : 'Ctrl');
  if (def.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (def.alt) parts.push(isMac ? '⌥' : 'Alt');
  const keyLabel = def.key === 'Enter' ? '⏎' : def.key.toUpperCase();
  parts.push(keyLabel);
  return parts.join(isMac ? '' : '+');
}

type HandlerMap = Partial<Record<ShortcutAction, () => void>>;

export function useKeyboardShortcuts(handlers: HandlerMap) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (isInput) return;

      for (const [action, handler] of Object.entries(handlers) as [ShortcutAction, () => void][]) {
        const def = SHORTCUTS[action];
        if (def && matchesShortcut(e, def)) {
          e.preventDefault();
          handler();
          return;
        }
      }
    },
    [handlers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
