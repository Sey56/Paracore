import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export const useRapServerUrl = () => {
  const [rapServerUrl, setRapServerUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchRapServerUrl = async () => {
      // Check if running in Tauri environment
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_IPC__ !== undefined;

      if (isTauri) {
        try {
          const url = await invoke('get_rap_server_url');
          setRapServerUrl(url as string);
        } catch (error) {
          console.error('Failed to get rap server URL from Tauri backend:', error);
          setRapServerUrl('http://localhost:8000'); 
        }
      } else {
        // Fallback for browser development
        console.log('Running in browser mode, using default RAP server URL.');
        setRapServerUrl('http://localhost:8000');
      }
    };

    fetchRapServerUrl();
  }, []);

  return rapServerUrl;
};
