import React from 'react';
import { SidebarSection } from '../SidebarSection';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTh, faPlus, faTimes } from "@fortawesome/free-solid-svg-icons";

interface CategoryManagerProps {
  customCategories: string[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  removeCustomCategory: (category: string) => void;
  onAddCategory: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  customCategories,
  selectedCategory,
  setSelectedCategory,
  removeCustomCategory,
  onAddCategory
}) => {
  return (
    <SidebarSection
      title="Categories"
      icon={faTh}
      iconColor="text-purple-400"
      defaultExpanded={false}
      actions={
        <div className="tooltip-left">
          <button
            className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onAddCategory();
            }}
            title="Add Category">
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          </button>
        </div>
      }
    >
      <ul className="grid grid-cols-1 gap-1 pr-2">
        {customCategories.map((category: string) => (
          <li
            key={category}
            className={`group flex items-center justify-between py-1.5 px-3 rounded-xl cursor-pointer transition-all border
              ${selectedCategory === category
                ? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 border-purple-100 dark:border-purple-900/50 shadow-sm"
                : "hover:bg-gray-50 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300 border-transparent active:scale-[0.98]"}
            `}
            onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
          >
            <span className="text-sm font-bold truncate leading-none">{String(category)}</span>
            <button
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg tooltip-left"
              onClick={(e) => {
                e.stopPropagation();
                removeCustomCategory(category);
              }}
              title="Remove category"
            >
              <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
            </button>
          </li>
        ))}
        {customCategories.length === 0 && (
          <li className="text-xs text-muted-foreground px-3 py-1.5 italic">No custom category</li>
        )}
      </ul>
    </SidebarSection>
  );
};
