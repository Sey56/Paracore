import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useScripts } from '../../hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useScriptExecution } from '@/features/automation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { Script } from '@/types/scriptModel';

// Components
import { NewScriptModal } from '@/features/automation/components/NewScriptModal';
import { ScriptInspector } from '@/features/automation/components/ScriptInspector/ScriptInspector';
import { FilterPills } from '@/components/common/FilterPills';
import { FocusOverlay } from './components/FocusOverlay';
import { GalleryInfoBar } from './components/GalleryInfoBar';
import { CommandConsole } from './components/CommandConsole';
import { GalleryActionBar } from './components/GalleryActionBar';
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
  const { isAuthenticated } = useAuth();
  const isMobile = useBreakpoint();
  
  const [configuredScript, setConfiguredScript] = useState<Script | null>(null);

  const handleScriptSelect = useCallback((script: Script) => {
    setSelectedScript(script);
  }, [setSelectedScript]);

  const handleConfigureScript = useCallback((script: Script) => {
    setConfiguredScript(script);
    setSelectedScript(script);
    setActiveInspectorTab('parameters');
    if (isMobile) setInspectorOpen(true);
  }, [setSelectedScript, setActiveInspectorTab, isMobile, setInspectorOpen]);

  const handleBackFromConfigure = useCallback(() => {
    setConfiguredScript(null);
  }, []);

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

  // If selected script becomes null, we exit focus mode automatically
  useEffect(() => {
    if (!selectedScript && isFocusMode) {
      setFocusMode(false);
      setSourceRect(null);
    }
  }, [selectedScript, isFocusMode, setFocusMode]);

  // Ref to always hold latest scripts for closure-safe access in timers
  const scriptsRef = useRef(scripts);
  useEffect(() => { scriptsRef.current = scripts; }, [scripts]);

  const handleReplaceScript = useCallback((script: Script) => {
    setScriptToReplace(script);
    if (script.metadata.isWatchdog) {
      openNewSentinelModal();
    } else {
      openNewScriptModal();
    }
  }, [openNewSentinelModal, openNewScriptModal]);

  const handleCloseModal = (resultScript?: Script) => {
    setScriptToReplace(null);
    closeNewScriptModal();
    closeNewSentinelModal();

    if (!resultScript) return;

    // The backend may return {success, path} (new script) or a Script object (replace).
    // Extract the path from whichever shape we got.
    const resultPath = ('path' in resultScript ? (resultScript as unknown as { path: string }).path : undefined) || resultScript.absolutePath || resultScript.id || '';
    if (!resultPath) return;

    // Store the path — createNewScript already triggered a gallery reload.
    // We poll the scripts list until the new script appears, then select + scroll.
    const normalizedTarget = resultPath.replace(/\\/g, '/').toLowerCase();

    const trySelectAndScroll = (attempt: number) => {
      // Search through the current scripts list for a path match
      const found = scriptsRef.current.find(s => {
        const sPath = (s.absolutePath || s.id || '').replace(/\\/g, '/').toLowerCase();
        return sPath === normalizedTarget || sPath.includes(normalizedTarget) || normalizedTarget.includes(sPath);
      });

      if (found) {
        setSelectedScript(found);
        setActiveInspectorTab('parameters');

        // Scroll to the card
        setTimeout(() => {
          const cardElement = document.getElementById(`script-card-${found.id}`);
          if (cardElement) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            // Fallback: search all cards by normalized path
            const normalizedId = found.id.toLowerCase().replace(/\\/g, '/');
            const allCards = document.querySelectorAll('.script-card');
            const foundCard = Array.from(allCards).find(el =>
              el.id.toLowerCase().replace(/\\/g, '/').includes(normalizedId)
            );
            if (foundCard) {
              foundCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }, 200);
      } else if (attempt < 6) {
        // Scripts list may not have updated yet — retry up to 3 seconds
        setTimeout(() => trySelectAndScroll(attempt + 1), 500);
      }
    };

    // Start trying after a short delay for the state to propagate
    setTimeout(() => trySelectAndScroll(0), 400);
  };

  const handleEnterFocusMode = useCallback((rect: DOMRect) => {
    if (galleryRef.current && galleryRef.current.parentElement) {
      savedScrollTop.current = galleryRef.current.parentElement.scrollTop;
    }
    setSourceRect(rect);
    setFocusMode(true);
  }, [setFocusMode]);

  const handleExitFocusMode = useCallback(() => {
    setFocusMode(false);
    setSourceRect(null);
  }, [setFocusMode]);

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

  const canCreateScripts = isAuthenticated;

  const isFromActiveSource = useCallback((script: Script) => {
    if (!script || !script.absolutePath) return false;
    const sourcePath = (activeScriptSource && 'path' in activeScriptSource) ? activeScriptSource.path : null;
    if (sourcePath) {
      return script.absolutePath.toLowerCase().startsWith(sourcePath.toLowerCase());
    }
    return false;
  }, [activeScriptSource]);

  // When configuring a script, show the parameters view inline
  if (configuredScript) {
    return (
      <div className="h-full">
        <ScriptInspector onBack={handleBackFromConfigure} />
      </div>
    );
  }

  return (
    <div ref={galleryRef} className={`relative min-h-full min-w-0 ${isFocusMode || isArmingWatchdogs ? 'overflow-hidden' : ''}`}>
      <div className={`p-4 transition-opacity duration-300 ${(isFocusMode || isArmingWatchdogs) ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {!activeScriptSource ? (
          <NoActiveSource />
        ) : (
          <>
            {/* Sticky controls block */}
            <div className="sticky top-0 z-10 bg-[var(--bg-ground)] pb-4">
              <GalleryInfoBar
                isAuthenticated={isAuthenticated}
                selectedDefaultCategories={selectedDefaultCategories}
                handleDefaultCategoryChange={handleDefaultCategoryChange}
                activeScriptSource={activeScriptSource}
                selectedFolder={selectedFolder}
                onRefresh={() => {
                  const path = activeScriptSource && 'path' in activeScriptSource ? activeScriptSource.path : selectedFolder;
                  if (path) loadScriptsForFolder(path);
                }}
                canCreateScripts={canCreateScripts}
                onNewScript={openNewScriptModal}
                onNewSentinel={openNewSentinelModal}
              />

              {pillFilters.length > 0 && (
                <div className="px-3 pb-1">
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
                totalUnits={scripts.length}
                filteredCount={favoriteScripts.length + otherScripts.length}
              />

              {selectedScript && (
                <GalleryActionBar
                  script={selectedScript}
                  onFocus={handleEnterFocusMode}
                  onReplace={handleReplaceScript}
                  onConfigure={handleConfigureScript}
                />
              )}
            </div>

            <ScriptGrid
              favoriteScripts={favoriteScripts}
              otherScripts={otherScripts}
              handleScriptSelect={handleScriptSelect}
              isFromActiveSource={isFromActiveSource}
              isCompactView={isCompactView}
              handleEnterFocusMode={handleEnterFocusMode}
              handleReplaceScript={handleReplaceScript}
              handleDoubleClickScript={handleConfigureScript}
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
