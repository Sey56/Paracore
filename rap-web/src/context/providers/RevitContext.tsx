
import { createContext } from 'react';
import type { RevitStatus } from '@/types';

export interface RevitContextProps {
  ParacoreConnected: boolean;
  /** null means the check has not completed yet; do not claim "not installed". */
  sidecarInstalled: boolean | null;
  revitStatus: RevitStatus;
}

export const RevitContext = createContext<RevitContextProps | undefined>(undefined);
