import { FC, useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';

interface RegisterWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, repoUrl: string) => Promise<void>;
  initialName?: string;
  initialRepoUrl?: string;
  isEditMode?: boolean;
}

export const RegisterWorkspaceModal: FC<RegisterWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialName,
  initialRepoUrl,
  isEditMode = false,
}) => {
  const [name, setName] = useState(initialName || '');
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl || '');
  const [isRegistering, setIsRegistering] = useState(false);
  const { showNotification } = useNotifications();

  useEffect(() => {
    if (isOpen) {
      if (isEditMode) {
        setName(initialName || '');
        setRepoUrl(initialRepoUrl || '');
      } else {
        setName('');
        setRepoUrl('');
      }
      setIsRegistering(false);
    }
  }, [isOpen, isEditMode, initialName, initialRepoUrl]);

  const handleSubmit = async () => {
    if (!name || !repoUrl) {
      showNotification("Workspace Name and Repository URL cannot be empty.", "error");
      return;
    }

    // Add URL validation
    try {
      new URL(repoUrl); // Attempt to create a URL object
    } catch (e) {
      // If URL creation fails, it's an invalid URL
      showNotification("Repository URL is not a valid URL.", "error");
      return;
    }

    setIsRegistering(true);
    try {
      await onSubmit(name, repoUrl);
      onClose();
    } catch (error) {
      console.error("Submission failed:", error);
    } finally {
      setIsRegistering(false);
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
                  {isEditMode ? 'Edit Workspace' : 'Register New Workspace for Team'}
                </Dialog.Title>
                 <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                    <FontAwesomeIcon icon={faTimes} />
                </button>
                <div className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="workspaceName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Workspace Name</label>
                        <input
                            type="text"
                            id="workspaceName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., 'Project Revit Scripts'"
                            className="mt-1 block w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                        />
                    </div>
                    <div>
                        <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Repository URL</label>
                        <input
                            type="text"
                            id="repoUrl"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="e.g., 'https://github.com/my-org/my-repo.git'"
                            className="mt-1 block w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                        />
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
                    disabled={!name || !repoUrl || isRegistering}
                  >
                    {isRegistering ? (isEditMode ? 'Updating...' : 'Registering...') : (isEditMode ? 'Update' : 'Register')}
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
