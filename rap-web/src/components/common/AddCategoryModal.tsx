import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCategory: (categoryName: string) => void;
  initialCategoryName?: string;
}

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  onClose,
  onAddCategory,
  initialCategoryName = '',
}) => {
  const [categoryName, setCategoryName] = useState(initialCategoryName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategoryName(initialCategoryName);
      setError(null);
    }
  }, [isOpen, initialCategoryName]);

  const handleAdd = () => {
    if (!categoryName.trim()) {
      setError('Category name cannot be empty.');
      return;
    }
    setError(null);
    onAddCategory(categoryName);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Category" size="sm">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      <div className="mb-4">
        <label htmlFor="categoryName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Category Name
        </label>
        <input
          type="text"
          id="categoryName"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="e.g., My New Category"
        />
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Category
        </button>
      </div>
    </Modal>
  );
};
