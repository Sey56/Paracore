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

// Track pending refresh to avoid stacking multiple refresh attempts
let _isRefreshing = false;
let _refreshPromise: Promise<boolean> | null = null;
let _pendingRequests: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = [];

function _clearPendingRequests(success: boolean) {
  const queue = _pendingRequests;
  _pendingRequests = [];
  queue.forEach(({ resolve, reject }) => {
    if (success) resolve(undefined);
    else reject(new Error('Session refresh failed'));
  });
}

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response && error.response.status === 401) {
      const originalRequest = error.config;

      // Only attempt refresh once per request (avoid loops)
      if (!(originalRequest as any)._retry) {
        (originalRequest as any)._retry = true;

        // If a refresh is already in progress, queue this request and wait
        if (_isRefreshing && _refreshPromise) {
          return new Promise((resolve, reject) => {
            _pendingRequests.push({ resolve, reject });
          }).then(() => api(originalRequest));
        }

        _isRefreshing = true;

        // Signal AuthProvider to re-authenticate (triggers Google OAuth flow)
        window.dispatchEvent(new Event('paracore-auth-expiring'));

        // Wait for AuthProvider to handle the refresh (or timeout after 120s)
        _refreshPromise = new Promise<boolean>((resolve) => {
          const onRefreshed = () => {
            cleanup();
            resolve(true);
          };
          const onExpired = () => {
            cleanup();
            resolve(false);
          };
          const cleanup = () => {
            window.removeEventListener('paracore-auth-refreshed', onRefreshed);
            window.removeEventListener('paracore-auth-expired', onExpired);
          };
          window.addEventListener('paracore-auth-refreshed', onRefreshed, { once: true });
          window.addEventListener('paracore-auth-expired', onExpired, { once: true });

          // Safety timeout: if neither event fires within 120s, give up
          setTimeout(() => {
            cleanup();
            resolve(false);
          }, 120_000);
        });

        const refreshed = await _refreshPromise;
        _isRefreshing = false;
        _refreshPromise = null;

        if (refreshed) {
          // Update the Authorization header with the new token
          const newToken = localStorage.getItem('rap_cloud_token');
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          _clearPendingRequests(true);
          return api(originalRequest);
        } else {
          // Refresh failed or user cancelled — now we do the hard logout
          console.error("Session refresh failed. Logging out.");
          localStorage.removeItem('rap_cloud_token');
          localStorage.removeItem('rap_local_token');
          localStorage.removeItem('rap_user');
          localStorage.removeItem('rap_active_team');
          window.dispatchEvent(new Event('paracore-auth-expired'));
          _clearPendingRequests(false);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
