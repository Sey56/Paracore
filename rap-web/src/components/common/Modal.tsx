
import React from 'react';
import Portal from './Portal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'; // Added 2xl size
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title, size = 'md' }) => {
  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-screen-lg', // Custom wider size
  }[size];

  return (
    <Portal wrapperId="modal-portal">
      <div className="fixed inset-0 bg-black/20 z-[9999] flex justify-center items-center p-4" onClick={onClose}>
        <div 
          className={`bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full ${maxWidthClass} flex flex-col`}
          onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
        >
          <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            <button 
              onClick={onClose}
              className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
};
