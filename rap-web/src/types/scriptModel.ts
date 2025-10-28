export interface ScriptParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  value?: string | number | boolean;
  defaultValue?: string | number | boolean;
  options?: string[];
  description?: string;
}

export interface RawScriptParameterData {
  name: string;
  type: string;
  defaultValueJson: string;
  description: string;
  options: string[];
}

export interface StructuredOutput {
  type: string;
  data: string;
}

export interface ScriptExecutionResult {
  output: string;
  error: string | null;
  isSuccess: boolean;
  showOutputData?: StructuredOutput[];
}

export interface GitInfo {
  lastCommitDate?: string;
  lastCommitAuthor?: string;
  lastCommitMessage?: string;
}

export interface ScriptMetadata {
  displayName: string;
  tags: string[];
  version: string;
  lastRun: string | null;
  isDefault: boolean;
  dependencies: string[];
  description: string;
  categories: string[];
  author?: string;
  website?: string;
  history?: string;
  documentType?: 'ConceptualMass' | 'Family' | 'Project' | 'Any' | null;
  dateCreated?: string;
  dateModified?: string;
  gitInfo?: GitInfo;
}

export interface RawGitInfoFromApi {
  last_commit_date?: string;
  last_commit_author?: string;
  last_commit_message?: string;
}

export interface RawScriptMetadataFromApi {
  displayName: string;
  tags: string[];
  version: string;
  lastRun: string | null;
  isDefault: boolean;
  dependencies: string[];
  description: string;
  categories: string[];
  author?: string;
  website?: string;
  history?: string;
  document_type?: 'ConceptualMass' | 'Family' | 'Project' | 'Any' | null;
  git_info?: RawGitInfoFromApi;
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
  absolutePath: string; // ← Add here
  parameters: ScriptParameter[];
  metadata: ScriptMetadata;
  isFavorite?: boolean;
  metadataError?: boolean; // Added this line
  sourceType?: 'local' | 'workspace';
}

export type InspectorTab = "parameters" | "agent" | "log" | "summary" | "metadata";