import React, { useState, useRef, useLayoutEffect } from 'react';
import { useScripts } from '../../hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { Script } from '@/types/scriptModel';

// Components
import { NewScriptModal } from '@/features/automation/components/NewScriptModal';
import { FilterPills } from '@/components/common/FilterPills';
import { FocusOverlay } from './components/FocusOverlay';
import { GalleryHeader } from './components/GalleryHeader';
import { CommandConsole } from './components/CommandConsole';
import { ScriptGrid } from './components/ScriptGrid';
import { NoActiveSource } from './components/NoActiveSource';

// Hooks
import { useGalleryFilters } from './hooks/useGalleryFilters';

export const ScriptGallery: React.FC = () => {
  const { ParacoreConnected } = useRevitStatus();
  const { scripts, selectedFolder, loadScriptsForFolder, favoriteScripts: favoriteIds } = useScripts();
  const { isArmingWatchdogs } = useWatchdog();
  const {
    openNewScriptModal,
    closeNewScriptModal,
    isNewScriptModalOpen,
    openNewSentinelModal,
    closeNewSentinelModal,
    isNewSentinelModalOpen,
    activeScriptSource,
    isFocusMode,
    setFocusMode,
    setInspectorOpen,
    selectedCategory,
    setActiveInspectorTab
  } = useUI();
  const { setSelectedScript, selectedScript } = useScriptExecution();
  const { isAuthenticated, activeRole } = useAuth();
  const isMobile = useBreakpoint();

  // 1. Filtering Logic
  const {
    searchTerm, setSearchTerm,
    sortOrder, setSortOrder,
    selectedDefaultCategories, handleDefaultCategoryChange,
    typeFilter, setTypeFilter,
    pillFilters, handleRemoveFilter,
    favoriteScripts, otherScripts
  } = useGalleryFilters(scripts, favoriteIds, selectedCategory);

  const [isCompactView, setIsCompactView] = useState(false);
  const [scriptToReplace, setScriptToReplace] = useState<Script | null>(null);

  // 2. Scroll & Focus Logic
  const galleryRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null);

  const handleReplaceScript = (script: Script) => {
    setScriptToReplace(script);
    if (script.metadata.isWatchdog) {
      openNewSentinelModal();
    } else {
      openNewScriptModal();
    }
  };

  const handleCloseModal = (resultScript?: Script) => {
    setScriptToReplace(null);
    closeNewScriptModal();
    closeNewSentinelModal();

    if (resultScript && resultScript.id) {
      setSelectedScript(resultScript);
      setActiveInspectorTab('parameters');

      // Use a timeout to ensure the gallery has fully re-rendered with the new units
      setTimeout(() => {
        const cardElement = document.getElementById(`script-card-${resultScript.id}`);
        if (cardElement && galleryRef.current?.parentElement) {
          cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  const handleEnterFocusMode = (rect: DOMRect) => {
    if (galleryRef.current && galleryRef.current.parentElement) {
      savedScrollTop.current = galleryRef.current.parentElement.scrollTop;
    }
    setSourceRect(rect);
    setFocusMode(true);
  };

  const handleExitFocusMode = () => {
    setFocusMode(false);
    setSourceRect(null);
  };

  useLayoutEffect(() => {
    const parent = galleryRef.current?.parentElement;
    if (!parent) return;

    if (isFocusMode) {
      const originalOverflow = parent.style.overflow;
      parent.style.overflow = 'hidden';
      return () => { parent.style.overflow = originalOverflow; };
    } else {
      parent.scrollTop = savedScrollTop.current;
    }
  }, [isFocusMode]);

  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';

  const isFromActiveSource = (script: Script) => {
    if (!script || !script.absolutePath) return false;
    const sourcePath = (activeScriptSource && 'path' in activeScriptSource) ? activeScriptSource.path : null;
    if (sourcePath) {
      return script.absolutePath.toLowerCase().startsWith(sourcePath.toLowerCase());
    }
    return false;
  };

  return (
    <div ref={galleryRef} className={`relative min-h-full min-w-0 ${isFocusMode || isArmingWatchdogs ? 'overflow-hidden' : ''}`}>
      <div className={`p-4 transition-opacity duration-300 ${(isFocusMode || isArmingWatchdogs) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {!activeScriptSource ? (
          <NoActiveSource />
        ) : (
          <>
            <GalleryHeader
              isAuthenticated={isAuthenticated}
              selectedDefaultCategories={selectedDefaultCategories}
              handleDefaultCategoryChange={handleDefaultCategoryChange}
              activeScriptSource={activeScriptSource}
              selectedFolder={selectedFolder}
              totalUnits={favoriteScripts.length + otherScripts.length}
              onRefresh={() => {
                const path = activeScriptSource && 'path' in activeScriptSource ? activeScriptSource.path : selectedFolder;
                if (path) loadScriptsForFolder(path);
              }}
              canCreateScripts={canCreateScripts}
              onNewScript={openNewScriptModal}
              onNewSentinel={openNewSentinelModal}
            />

            {pillFilters.length > 0 && (
              <div className="mb-6">
                <FilterPills filters={pillFilters} onRemoveFilter={handleRemoveFilter} />
              </div>
            )}

            <CommandConsole
              isAuthenticated={isAuthenticated}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              isCompactView={isCompactView}
              setIsCompactView={setIsCompactView}
            />

            <ScriptGrid
              favoriteScripts={favoriteScripts}
              otherScripts={otherScripts}
              handleScriptSelect={(script) => {
                setSelectedScript(script);
                setActiveInspectorTab('parameters');
                if (isMobile) setInspectorOpen(true);
              }}
              isFromActiveSource={isFromActiveSource}
              isCompactView={isCompactView}
              handleEnterFocusMode={handleEnterFocusMode}
              handleReplaceScript={handleReplaceScript}
              isAuthenticated={isAuthenticated}
              searchTerm={searchTerm}
            />
          </>
        )}
      </div>

      {isFocusMode && selectedScript && (
        <FocusOverlay
          script={selectedScript}
          sourceRect={sourceRect}
          onExit={handleExitFocusMode}
          isFromActiveSource={isFromActiveSource(selectedScript)}
          targetElement={galleryRef.current?.parentElement || null}
        />
      )}

      {selectedFolder && (
        <>
          <NewScriptModal
            isOpen={isNewScriptModalOpen}
            onClose={handleCloseModal}
            selectedFolder={selectedFolder as string}
            scriptToReplace={scriptToReplace}
            mode="script"
          />
          <NewScriptModal
            isOpen={isNewSentinelModalOpen}
            onClose={handleCloseModal}
            selectedFolder={selectedFolder as string}
            scriptToReplace={scriptToReplace}
            mode="sentinel"
          />
        </>
      )}
    </div>
  );
};
