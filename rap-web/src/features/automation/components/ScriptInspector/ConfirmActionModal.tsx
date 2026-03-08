import React from 'react';
import { Modal } from '@/components/common/Modal';

interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  confirmButtonColor?: 'red' | 'blue' | 'default'; // New optional prop
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = "Confirm",
  confirmButtonColor = "default", // Default to "default"
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const buttonColorClass = {
    red: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
    blue: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
    default: "bg-slate-600 hover:bg-slate-700 focus:ring-slate-500", // Changed default to slate for less prominence
  }[confirmButtonColor];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-slate-700 dark:text-slate-300">{message}</p>
        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonColorClass}`}
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
