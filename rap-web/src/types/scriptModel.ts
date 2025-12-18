export interface ScriptParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  value?: string | number | boolean;
  defaultValue?: string | number | boolean;
  options?: string[];
  multiSelect?: boolean;
  description?: string;
  visibleWhen?: string;
  numericType?: string;
  min?: number;
  max?: number;
  step?: number;
  isRevitElement?: boolean;
  revitElementType?: string;
  revitElementCategory?: string;
  requiresCompute?: boolean;
}

export interface RawScriptParameterData {
  name: string;
  type: string;
  defaultValueJson: string;
  description: string;
  options: string[];
  multiSelect?: boolean;
  visibleWhen?: string;
  numericType?: string;
  min?: number;
  max?: number;
  step?: number;
  isRevitElement?: boolean;
  revitElementType?: string;
  revitElementCategory?: string;
  requiresCompute?: boolean;
}

export interface StructuredOutput {
  type: string;
  data: string;
}

export interface ScriptExecutionResult {
  output: string;
  error: string | null;
  isSuccess: boolean;
  structuredOutput?: StructuredOutput[];
}

export interface GitInfo {
  lastCommitDate?: string;
  lastCommitAuthor?: string;
  lastCommitMessage?: string;
}

export interface ScriptMetadata {
  displayName: string;
  lastRun: string | null;
  dependencies: string[];
  description: string;
  categories: string[];
  author?: string;
  website?: string;
  documentType?: 'ConceptualMass' | 'Family' | 'Project' | 'Any' | null;
  dateCreated?: string;
  dateModified?: string;
  gitInfo?: GitInfo;
  usage_examples?: string[];
}

export interface RawGitInfoFromApi {
  last_commit_date?: string;
  last_commit_author?: string;
  last_commit_message?: string;
}

export interface RawScriptMetadataFromApi {
  displayName: string;
  lastRun: string | null;
  dependencies: string[];
  description: string;
  categories: string[];
  author?: string;
  website?: string;
  document_type?: 'ConceptualMass' | 'Family' | 'Project' | 'Any' | null;
  git_info?: RawGitInfoFromApi;
  usage_examples?: string[];
  dateCreated?: string;
  dateModified?: string;
}

export interface RawScriptFromApi {
  id: string;
  name: string;
  type: "single-file" | "multi-file";
  sourcePath: string;
  absolutePath: string;
  parameters: ScriptParameter[];
  metadata: RawScriptMetadataFromApi;
  isFavorite?: boolean;
  metadataError?: boolean;
}

export interface Script {
  id: string;
  name: string;
  type: "single-file" | "multi-file";
  sourcePath: string;
  absolutePath: string;
  parameters: ScriptParameter[];
  metadata: ScriptMetadata;
  isFavorite?: boolean;
  metadataError?: boolean;
  sourceType?: 'local' | 'workspace';
}