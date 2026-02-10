import axios from 'axios';
import { ChatResponse } from '../types/agentTypes';

const API_BASE_URL = 'http://127.0.0.1:8000';

export const agentService = {
  chat: async (threadId: string, message: string): Promise<ChatResponse> => {
    const response = await axios.post(`${API_BASE_URL}/agent/chat`, {
      thread_id: threadId,
      message,
    });
    return response.data;
  },

  resume: async (threadId: string): Promise<ChatResponse> => {
    const response = await axios.post(`${API_BASE_URL}/agent/resume`, {
      thread_id: threadId,
    });
    return response.data;
  },
};
