import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faTags, faTimes } from '@fortawesome/free-solid-svg-icons';
import { Script } from '@/types/scriptModel';
import { Modal } from '@/components/common/Modal';
import api from '@/api/axios';

interface EditMetadataModalProps {
    isOpen: boolean;
    onClose: () => void;
    script: Script;
    onSaved: () => void;
}

interface MetadataFields {
    documentType: string;
    categories: string[];
    author: string;
    dependencies: string;
    description: string;
}

const DOC_TYPES = ['Project', 'Family', 'ConceptualMass'];

// Regex to match the /* ... */ metadata block (no ^ anchor to allow BOM/whitespace)
const METADATA_BLOCK_REGEX = /\/\*[\s\S]*?\*\//;

function parseMetadataBlock(source: string): MetadataFields {
    // We search only in the first 2000 chars to avoid scanning entire large files
    const head = source.substring(0, 2000);
    const match = head.match(METADATA_BLOCK_REGEX);

    const defaults: MetadataFields = {
        documentType: 'Project',
        categories: [],
        author: '',
        dependencies: 'RevitAPI 2025+, Paracore.Addin',
        description: ''
    };

    if (!match) return defaults;

    const block = match[0];
    const fields: MetadataFields = { ...defaults };

    const content = block.replace(/^\/\*\s*/, '').replace(/\s*\*\/\s*$/, '');
    const lines = content.split(/\r?\n/).map(l => l.trim().replace(/^\*\s?/, ''));

    let currentKey = '';
    let currentValue: string[] = [];

    const flushKey = () => {
        if (currentKey && currentValue.length > 0) {
            const val = currentValue.join('\n').trim();
            const key = currentKey.toLowerCase().replace(/\s+/g, '');
            if (key === 'documenttype') fields.documentType = val;
            else if (key === 'categories') fields.categories = val.split(',').map(c => c.trim()).filter(Boolean);
            else if (key === 'author') fields.author = val;
            else if (key === 'dependencies') fields.dependencies = val;
            else if (key === 'description') fields.description = val;
        }
        currentValue = [];
    };

    const keyRegex = /^([a-zA-Z_\s]+):\s*(.*)/;
    for (const line of lines) {
        const m = line.match(keyRegex);
        if (m) {
            flushKey();
            currentKey = m[1].trim();
            if (m[2].trim()) currentValue.push(m[2].trim());
        } else if (currentKey) {
            currentValue.push(line);
        }
    }
    flushKey();

    // Enforce valid DocTypes
    if (!DOC_TYPES.includes(fields.documentType)) {
        fields.documentType = 'Project';
    }

    return fields;
}

function serializeMetadataBlock(fields: MetadataFields): string {
    const lines = ['/*'];
    lines.push(`DocumentType: ${fields.documentType || 'Project'}`);
    if (fields.categories && fields.categories.length > 0) {
        lines.push(`Categories: ${fields.categories.join(', ')}`);
    }
    if (fields.author) lines.push(`Author: ${fields.author}`);
    if (fields.dependencies) lines.push(`Dependencies: ${fields.dependencies}`);
    if (fields.description) {
        lines.push('');
        lines.push('Description:');
        fields.description.split('\n').forEach(l => lines.push(l));
    }
    lines.push('*/');
    return lines.join('\n');
}

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({
    isOpen,
    onClose,
    script,
    onSaved
}) => {
    const [fields, setFields] = useState<MetadataFields>({
        documentType: 'Project',
        categories: [],
        author: '',
        dependencies: '',
        description: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load raw main file on open
    useEffect(() => {
        if (!isOpen) return;
        setError(null);

        const loadSource = async () => {
            setIsLoading(true);
            try {
                const response = await api.get(`/api/scripts/raw-main-file?scriptPath=${encodeURIComponent(script.absolutePath)}`);
                const source = response.data.content || '';
                setFields(parseMetadataBlock(source));
            } catch (err) {
                console.error('[EditMetadataModal] Failed to load source:', err);
                setError('Failed to load script source.');
            } finally {
                setIsLoading(false);
            }
        };
        loadSource();
    }, [isOpen, script.absolutePath]);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const newBlock = serializeMetadataBlock(fields);

            await api.post('/api/scripts/update-metadata', {
                script_path: script.absolutePath,
                metadata_block: newBlock
            });

            onSaved();
            onClose();
        } catch (err) {
            console.error('[EditMetadataModal] Failed to save metadata:', err);
            setError('Failed to save metadata. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const updateField = (key: keyof MetadataFields, value: string | string[]) => {
        setFields(prev => ({ ...prev, [key]: value }));
    };

    // Category chip logic
    const categoryList = fields.categories;

    const removeCategory = (index: number) => {
        const updated = [...categoryList];
        updated.splice(index, 1);
        updateField('categories', updated);
    };

    const [categoryInput, setCategoryInput] = useState('');
    const addCategory = () => {
        const trimmed = categoryInput.trim();
        if (!trimmed || categoryList.length >= 3) return;
        if (categoryList.includes(trimmed)) { setCategoryInput(''); return; }
        updateField('categories', [...categoryList, trimmed]);
        setCategoryInput('');
    };

    const isGuard = script.metadata?.isWatchdog;

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => !isSaving && onClose()}
            title={`Edit ${isGuard ? 'Sentinel' : 'Script'} Metadata`}
            size="md"
        >
            <div className="max-h-[50vh] overflow-y-auto custom-scrollbar space-y-5 pr-1">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                ) : (
                    <>
                        {/* DocumentType */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Document Type
                            </label>
                            <select
                                value={fields.documentType}
                                onChange={(e) => updateField('documentType', e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                            >
                                {DOC_TYPES.map((dt) => (
                                    <option key={dt} value={dt}>{dt}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Restricts this {isGuard ? 'sentinel' : 'script'} to a specific Revit document environment.
                            </p>
                        </div>

                        {/* Categories */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Categories <span className="text-slate-300 dark:text-slate-600 font-normal">({categoryList.length}/3)</span>
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {categoryList.map((cat, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold border border-blue-100 dark:border-blue-800/40"
                                    >
                                        {cat}
                                        <button
                                            onClick={() => removeCategory(i)}
                                            className="hover:text-red-500 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faTimes} className="text-[9px]" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            {categoryList.length < 3 && (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={categoryInput}
                                        onChange={(e) => setCategoryInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                                        placeholder="Add category..."
                                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                                    />
                                    <button
                                        onClick={addCategory}
                                        disabled={!categoryInput.trim()}
                                        className="px-4 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all disabled:opacity-40"
                                    >
                                        Add
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Author */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Author
                            </label>
                            <input
                                type="text"
                                value={fields.author}
                                onChange={(e) => updateField('author', e.target.value)}
                                placeholder="e.g. John Doe"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                            />
                        </div>

                        {/* Dependencies */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Dependencies
                            </label>
                            <input
                                type="text"
                                value={fields.dependencies}
                                onChange={(e) => updateField('dependencies', e.target.value)}
                                placeholder="e.g. RevitAPI 2025+, Paracore.Addin"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                            />
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Separate multiple dependencies with commas.
                            </p>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Description
                            </label>
                            <textarea
                                value={fields.description}
                                onChange={(e) => updateField('description', e.target.value)}
                                placeholder="What does this script do?"
                                rows={3}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all resize-none"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl uppercase tracking-wider transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={isLoading || isSaving}
                    className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isSaving ? (
                        <FontAwesomeIcon icon={faSpinner} spin />
                    ) : (
                        <FontAwesomeIcon icon={faTags} />
                    )}
                    {isSaving ? 'Saving...' : 'Save Metadata'}
                </button>
            </div>
        </Modal>
    );
};
