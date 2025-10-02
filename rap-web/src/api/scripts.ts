import api from './axios';

export const getPublishedScripts = async (teamId: number) => {
  try {
    const response = await api.get(`/api/teams/${teamId}/published-scripts`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch published scripts:', error);
    throw error;
  }
};
