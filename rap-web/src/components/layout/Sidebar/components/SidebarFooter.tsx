import React from 'react';

export const SidebarFooter = () => {
  return (
    <div className="p-6 border-t border-gray-50 dark:border-gray-800/50 bg-gray-50/20 dark:bg-gray-900/10">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 italic leading-tight">
          Forging high-performance BIM automations...
        </p>
        <div className="w-8 h-0.5 bg-blue-500/30 rounded-full" />
      </div>
    </div>
  );
};
