import React from 'react';
import { Script } from "@/types/scriptModel";
import { useAuth } from '@/features/auth';
import { useRevitStatus } from "@/hooks/useRevitStatus";
import styles from './ScriptCard.module.css';

// Components
import { CardHeader } from './components/CardHeader';
import { CardBody } from './components/CardBody';
import { CardActions } from './components/CardActions';
import { DeleteScriptModal } from './components/DeleteScriptModal';
import { EditMetadataModal } from './components/EditMetadataModal';

// Hooks
import { useScriptCard } from './hooks/useScriptCard';

export interface ScriptCardProps {
  script: Script;
  onSelect: () => void;
  isFromActiveSource: boolean;
  isCompact?: boolean;
  showExitFocus?: boolean;
  onExitFocus?: () => void;
  onFocus?: (rect: DOMRect) => void;
  isHidden?: boolean;
  onReplace?: (script: Script) => void;
}

export const ScriptCard: React.FC<ScriptCardProps> = React.memo(({
  script,
  onSelect,
  isFromActiveSource,
  isCompact = false,
  showExitFocus = false,
  onExitFocus,
  onFocus,
  isHidden = false,
  onReplace
}) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const { ParacoreConnected } = useRevitStatus();
  const { user } = useAuth();

  const {
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
    renameValue,
    setRenameValue,
    showDeleteModal,
    setShowDeleteModal,
    isDeleting,
    deleteError,
    setDeleteError,
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
    isAuthenticated,
    activeRole,
    toggleFloatingCodeViewer,
    showMetadataModal,
    setShowMetadataModal,
    reloadScript
  } = useScriptCard(script, onSelect);

  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';

  const getEditTitleMessage = () => {
    if (!user) return "You must be signed in to edit scripts";
    if (!ParacoreConnected) return "Paracore is disconnected. Please connect to Revit.";
    if (script.metadata.isProtected) return "Source code for this tool is protected and cannot be edited.";
    return "Edit Script";
  };

  return (
    <div
      id={`script-card-${script.id}`}
      ref={cardRef}
      style={{
        backgroundColor: isSelected ? 'var(--bg-card-focus)' : 'var(--bg-card)',
        borderColor: isSelected ? 'var(--accent)' : 'var(--border-main)',
        borderWidth: isSelected ? '2px' : '1px'
      }}
      className={`${styles.scriptCard} script-card group rounded-xl shadow-sm transition-all duration-200 cursor-pointer flex flex-col ${isSelected ? styles.selectedCard : "border"
        } ${isRunning ? "opacity-70" : ""} ${!isAuthenticated ? "opacity-60 grayscale-[0.3]" : ""} ${isCompact ? "min-h-0" : ""} ${isProtectedTool ? styles.toolFile : ""} ${isGuard ? styles.guardCard : ""} ${showExitFocus ? styles.focusHero : ""} ${isHidden ? "opacity-0 pointer-events-none" : ""} ${showMenu ? styles.menuOpen : ""}`}
      onClick={handleSelect}
    >
      <DeleteScriptModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        isDeleting={isDeleting}
        deleteError={deleteError}
        isActiveInIDE={isActiveInIDE}
        isProtectedTool={isProtectedTool}
        isGuard={isGuard}
        displayName={getDisplayName()}
        onDelete={handleDelete}
      />

      {showMetadataModal && (
        <EditMetadataModal
          isOpen={showMetadataModal}
          onClose={() => setShowMetadataModal(false)}
          script={script}
          onSaved={() => {
            console.log(`[ScriptCard] Metadata saved for ${script.name}. Reloading...`);
            reloadScript(script);
          }}
        />
      )}

      <div className={`p-4 flex-grow flex flex-col ${isCompact ? "py-2" : ""}`}>
        <CardHeader
          script={script}
          isRenaming={isRenaming}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          handleRenameKeyDown={handleRenameKeyDown}
          handleRenameSubmit={handleRenameSubmit}
          isGuard={isGuard}
          isArmed={isArmed}
          isProtectedTool={isProtectedTool}
          isSelected={isSelected}
          showExitFocus={showExitFocus}
          isCompact={isCompact}
          getDisplayName={getDisplayName}
          handleFavoriteClick={handleFavoriteClick}
        />

        {!isCompact && <CardBody script={script} />}
      </div>

      <CardActions
        script={script}
        isRunning={isRunning}
        isRunButtonDisabled={isRunButtonDisabled}
        tooltipMessage={tooltipMessage}
        handleRunClick={handleRunClick}
        onFocus={onFocus}
        onExitFocus={onExitFocus}
        showExitFocus={showExitFocus}
        cardRef={cardRef}
        onSelect={handleSelect}
        isProtectedTool={isProtectedTool}
        isGuard={isGuard}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        menuRef={menuRef}
        canCreateScripts={canCreateScripts}
        editScript={editScript}
        onDelete={handleDelete}
        handleStartRename={handleStartRename}
        onReplace={onReplace}
        setShowDeleteModal={setShowDeleteModal}
        setDeleteError={setDeleteError}
        editTooltipMessage={getEditTitleMessage()}
        toggleFloatingCodeViewer={toggleFloatingCodeViewer}
        setShowMetadataModal={setShowMetadataModal}
        isSelected={isSelected}
      />
    </div>
  );
});
