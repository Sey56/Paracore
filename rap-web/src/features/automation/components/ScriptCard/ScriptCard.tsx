import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Script } from "@/types/scriptModel";
import styles from './ScriptCard.module.css';

// Components
import { CardHeader } from './components/CardHeader';
import { CardBody } from './components/CardBody';
import { DeleteScriptModal } from './components/DeleteScriptModal';
import { EditMetadataModal } from './components/EditMetadataModal';

// Hooks
import { useScriptCard } from './hooks/useScriptCard';

export interface ScriptCardProps {
  script: Script;
  onSelect: () => void;
  isFromActiveSource: boolean;
  isSelected: boolean;
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
  isSelected,
  isCompact = false,
  showExitFocus = false,
  onExitFocus,
  onFocus,
  isHidden = false,
  onReplace
}) => {
  const cardRef = React.useRef<HTMLDivElement>(null);

  const {
    isRunning,
    isGuard,
    isProtectedTool,
    isArmed,
    isActiveInIDE,
    isRenaming,
    renameValue,
    setRenameValue,
    showDeleteModal,
    setShowDeleteModal,
    isDeleting,
    deleteError,
    setDeleteError,
    getDisplayName,
    handleFavoriteClick,
    handleSelect,
    handleStartRename,
    handleRenameSubmit,
    handleRenameKeyDown,
    handleDelete,
    isAuthenticated,
    showMetadataModal,
    setShowMetadataModal,
    reloadScript
  } = useScriptCard(script, onSelect, isSelected);

  return (
    <div
      id={`script-card-${script.id}`}
      ref={cardRef}
      style={{
        backgroundColor: isSelected ? 'var(--bg-card-focus)' : 'var(--bg-card)',
        borderColor: isSelected ? 'var(--accent)' : 'var(--border-main)',
      }}
      className={`${styles.scriptCard} script-card group rounded-xl shadow-sm transition-all duration-200 cursor-pointer flex flex-col relative ${isSelected ? styles.selectedCard : "border"
        } ${isRunning ? "opacity-70" : ""} ${!isAuthenticated ? "opacity-60 grayscale-[0.3]" : ""} ${isCompact ? "min-h-0" : ""} ${isProtectedTool ? styles.toolFile : ""} ${isGuard ? styles.guardCard : ""} ${showExitFocus ? styles.focusHero : ""} ${isHidden ? "opacity-0 pointer-events-none" : ""}`}
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
          onExitFocus={onExitFocus}
          isCompact={isCompact}
          getDisplayName={getDisplayName}
          handleFavoriteClick={handleFavoriteClick}
        />

        {!isCompact && <CardBody script={script} />}
      </div>

    </div>
  );
});
