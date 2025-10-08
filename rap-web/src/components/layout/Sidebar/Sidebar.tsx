import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faStar,
  faClock,
  faLandmark,
  faIndustry,
  faFan,
  faPlus,
  faTimes,
  faFolder,
  faCodeBranch,
} from "@fortawesome/free-solid-svg-icons";

import { open } from '@tauri-apps/api/dialog';
import { useUI } from "@/hooks/useUI";
import { useScripts } from "@/hooks/useScripts";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useState } from 'react';
import { AddWorkspaceModal } from '@/components/common/AddWorkspaceModal';
import { AddCategoryModal } from '@/components/common/AddCategoryModal';
import { AddFolderModal } from '@/components/common/AddFolderModal'; // Import AddFolderModal

import { useAuth } from '@/hooks/useAuth';
import { Script, Workspace } from '@/types';

const getFolderNameFromPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts.pop() || '';
};

export const Sidebar = () => {
  const { user } = useAuth();

  const { selectedCategory, setSelectedCategory, customCategories, addCustomCategory, removeCustomCategory, activeScriptSource, setActiveScriptSource } = useUI();
  const { customScriptFolders, addCustomScriptFolder, removeCustomScriptFolder, scripts, recentScripts, loadScriptsForFolder, selectedFolder, clearFavoriteScripts, clearRecentScripts } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  const { cloneAndAddWorkspace, setActiveWorkspaceId, activeWorkspace, workspaces } = useWorkspaces();
  const [isAddWorkspaceModalOpen, setIsAddWorkspaceModalOpen] = useState(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false); // State for AddFolderModal

  const handleAddCustomFolder = async () => {
    if (window.__TAURI__) {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (typeof selected === 'string') {
        addCustomScriptFolder(selected);
      }
    } else {
      setIsAddFolderModalOpen(true);
    }
  };

  const handleAddFolderSubmit = (folderPath: string) => {
    addCustomScriptFolder(folderPath);
    setIsAddFolderModalOpen(false);
  };

  const handleFolderClick = (folder: string) => {
    setActiveScriptSource({ type: 'local', path: folder });
  };

  const handleAddWorkspace = async (repoUrl: string, localPath: string, pat?: string) => {
    await cloneAndAddWorkspace({ repo_url: repoUrl, local_path: localPath, pat: pat });
    setIsAddWorkspaceModalOpen(false);
  };

  const handleAddCategory = (categoryName: string) => {
    addCustomCategory(categoryName);
    setIsAddCategoryModalOpen(false);
  };

  const defaultCategories = [
    { name: "Architectural", icon: faLandmark, color: "text-red-500" },
    { name: "Structural", icon: faIndustry, color: "text-indigo-500" },
    { name: "MEP", icon: faFan, color: "text-teal-500" },
  ];

  return (
    <div
      className={`bg-white dark:bg-gray-800 shadow-lg overflow-y-auto h-full`}
    >
      <div className="p-4">

        <AddWorkspaceModal
          isOpen={isAddWorkspaceModalOpen}
          onClose={() => setIsAddWorkspaceModalOpen(false)}
          onAddWorkspace={handleAddWorkspace}
        />
        <AddCategoryModal
          isOpen={isAddCategoryModalOpen}
          onClose={() => setIsAddCategoryModalOpen(false)}
          onAddCategory={handleAddCategory}
        />
        <AddFolderModal
          isOpen={isAddFolderModalOpen}
          onClose={() => setIsAddFolderModalOpen(false)}
          onAddFolder={handleAddFolderSubmit}
        />

        {/* 🗂️ Categories (Global) */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Categories</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={() => setIsAddCategoryModalOpen(true)}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <ul className="space-y-1">
            {defaultCategories.map(category => (
              <li
                key={category.name}
                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer
                  ${selectedCategory === category.name
                    ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}
                `}
                onClick={() => setSelectedCategory(selectedCategory === category.name ? null : category.name)}
              >
                <div className="flex items-center">
                  <FontAwesomeIcon icon={category.icon} className={`${category.color} mr-2`} />
                  <span className="font-semibold">{category.name}</span>
                </div>
                <FontAwesomeIcon icon={faChevronRight} className="text-xs text-gray-400 dark:text-gray-500" />
              </li>
            ))}
            {customCategories.map((category: string) => (
              <li
                key={category}
                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer
                  ${selectedCategory === category
                    ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}
                `}
                onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
              >
                <div className="flex items-center">
                  <span className="font-semibold">{String(category)}</span>
                </div>
                <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={(e) => {e.stopPropagation(); removeCustomCategory(category)} }>
                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ⭐ Favorites (Global) */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Favorites</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={clearFavoriteScripts}>
              Clear
            </button>
          </div>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {scripts.filter((s: Script) => s.isFavorite).map((script: Script) => (
              <li
                key={script.id}
                className="flex items-center py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
                onClick={() => setSelectedScript(script)}
              >
                <FontAwesomeIcon icon={faStar} className="text-yellow-400 mr-2" />
                <span className="truncate">{script.metadata.displayName || script.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 🕒 Recent Activity (Global) */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Recent</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={clearRecentScripts}>
              Clear
            </button>
          </div>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {recentScripts.map((script: Script) => (
              <li
                key={script.id}
                className="flex items-center py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
                onClick={() => setSelectedScript(script)}
              >
                <FontAwesomeIcon icon={faClock} className="text-gray-400 dark:text-gray-500 mr-2" />
                <span className="truncate">{script.metadata.displayName || script.name}</span>
              </li>
            ))}
          </ul>
        </div>

                {/* 📂 Script Source */}
                <div className="mb-6">
                    <>
                      <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400 mb-2">Script Folders</h3>
        
                      {/* Local Folders */}
                      
                        <div className="mb-4 ml-2">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-xs uppercase text-gray-500 dark:text-gray-400">Local Folders</h4>
                            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={handleAddCustomFolder}>
                              Add
                            </button>
                          </div>
                          <ul className="space-y-1">
                            {customScriptFolders.map((folder: string) => (
                              <li
                                key={folder}
                                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer
                                  ${activeScriptSource?.type === 'local' && activeScriptSource.path === folder
                                    ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}
                                `}
                                onClick={() => handleFolderClick(folder)}
                              >
                                <div className="flex items-center">
                                  <FontAwesomeIcon icon={faFolder} className="text-yellow-500 mr-2" />
                                  <span className="font-semibold">{getFolderNameFromPath(folder)}</span>
                                </div>
                                <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={(e) => {e.stopPropagation(); removeCustomScriptFolder(folder)} }>
                                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      
        
                      {/* Workspaces */}
                      
                        <div className="mb-4 ml-2">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-xs uppercase text-gray-500 dark:text-gray-400">Workspaces</h4>
                            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={() => setIsAddWorkspaceModalOpen(true)}>
                              Add
                            </button>
                          </div>
                          <ul className="space-y-1">
                            {workspaces.map((workspace: Workspace) => (
                              <li
                                key={workspace.id}
                                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer
                                  ${activeScriptSource?.type === 'workspace' && activeScriptSource.id === workspace.id
                                    ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}
                                `}
                                onClick={() => setActiveScriptSource({ type: 'workspace', id: workspace.id })}
                              >
                                <div className="flex items-center">
                                  <FontAwesomeIcon icon={faCodeBranch} className="text-purple-500 mr-2" />
                                  <span className="font-semibold">{workspace.name}</span>
                                </div>
                                {/* Add remove workspace button if needed */}
                              </li>
                            ))}
                          </ul>
                        </div>
                      
                    </>
                </div>      </div>
    </div>
  );
};