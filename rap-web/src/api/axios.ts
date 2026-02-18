import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

// Request interceptor to add the auth token
api.interceptors.request.use(
  (config) => {
    // Use the cloud token which is set upon login
    const token = localStorage.getItem('rap_cloud_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      console.error("Unauthorized or session expired. Logging out.");

      // Clear all auth-related tokens and user info
      localStorage.removeItem('rap_cloud_token');
      localStorage.removeItem('rap_local_token');
      localStorage.removeItem('rap_user');
      localStorage.removeItem('rap_active_team');

      // We do NOT reload here anymore, as it causes infinite loops during startup transitions.
      // The app state will eventually react to the cleared localStorage or return to login on next action.
    }
    return Promise.reject(error);
  }
);

export default api;
