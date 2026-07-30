import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
}) => {
  const closingRef = useRef(false);

  const handleOpenChange = (open: boolean) => {
    if (!open && !closingRef.current) {
      closingRef.current = true;
      setTimeout(() => {
        onClose();
        closingRef.current = false;
      }, 150);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton>
          <Button onClick={() => handleOpenChange(false)}>Okay</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
