export interface PlaylistItem {
    scriptPath: string;
    parameters: Record<string, unknown>;
}

export interface Playlist {
    name: string;
    description: string;
    items: PlaylistItem[];
    filePath?: string;
    isFavorite?: boolean;
    sourcePath?: string; // To match how Scripts handle source paths (optional)
}
