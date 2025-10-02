import React, { useEffect } from 'react';

interface AddFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFolder: (folderName: string) => void;
  initialFolderName?: string;
}

export const AddFolderModal: React.FC<AddFolderModalProps> = ({
  isOpen,
  onClose,
  onAddFolder,
  initialFolderName = '',
}) => {
  // This component is now a dummy. The actual folder selection is handled by native dialog.
  // It still needs to exist to satisfy imports in AppLayout.tsx
  useEffect(() => {
    if (isOpen) {
      // Immediately close if opened, as it's not meant to be visible
      onClose();
    }
  }, [isOpen, onClose]);

  return null; // Render nothing
};