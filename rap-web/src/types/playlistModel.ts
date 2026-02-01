import { ExecutionResult } from "./common";

export interface PlaylistItem {
    scriptPath: string;
    parameters: Record<string, string | number | boolean>;
}

export interface Playlist {
    name: string;
    description: string;
    items: PlaylistItem[];
    filePath?: string;
    isFavorite?: boolean;
    sourcePath?: string; // To match how Scripts handle source paths (optional)
    lastExecutionResults?: Record<number, ExecutionResult>; // Record<index, ExecutionResult>
}
