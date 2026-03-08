import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';

interface NewPresetNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  title: string;
  initialValue?: string;
}

export const NewPresetNameModal: React.FC<NewPresetNameModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  initialValue = '',
}) => {
  const [name, setName] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setName(initialValue);
    }
  }, [isOpen, initialValue]);

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <input
          type="text"
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-slate-200"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter name"
          autoFocus
        />
        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {title === "Rename Preset" ? "Rename" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
