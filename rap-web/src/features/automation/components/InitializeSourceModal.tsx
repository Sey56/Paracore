import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/common/Modal';

interface InitializeSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (description: string) => void;
    folderName: string;
}

export const InitializeSourceModal: React.FC<InitializeSourceModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    folderName,
}) => {
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (isOpen) setDescription('');
    }, [isOpen]);

    const handleConfirm = () => {
        onConfirm(description.trim());
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Initialize Script Source" size="md">
            <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg font-black flex-shrink-0">+</div>
                    <div>
                        <div className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em]">New Source</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">{folderName}</div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.2em] px-1">
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Structural analysis automation scripts for Building A..."
                        rows={3}
                        autoFocus
                        className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800/50 rounded-2xl px-5 py-3.5 text-sm font-semibold text-slate-600 dark:text-slate-400 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all shadow-sm resize-none"
                    />
                    <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 px-1">
                        Optional. Helps you remember what this source contains.
                    </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-[11px] font-black text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase tracking-widest transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-8 py-3 rounded-xl text-[11px] font-black bg-blue-600 text-white shadow-xl shadow-blue-600/20 hover:bg-blue-500 uppercase tracking-widest transition-all active:scale-95"
                    >
                        Initialize
                    </button>
                </div>
            </div>
        </Modal>
    );
};
