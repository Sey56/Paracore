import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppProvider';
import { ThemeProvider } from './context/ThemeProvider';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { initTelemetry } from './utils/telemetry';
import './styles/globals.css';

// Initialize anonymous telemetry tracking if user is opted-in
initTelemetry();

// ── Global Tooltip Hijacker ──
// Converts native `title` attributes to `data-tooltip` so the CSS custom
// tooltip system renders them instead of the unstyled browser defaults.
const convertTitles = (root: Element | Document) => {
  root.querySelectorAll('[title]').forEach((el) => {
    if (el.tagName === 'title') return; // skip <title> elements
    const val = el.getAttribute('title');
    if (val) {
      el.setAttribute('data-tooltip', val);
      el.removeAttribute('title');
    }
  });
};

// Process existing elements
convertTitles(document);

// Watch for dynamically added elements
new MutationObserver((mutations) => {
  for (const m of mutations) {
    // Handle newly added nodes
    for (const node of m.addedNodes) {
      if (node instanceof Element) {
        if (node.hasAttribute('title') && node.tagName !== 'TITLE') {
          const val = node.getAttribute('title');
          if (val) { node.setAttribute('data-tooltip', val); node.removeAttribute('title'); }
        }
        convertTitles(node);
      }
    }
    // Handle attribute changes on existing elements
    if (m.type === 'attributes' && m.attributeName === 'title' && m.target instanceof Element) {
      const el = m.target;
      if (el.tagName === 'TITLE') return;
      const val = el.getAttribute('title');
      if (val) { el.setAttribute('data-tooltip', val); el.removeAttribute('title'); }
    }
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <AppProvider>
          <App />
          <Toaster />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
