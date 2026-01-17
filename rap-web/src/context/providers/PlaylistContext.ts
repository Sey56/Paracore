import { createContext } from 'react';
import { Playlist } from '@/types/playlistModel';

export interface PlaylistContextProps {
    playlists: Playlist[];
    selectedPlaylist: Playlist | null;
    isLoading: boolean;

    selectPlaylist: (playlist: Playlist | null) => void;
    loadPlaylists: (folderPath: string) => Promise<void>;
    createPlaylist: (name: string, folderPath: string) => Promise<Playlist | undefined>;
    updatePlaylist: (playlist: Playlist) => Promise<boolean>;
    runPlaylist: (playlist: Playlist) => Promise<void>;
}

export const PlaylistContext = createContext<PlaylistContextProps>({
    playlists: [],
    selectedPlaylist: null,
    isLoading: false,

    selectPlaylist: () => { },
    loadPlaylists: async () => { },
    createPlaylist: async () => undefined,
    updatePlaylist: async () => false,
    runPlaylist: async () => { },
} as PlaylistContextProps);
