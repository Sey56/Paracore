import React, { useState } from 'react';
import { FontAwesomeIcon } from '@/components/ui/Icon';
import { faSpinner } from '@/components/ui/iconAliases';
import { Modal } from '@/components/common/Modal';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';
import { Script } from '@/types/scriptModel';

interface ExportDynamoModalProps {
  isOpen: boolean;
  onClose: () => void;
  script: Script;
  isRevitConnected: boolean;
}

interface ExportResult {
  is_success: boolean;
  export_kind: string;
  dry_run: boolean;
  report: string[];
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  contract_sha256: string;
  error_message: string;
}

const KINDS = [
  { value: 'Methods', label: 'Methods', ready: true },
  { value: 'Graph', label: 'Graph', ready: true },
  { value: 'Nodes', label: 'Nodes / package', ready: false },
];

export const ExportDynamoModal: React.FC<ExportDynamoModalProps> = ({
  isOpen,
  onClose,
  script,
  isRevitConnected,
}) => {
  const { showNotification } = useNotifications();
  const [exportKind, setExportKind] = useState('Methods');
  const [dryRun, setDryRun] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [classPrefix, setClassPrefix] = useState('');
  const [graphName, setGraphName] = useState('');
  const [assemblyName, setAssemblyName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [dynamoVersion, setDynamoVersion] = useState('3.3');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const response = await api.post('/api/scripts/export-dynamo', {
        scriptPath: script.absolutePath,
        exportKind,
        outputFolder: '',
        classPrefix: classPrefix,
        graphName,
        assemblyName,
        packageName,
        dynamoVersion: dynamoVersion || '3.3',
        dryRun,
        overwriteExisting,
      });
      setResult(response.data);
      showNotification(
        response.data.is_success
          ? dryRun ? 'Dynamo export dry run complete.' : 'Dynamo package written.'
          : response.data.error_message || 'Dynamo export failed.',
        response.data.is_success ? 'success' : 'error'
      );
    } catch (error: any) {
      const message = error.response?.data?.detail || error.message || 'Dynamo export failed.';
      setResult({
        is_success: false,
        export_kind: exportKind,
        dry_run: dryRun,
        report: [],
        artifacts: [],
        contract_sha256: '',
        error_message: message,
      });
      showNotification(message, 'error');
    } finally {
      setRunning(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400';

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!running) onClose(); }} title="Export Dynamo" size="lg">
      <div className="space-y-4 overflow-y-auto pr-1">
        {!isRevitConnected && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
            Connect Revit to run the export. This uses the same in-Revit engine path as the gallery Run button.
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Export kind</label>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map(kind => (
              <button key={kind.value} type="button" disabled={!kind.ready || running}
                onClick={() => { setExportKind(kind.value); setResult(null); }}
                className={`px-3 py-2 rounded-lg border text-sm font-bold text-left transition-colors ${
                  exportKind === kind.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                } ${!kind.ready ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {kind.label}
                {!kind.ready && <span className="ml-2 text-[10px] font-normal">next</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {exportKind === 'Graph' ? (
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Graph name (optional)</label>
              <input className={inputClass} value={graphName} onChange={e => setGraphName(e.target.value)} placeholder={script?.name ? `Paracore_${script.name}` : 'Paracore_MyTool'} />
            </div>
          ) : (
            <>
              {exportKind === 'Methods' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Class prefix (optional)</label>
                  <input className={inputClass} value={classPrefix} onChange={e => setClassPrefix(e.target.value)} placeholder="Paracore" />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Assembly (optional)</label>
                <input className={inputClass} value={assemblyName} onChange={e => setAssemblyName(e.target.value)} placeholder="Generated from class" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Package (optional)</label>
                <input className={inputClass} value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Paracore_..." />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Dynamo version</label>
            <input className={inputClass} value={dynamoVersion} onChange={e => setDynamoVersion(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            Dry run (preview only)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={overwriteExisting} onChange={e => setOverwriteExisting(e.target.checked)} />
            Overwrite existing package
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={running}
            className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            Cancel
          </button>
          <button onClick={run} disabled={running || !isRevitConnected}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2">
            {running && <FontAwesomeIcon icon={faSpinner} spin className="text-sm" />}
            {dryRun ? 'Preview export' : exportKind === 'Graph' ? 'Write graph' : 'Write package'}
          </button>
        </div>

        {result && (
          <div className={`p-3 rounded-lg border text-sm ${result.is_success ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
            <div className="font-bold mb-2">{result.is_success ? (result.dry_run ? 'Dry run complete' : 'Package written') : 'Export failed'}</div>
            {result.error_message && <div className="mb-2">{result.error_message}</div>}
            {result.contract_sha256 && <div className="font-mono text-xs break-all">contract {result.contract_sha256}</div>}
            {result.artifacts.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.artifacts.map(artifact => (
                  <div key={artifact.path} className="font-mono text-xs break-all">
                    {artifact.path} · {artifact.bytes} B · {artifact.sha256.slice(0, 12)}
                  </div>
                ))}
              </div>
            )}
            {result.report.length > 0 && (
              <pre className="mt-3 p-2 rounded bg-black/5 dark:bg-black/20 text-[11px] overflow-x-auto">{result.report.join('\n')}</pre>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
