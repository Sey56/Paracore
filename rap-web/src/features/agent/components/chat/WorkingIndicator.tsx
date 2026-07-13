import React from 'react';

export const WorkingIndicator: React.FC = () => (
  <div className="flex items-center space-x-2.5 text-[12px] text-[var(--text-secondary)]">
    <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    <span className="font-medium">Working...</span>
  </div>
);
