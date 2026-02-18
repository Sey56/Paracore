import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faFolder, faTimes, faSave, faSpinner, faCheck } from '@fortawesome/free-solid-svg-icons';
import { useScripts } from '../hooks/useScripts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useWatchdog } from '@/context/providers/WatchdogProvider';

interface SaveWatchdogModalProps {
    isOpen: boolean;
    onClose: () => void;
    queryConfig: {
        category: string;
        rootGroup: any;
        scope: string;
    };
}

export const SaveWatchdogModal: React.FC<SaveWatchdogModalProps> = ({ isOpen, onClose, queryConfig }) => {
    const { configuredWatchdogRoots } = useWatchdog();
    const { showNotification } = useNotifications();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [targetFolder, setTargetFolder] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isValidRoot, setIsValidRoot] = useState(false);

    // Set default target folder when open
    useEffect(() => {
        if (isOpen) {
            if (configuredWatchdogRoots.length > 0) {
                setTargetFolder(configuredWatchdogRoots[0]);
                setIsValidRoot(true);
            } else {
                setTargetFolder('');
                setIsValidRoot(false);
            }
            // Default name derived from category
            setName(`${queryConfig.category.replace('OST_', '')}Check`);
            setDescription(`Checks ${queryConfig.category.replace('OST_', '')} against usage rules.`);
        }
    }, [isOpen, configuredWatchdogRoots, queryConfig.category]);

    const handleSave = async () => {
        if (!name || !targetFolder) return;

        setIsSaving(true);
        try {
            const payload = {
                name,
                description,
                target_folder: targetFolder,
                category_name: queryConfig.category,
                root_group: queryConfig.rootGroup,
                scope: queryConfig.scope
            };

            const response = await api.post('/api/query/save-as-watchdog', payload);

            if (response.data.success) {
                showNotification(`Sentinel "${name}" created successfully!`, 'success');
                onClose();
            } else {
                showNotification('Failed to create sentinel script.', 'error');
            }
        } catch (error: any) {
            console.error('Failed to save watchdog:', error);
            showNotification(error.response?.data?.detail || 'Failed to save sentinel script.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[200]" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all border border-gray-100 dark:border-gray-700">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                            <FontAwesomeIcon icon={faShieldHeart} className="text-lg" />
                                        </div>
                                        <div>
                                            <Dialog.Title as="h3" className="text-lg font-bold leading-6 text-gray-900 dark:text-gray-100">
                                                Save as Sentinel
                                            </Dialog.Title>
                                            <p className="text-xs text-gray-500 mt-1">Convert this query into a background monitor.</p>
                                        </div>
                                    </div>
                                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                        <FontAwesomeIcon icon={faTimes} />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Sentinel Name</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white"
                                            placeholder="e.g. FireRatingCheck"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Description / Success Message</label>
                                        <textarea
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-gray-300 min-h-[60px]"
                                            placeholder="e.g. Checks if all walls have a valid fire rating."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Target Source Folder</label>
                                        {isValidRoot ? (
                                            <div className="relative">
                                                <select
                                                    value={targetFolder}
                                                    onChange={e => setTargetFolder(e.target.value)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400 outline-none appearance-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                                >
                                                    {configuredWatchdogRoots.map(root => (
                                                        <option key={root} value={root}>{root}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                    <FontAwesomeIcon icon={faFolder} className="text-amber-500" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-lg text-xs text-amber-600 dark:text-amber-400 font-medium">
                                                No Sentinel folders configured. Please go to Settings &gt; Sentinel Settings to add a source folder first.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-8 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        className="px-4 py-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-bold transition-colors"
                                        onClick={onClose}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!name || !targetFolder || isSaving || !isValidRoot}
                                        className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        onClick={handleSave}
                                    >
                                        {isSaving ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                                        {isSaving ? 'Creating...' : 'Create Sentinel'}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
