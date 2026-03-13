import React, { memo } from 'react';
import { Script } from "@/types/scriptModel";
import styles from '../ScriptCard.module.css';

interface CardBodyProps {
  script: Script;
}

const CardBodyComponent = ({ script }: CardBodyProps) => {
  return (
    <>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">
        {script.metadata.categories?.join(', ') || ''}
      </div>
      <p className={`${styles.description} text-gray-600 dark:text-gray-300 text-sm mb-4 flex-grow`}>
        {script.metadata.description}
      </p>
      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
        <span className="truncate mr-2">{script.metadata.author || 'Unknown Author'}</span>
        <span className="shrink-0">{script.metadata.documentType || 'Any'}</span>
      </div>
    </>
  );
};

export const CardBody = memo(CardBodyComponent);
CardBody.displayName = 'CardBody';
