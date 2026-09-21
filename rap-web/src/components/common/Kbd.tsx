import React from 'react';
import { cn } from '@/lib/utils';
import { formatShortcut, SHORTCUTS, type ShortcutAction } from '@/hooks/useKeyboardShortcuts';

interface KbdProps {
  action: ShortcutAction;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ action, className }) => {
  const shortcut = SHORTCUTS[action];
  if (!shortcut) return null;

  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground',
        className,
      )}
    >
      {formatShortcut(shortcut)}
    </kbd>
  );
};
