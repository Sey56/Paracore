import React from 'react';
import { FontAwesomeIcon } from '@/components/ui/Icon';
import { faSpinner } from '@/components/ui/iconAliases';

interface GalleryLoadingStateProps {
  isCompactView?: boolean;
}

const SKELETON_COUNT = 6;

export const GalleryLoadingState: React.FC<GalleryLoadingStateProps> = ({ isCompactView }) => (
  <div className="flex flex-col pt-1" role="status" aria-live="polite">
    <div className="flex items-center justify-center gap-2 py-6 text-slate-500 dark:text-slate-400">
      <FontAwesomeIcon icon={faSpinner} spin className="text-sm" />
      <span className="text-caption font-medium">Loading gallery tools...</span>
    </div>

    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${isCompactView ? 'opacity-70' : ''}`}>
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-2 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-2 w-5/6 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-16 rounded-md bg-slate-200 dark:bg-slate-700" />
            <div className="h-6 w-16 rounded-md bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
