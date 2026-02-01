
import React, { useEffect, useState } from 'react';
import Portal from './Portal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title, size = 'md' }) => {
  const [show, setShow] = useState(false);
  const [render, setRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      requestAnimationFrame(() => setShow(true));
    } else {
      setShow(false);
      const timer = setTimeout(() => setRender(false), 200); // Match transition duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!render) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-screen-lg',
  }[size];

  return (
    <Portal wrapperId="modal-portal">
      <div 
        className={`fixed inset-0 z-[9999] flex justify-center items-center p-4 transition-all duration-200 ease-out ${
          show ? 'bg-black/40 backdrop-blur-sm opacity-100' : 'bg-black/0 opacity-0'
        }`}
        onClick={onClose}
      >
        <div 
          className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full ${maxWidthClass} flex flex-col border border-gray-100 dark:border-gray-700 transform transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            show ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h2>
            <button 
              onClick={onClose}
              className="group p-2 rounded-full text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </Portal>
  );
};
