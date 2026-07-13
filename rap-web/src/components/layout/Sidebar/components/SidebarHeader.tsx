import React from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from '@/features/auth';

export const SidebarHeader: React.FC = () => {
  const { user, isEnterprise } = useAuth();

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';

  return (
    <div className="mb-4 mt-2 px-1">
      <div className="flex items-center gap-3 p-3 rounded-[1.25rem] bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
        <div className="w-10 h-10 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0 transform group-hover:scale-105 transition-transform">
          <FontAwesomeIcon icon={faUser} className="text-sm" />
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-black text-gray-800 dark:text-gray-100 truncate tracking-tight uppercase">
            {displayName}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isEnterprise ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              {isEnterprise ? 'Pro' : 'Free'}
            </span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};
