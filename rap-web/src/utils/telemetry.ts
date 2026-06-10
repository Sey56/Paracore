import posthog from 'posthog-js';

const TELEMETRY_KEY = 'paracore_telemetry_optin';
const ANON_ID_KEY = 'paracore_anonymous_id';

export const isTelemetryEnabled = (): boolean => {
  // Default to false for privacy. Users can opt-in.
  return localStorage.getItem(TELEMETRY_KEY) === 'true';
};

export const setTelemetryEnabled = (enabled: boolean) => {
  localStorage.setItem(TELEMETRY_KEY, enabled.toString());
  if (enabled) {
    posthog.opt_in_capturing();
    initTelemetry();
  } else {
    posthog.opt_out_capturing();
  }
};

export const initTelemetry = () => {
  if (!isTelemetryEnabled()) return;

  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!apiKey) {
    console.warn('[Telemetry] VITE_POSTHOG_KEY is not set. Telemetry is disabled natively.');
    return;
  }

  // Generate an Installation ID securely decoupling it from any personal user info
  let anonId = localStorage.getItem(ANON_ID_KEY);
  if (!anonId) {
    anonId = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, anonId);
  }

  posthog.init(apiKey, {
    api_host: apiHost,
    autocapture: false, // Privacy first: disable aggressive auto-capturing
    capture_pageview: true,
    capture_pageleave: false,
    disable_session_recording: true,
    loaded: (ph: any) => {
      ph.identify(anonId!);
    }
  });
};

export const trackEvent = (eventName: string, properties?: Record<string, unknown>) => {
  if (isTelemetryEnabled() && import.meta.env.VITE_POSTHOG_KEY) {
    posthog.capture(eventName, properties);
  }
};
