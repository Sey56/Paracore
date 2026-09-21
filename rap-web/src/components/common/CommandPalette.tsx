import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { useUI } from '@/hooks/useUI';
import { useScripts } from '@/features/automation';
import { useScriptExecution } from '@/features/automation';
import { useTheme } from '@/context/ThemeContext';
import { formatShortcut, SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import {
  LayoutGridIcon,
  CodeIcon,
  ListIcon,
  SunIcon,
  MoonIcon,
  CircleIcon,
  SettingsIcon,
  ColumnsIcon,
} from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const ui = useUI();
  const { scripts } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  const { theme, toggleTheme } = useTheme();

  // Open/close via Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = useCallback(
    (fn: () => void) => {
      setOpen(false);
      // Small delay so the palette close animation plays before the action
      setTimeout(fn, 50);
    },
    [],
  );

  // Script search results — memoized for performance
  const scriptResults = useMemo(() => {
    return scripts.map((s) => ({
      id: s.id,
      name: s.metadata?.displayName || s.name,
      description: s.metadata?.description || '',
      category: s.metadata?.categories?.[0] || '',
      script: s,
    }));
  }, [scripts]);

  const themeIcon = theme === 'light' ? SunIcon : theme === 'midnight' ? MoonIcon : CircleIcon;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search scripts, navigate, or run commands."
      className="sm:max-w-xl"
    >
      <CommandInput placeholder="Type a command or search scripts…" />

      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* ── Navigation ── */}
        <CommandGroup heading="Navigate">
          <CommandItem
            onSelect={() => runCommand(() => ui.setActiveMainView('gallery'))}
          >
            <LayoutGridIcon className="size-4" />
            Gallery
            <CommandShortcut>{formatShortcut(SHORTCUTS['view-gallery'])}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => ui.setActiveMainView('repl'))}
          >
            <CodeIcon className="size-4" />
            REPL
            <CommandShortcut>{formatShortcut(SHORTCUTS['view-repl'])}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => ui.setActiveMainView('playlists'))}
          >
            <ListIcon className="size-4" />
            Playlists
            <CommandShortcut>{formatShortcut(SHORTCUTS['view-playlists'])}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => ui.toggleSidebar())}>
            <ColumnsIcon className="size-4" />
            Toggle Sidebar
            <CommandShortcut>{formatShortcut(SHORTCUTS['toggle-sidebar'])}</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* ── Settings ── */}
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => runCommand(() => ui.openSettingsModal())}>
            <SettingsIcon className="size-4" />
            Open Settings
            <CommandShortcut>{formatShortcut(SHORTCUTS['open-settings'])}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                toggleTheme();
              })
            }
          >
            {React.createElement(themeIcon, { className: 'size-4' })}
            Change Theme ({theme.charAt(0).toUpperCase() + theme.slice(1)})
            <CommandShortcut>{formatShortcut(SHORTCUTS['cycle-theme'])}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => ui.toggleLayoutSwap())}>
            <ColumnsIcon className="size-4 rotate-90" />
            Swap Panels
            <CommandShortcut>{formatShortcut(SHORTCUTS['toggle-layout-swap'])}</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* ── Scripts ── */}
        {scriptResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Scripts">
              {scriptResults.slice(0, 15).map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.name} ${s.description} ${s.category}`}
                  onSelect={() =>
                    runCommand(() => {
                      setSelectedScript(s.script, 'user');
                      ui.setActiveInspectorTab('parameters');
                    })
                  }
                >
                  <span className="truncate">{s.name}</span>
                  {s.category && (
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                      {s.category}
                    </span>
                  )}
                </CommandItem>
              ))}
              {scriptResults.length > 15 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  +{scriptResults.length - 15} more scripts — refine your search
                </div>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};
