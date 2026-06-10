import axios from 'axios';
import { ChatResponse } from '../types/agentTypes';

/**
 * Agent chat API service.
 *
 * The base URL defaults to localhost but should be overridden with the
 * actual RAP server URL (from useRapServerUrl hook) in production.
 */
const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

export const agentService = {
  chat: async (
    threadId: string,
    message: string,
    apiBaseUrl: string = DEFAULT_BASE_URL
  ): Promise<ChatResponse> => {
    const response = await axios.post(`${apiBaseUrl}/agent/chat`, {
      thread_id: threadId,
      message,
    });
    return response.data;
  },

  resume: async (
    threadId: string,
    apiBaseUrl: string = DEFAULT_BASE_URL
  ): Promise<ChatResponse> => {
    const response = await axios.post(`${apiBaseUrl}/agent/resume`, {
      thread_id: threadId,
    });
    return response.data;
  },
};
