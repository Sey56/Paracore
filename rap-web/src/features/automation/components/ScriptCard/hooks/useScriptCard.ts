import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Script } from "@/types/scriptModel";
import { 
  useScriptOperations,
  useScriptSelection
} from "@/features/automation/hooks/useScriptExecution";
import { useScripts } from "@/features/automation/hooks/useScripts";
import { useUI } from "@/hooks/useUI";
import { useAuth } from "@/features/auth";

/**
 * V12: Optimized Hook - Operations only.
 * Volatile state (isRunning, isSelected, etc.) is now passed as props 
 * to prevent unnecessary re-renders of the entire hook logic.
 */
export const useScriptCard = (
  script: Script, 
  onSelect: () => void,
  isRunning: boolean,
  isSelected: boolean,
  isArmed: boolean,
  isActiveInIDE: boolean,
  isRunButtonDisabled: boolean,
  tooltipMessage: string
) => {
  // Pull static operations
  const { runScript, editScript, renameScript } = useScriptOperations();
  const { setSelectedScript } = useScriptSelection();
  const { toggleFavoriteScript, deleteScript, reloadScript } = useScripts();
  
  const { setActiveInspectorTab, toggleFloatingCodeViewer } = useUI();
  const { isAuthenticated, activeRole } = useAuth();

  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showMetadataModal, setShowMetadataModal] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const path = (script.absolutePath || script.id || script.name || "").toLowerCase().replace(/\\/g, '/');
  const isWTool = path.endsWith('.wtool') || path.includes('.wtool/');
  const isPTool = path.endsWith('.ptool') || path.includes('.ptool/');

  const isGuard = script.metadata?.isWatchdog === true ||
    script.metadata?.is_watchdog === true ||
    (script.metadata as any)?.IsWatchdog === true ||
    path.endsWith('.wtool') ||
    path.includes('.wtool');

  const isProtectedTool = script.metadata?.isProtected === true || script.metadata?.isCompiled === true || isPTool || isWTool;

  const getDisplayName = useCallback(() => {
    return script.metadata.displayName || script.name.replace(/\.(cs|ptool|wtool)$/i, "");
  }, [script]);

  const handleRunClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunButtonDisabled) return;
    
    // V11: Local feedback only, no automatic tab switch
    await runScript(script, undefined, true); 
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteScript(script.id);
  };

  const handleSelect = () => {
    if (!isAuthenticated) return;
    onSelect();
  };

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(getDisplayName());
    setIsRenaming(true);
    setShowMenu(false);
  };

  const handleRenameSubmit = async () => {
    const currentName = getDisplayName();
    if (!renameValue.trim() || renameValue === currentName) {
      setIsRenaming(false);
      return;
    }
    await renameScript(script, renameValue);
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
    }
  };

  const handleDelete = async (scaffoldingOnly: boolean = false) => {
    setIsDeleting(true);
    setDeleteError(null);
    const success = await deleteScript(script, scaffoldingOnly);
    setIsDeleting(false);

    if (success) {
      setShowDeleteModal(false);
      if (!scaffoldingOnly && isSelected) {
        setSelectedScript(null);
      }
    } else {
      setDeleteError("An unexpected error occurred during deletion.");
    }
  };

  return {
    isSelected,
    isRunning,
    isGuard,
    isProtectedTool,
    isArmed,
    isActiveInIDE,
    isRunButtonDisabled,
    tooltipMessage,
    showMenu,
    setShowMenu,
    isRenaming,
    setIsRenaming,
    renameValue,
    setRenameValue,
    showDeleteModal,
    setShowDeleteModal,
    isDeleting,
    deleteError,
    setDeleteError,
    showMetadataModal,
    setShowMetadataModal,
    menuRef,
    getDisplayName,
    handleRunClick,
    handleFavoriteClick,
    handleSelect,
    handleStartRename,
    handleRenameSubmit,
    handleRenameKeyDown,
    handleDelete,
    editScript,
    setSelectedScript,
    toggleFloatingCodeViewer,
    isAuthenticated,
    activeRole,
    reloadScript
  };
};
