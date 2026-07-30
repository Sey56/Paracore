import { useUIStore } from '@/stores/uiStore';

/**
 * UI state hook — backed by Zustand (no Context needed).
 * Same API as the old UIContext for drop-in compatibility.
 */
export const useUI = () => useUIStore();
