import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  noPadding?: boolean;
  hideHeader?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-screen-lg',
  '3xl': 'sm:max-w-screen-xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
  '6xl': 'sm:max-w-6xl',
  full: 'sm:max-w-[95vw]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  noPadding = false,
  hideHeader = false,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={`${sizeClasses[size] || ''} ${size === 'full' ? 'h-[90vh]' : ''} max-h-[92vh] overflow-hidden flex flex-col data-closed:animate-none data-closed:fade-out-0`}
        showCloseButton={!hideHeader}
      >
        {!hideHeader && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className={`flex-1 min-h-0 overflow-auto ${noPadding ? '-mx-4 -mb-4' : ''}`}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
