import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export const useRapServerUrl = () => {
  const [rapServerUrl, setRapServerUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchRapServerUrl = async () => {
      try {
        const url = await invoke('get_rap_server_url');
        setRapServerUrl(url as string);
      } catch (error) {
        console.error('Failed to get rap server URL from Tauri backend:', error);
        // Fallback to a default or handle error appropriately
        setRapServerUrl('http://localhost:8000'); 
      }
    };

    fetchRapServerUrl();
  }, []);

  return rapServerUrl;
};