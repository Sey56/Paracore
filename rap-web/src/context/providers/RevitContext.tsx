
import { createContext } from 'react';
import type { RevitStatus } from '@/types';

export interface RevitContextProps {
  ParacoreConnected: boolean;
  revitStatus: RevitStatus;
  isPro: boolean;
}

export const RevitContext = createContext<RevitContextProps | undefined>(undefined);
