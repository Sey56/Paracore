import { FC, useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faTimes } from '@fortawesome/free-solid-svg-icons';
import { open } from '@tauri-apps/api/dialog';

interface SetupWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
  onSetup: (localPath: string) => Promise<void>;
}

export const SetupWorkspaceModal: FC<SetupWorkspaceModalProps> = ({
  isOpen,
  onClose,
  workspaceName,
  onSetup,
}) => {
  const [localPath, setLocalPath] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setLocalPath('');
      setIsCloning(false);
    }
  }, [isOpen]);

  const handleSelectFolder = async () => {
    let selectedPath: string | string[] | null = null;
    if (window.__TAURI__) {
      // Native dialog for Tauri environment
      selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select a parent folder for the workspace',
      });
    } else {
      // Prompt for web environment
      selectedPath = prompt('Please enter the absolute parent path where the workspace should be cloned:');
    }

    if (typeof selectedPath === 'string' && selectedPath) {
      setLocalPath(selectedPath);
    }
  };

  const handleSubmit = async () => {
    if (!localPath) return;
    setIsCloning(true);
    try {
      await onSetup(localPath);
      onClose(); // Close on success
    } catch (error) {
      // Error is likely shown via notification from the parent component
      console.error("Setup failed:", error);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>


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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100"
                >
                  Setup Workspace: <span className="font-bold">{workspaceName}</span>
                </Dialog.Title>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                    <FontAwesomeIcon icon={faTimes} />
                </button>
                <div className="mt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Select a parent folder on your local machine where the repository will be cloned. A new subfolder will be created for it.
                  </p>
                  <div className="mt-4 flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={localPath}
                      placeholder="No folder selected..."
                      className="flex-grow p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                    <button
                      onClick={handleSelectFolder}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      <FontAwesomeIcon icon={faFolderOpen} className="mr-2" />
                      Select Folder
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-2">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
                    onClick={handleSubmit}
                    disabled={!localPath || isCloning}
                  >
                    {isCloning ? 'Cloning...' : 'Confirm & Clone'}
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
