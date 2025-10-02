
import { createContext } from 'react';
import type { RevitStatus } from '@/types';

export interface RevitContextProps {
  rserverConnected: boolean;
  revitStatus: RevitStatus;
}

export const RevitContext = createContext<RevitContextProps | undefined>(undefined);
