import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'size'> {
  icon: LucideIcon;
  spin?: boolean;
  size?: string | number;
  title?: string;
}

/**
 * Compatibility wrapper. Call sites still pass `icon={faCheck}` and an optional
 * `spin` flag, but the glyph is a Lucide stroke icon. The `pc-icon` class gives
 * it a default em-based size so `text-*` utilities scale it, while explicit
 * `w-*` / `h-*` utilities still win (that rule lives in the base layer).
 */
export const FontAwesomeIcon: React.FC<IconProps> = ({
  icon: Glyph,
  spin = false,
  size,
  className = '',
  ...rest
}) => (
  <Glyph
    className={`pc-icon${spin ? ' animate-spin' : ''} ${className}`.trim()}
    size={typeof size === 'number' ? size : undefined}
    aria-hidden="true"
    {...rest}
  />
);
