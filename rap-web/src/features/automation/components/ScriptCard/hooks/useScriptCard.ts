import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Script, ScriptParameter } from "@/types/scriptModel";
import { useScriptExecution } from "@/features/automation/hooks/useScriptExecution";
import { useScripts } from "@/features/automation/hooks/useScripts";
import { useUI } from "@/hooks/useUI";
import { useRevitStatus } from "@/hooks/useRevitStatus";
import { useAuth } from "@/features/auth";
import { useWatchdog } from "@/context/providers/WatchdogProvider";
import { filterVisibleParameters, validateParameters } from '@/utils/parameterVisibility';

export const useScriptCard = (script: Script, onSelect: () => void) => {
  const {
    selectedScript,
    runningScriptPath,
    runScript,
    setSelectedScript,
    editScript,
    renameScript,
    userEditedScriptParameters
  } = useScriptExecution();

  const { toggleFavoriteScript, deleteScript, isSyncActive } = useScripts();
  const { setActiveInspectorTab } = useUI();
  const { ParacoreConnected, revitStatus } = useRevitStatus();
  const { isAuthenticated, activeRole, user } = useAuth();
  const { watchdogs } = useWatchdog();

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

  const isSelected = selectedScript?.id?.toLowerCase().replace(/\\/g, '/') === script.id?.toLowerCase().replace(/\\/g, '/');
  const isRunning = runningScriptPath === script.id;

  const path = (script.absolutePath || script.id || script.name || "").toLowerCase().replace(/\\/g, '/');
  const isWTool = path.endsWith('.wtool') || path.includes('.wtool/');
  const isPTool = path.endsWith('.ptool') || path.includes('.ptool/');

  const isGuard = script.metadata?.isWatchdog === true ||
    script.metadata?.is_watchdog === true ||
    (script.metadata as any)?.IsWatchdog === true ||
    path.endsWith('.wtool') ||
    path.includes('.wtool');

  const isProtectedTool = script.metadata?.isProtected === true || script.metadata?.isCompiled === true || isPTool || isWTool;

  const isArmed = useMemo(() => {
    if (!isGuard) return false;
    const normalizedCardPath = path.replace(/\\/g, '/');
    return watchdogs.some(w => w.script_path.toLowerCase().replace(/\\/g, '/') === normalizedCardPath);
  }, [isGuard, path, watchdogs]);

  const isActiveInIDE = isSyncActive(script.absolutePath);

  const requiredDocType = script.metadata.documentType || 'Any';
  const currentDocType = revitStatus?.documentType || 'Any';

  const isCompatibleWithDocument = useMemo(() => {
    if (!ParacoreConnected) return true;
    if (revitStatus?.document === null) return false;
    if (requiredDocType === 'Any' || currentDocType === 'Any') return true;
    return requiredDocType.toLowerCase() === currentDocType.toLowerCase();
  }, [ParacoreConnected, requiredDocType, currentDocType, revitStatus?.document]);

  const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
  const visibleParameters = filterVisibleParameters(currentParams);
  const validationErrors = validateParameters(visibleParameters);

  const isRunButtonDisabled = !ParacoreConnected || !isCompatibleWithDocument || isRunning || validationErrors.length > 0 || !isAuthenticated;

  const tooltipMessage = !isAuthenticated
    ? "Please sign in to run scripts"
    : !ParacoreConnected
      ? "Paracore is disconnected"
      : revitStatus?.document === null
        ? "No document opened in Revit"
        : !isCompatibleWithDocument
          ? `Script requires '${requiredDocType}' but current is '${currentDocType}'`
          : validationErrors.length > 0
            ? `Issues: ${validationErrors.join(', ')}`
            : "Run this script";

  const getDisplayName = useCallback(() => {
    return script.metadata.displayName || script.name.replace(/\.(cs|ptool|wtool)$/i, "");
  }, [script]);

  const handleRunClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunButtonDisabled) return;
    setSelectedScript(script);
    setActiveInspectorTab('console');
    runScript(script);
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
      // If we deleted the whole script (not just scaffolding) and it was selected, clear the inspector
      if (!scaffoldingOnly && selectedScript?.id === script.id) {
        setSelectedScript(null);
      }
    } else {
      setDeleteError("An unexpected error occurred during deletion.");
    }
  };

  const { toggleFloatingCodeViewer } = useUI();

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
    setActiveInspectorTab,
    toggleFloatingCodeViewer,
    isAuthenticated,
    activeRole,
    ParacoreConnected
  };
};
