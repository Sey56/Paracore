import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faBolt, faTerminal, faShieldAlt, faBook, faUserCheck, faArrowRight, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { shell } from '@tauri-apps/api';

interface WelcomeGateProps {
  login: () => Promise<void>;
  loginLocal: () => Promise<void>;
  isAuthenticated?: boolean;
  onDismiss?: () => void;
}

export const WelcomeGate: React.FC<WelcomeGateProps> = ({ login, loginLocal, isAuthenticated = false, onDismiss }) => {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isOfflineLoading, setIsOfflineLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await login();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleOfflineLogin = async () => {
    setIsOfflineLoading(true);
    try {
      await loginLocal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsOfflineLoading(false);
    }
  };

  const handleOpenHelp = async () => {
    try {
      await shell.open('https://sey56.github.io/paracore-help');
    } catch (err) {
      console.error("Failed to open help link:", err);
    }
  };

  return (
    <div className="flex-1 w-full relative flex items-center justify-center p-6 lg:p-12 overflow-y-auto custom-scrollbar select-none bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      {/* Background Soft Glows (Glassmorphic Backdrop Visuals) */}
      <div className="absolute top-1/4 left-1/4 w-[350px] lg:w-[500px] h-[350px] lg:h-[500px] rounded-full bg-blue-500/10 dark:bg-blue-600/5 blur-[80px] lg:blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] lg:w-[500px] h-[350px] lg:h-[500px] rounded-full bg-indigo-500/10 dark:bg-indigo-600/5 blur-[80px] lg:blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '12s' }} />

      {/* Main Glassmorphic Split Container */}
      <div className="relative w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 items-stretch rounded-[2.5rem] bg-white/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/40 shadow-2xl p-8 lg:p-12 backdrop-blur-xl">
        
        {/* Left Side: Product Showcase & Brand Info (7 Cols) */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-8 min-w-0">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 text-xs font-black uppercase tracking-widest border border-blue-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Engine Platform Active
            </div>
            <h2 className="text-3xl lg:text-4xl font-black text-slate-800 dark:text-white uppercase tracking-tight leading-none">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-blue-400 dark:to-indigo-400">Paracore</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
              The high-performance workspace designed for Revit BIM automations, interactive C# REPL execution, and robust live element watchdogs.
            </p>
          </div>

          {/* Capabilities Grid */}
          <div className="grid grid-cols-1 gap-4">
            {[
              {
                icon: faBolt,
                color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
                title: "Dynamic Automation Engine",
                desc: "Run optimized script projects, pull verified templates from your team registry, and sync code in real-time."
              },
              {
                icon: faTerminal,
                color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
                title: "Interactive C# REPL Console",
                desc: "Query, sort, filter, and modify Revit API elements on-the-fly with immediate, unit-aware output feedback."
              },
              {
                icon: faShieldAlt,
                color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
                title: "BIM Watchdog Sentinels",
                desc: "Arm persistent background validators that trace model mutations and enforce quality rules directly at the source."
              }
            ].map((cap, idx) => (
              <div 
                key={idx}
                className="group flex gap-4 p-4 rounded-2xl bg-slate-100/40 dark:bg-slate-800/20 border border-slate-200/30 dark:border-slate-800/30 hover:bg-slate-100/80 dark:hover:bg-slate-800/30 hover:border-slate-300/50 dark:hover:border-slate-700/50 hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${cap.color}`}>
                  <FontAwesomeIcon icon={cap.icon} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    {cap.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                    {cap.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Links Footer */}
          <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50 flex items-center gap-6">
            <button 
              onClick={handleOpenHelp}
              className="text-xs font-black text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faBook} />
              Read Documentation
            </button>
          </div>
        </div>

        {/* Right Side: Auth Panel (unauthenticated) or User Panel (authenticated) */}
        <div className="md:col-span-5 flex flex-col justify-center">
          <div className="p-6 lg:p-8 rounded-3xl bg-slate-100/60 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-800/40 flex flex-col space-y-6">
            {isAuthenticated ? (
              <>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                    Workspace Active
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-normal">
                    You're signed in and your workspace is ready. Return to your automations whenever you're set.
                  </p>
                </div>
                {onDismiss && (
                  <button
                    onClick={onDismiss}
                    className="group relative w-full h-12 rounded-xl flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer overflow-hidden"
                  >
                    Back to Workspace
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="absolute right-4 text-xs opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                    />
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                    Establish Session
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 leading-normal">
                    Choose how you want to initialize your workspace for this active Revit session.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    disabled={isGoogleLoading || isOfflineLoading}
                    onClick={handleGoogleLogin}
                    className="group relative w-full h-12 rounded-xl flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50 transition-all cursor-pointer overflow-hidden"
                  >
                    {isGoogleLoading ? (
                      <FontAwesomeIcon icon={faSpinner} spin className="text-sm" />
                    ) : (
                      <FontAwesomeIcon icon={faGoogle} className="text-sm" />
                    )}
                    {isGoogleLoading ? "Connecting..." : "Sign in with Google"}
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="absolute right-4 text-xs opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                    />
                  </button>

                  <button
                    disabled={isGoogleLoading || isOfflineLoading}
                    onClick={handleOfflineLogin}
                    className="group relative w-full h-12 rounded-xl flex items-center justify-center gap-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase tracking-widest border border-slate-300/40 dark:border-slate-700/50 active:scale-95 disabled:opacity-50 transition-all cursor-pointer overflow-hidden"
                  >
                    {isOfflineLoading ? (
                      <FontAwesomeIcon icon={faSpinner} spin className="text-xs" />
                    ) : (
                      <FontAwesomeIcon icon={faUserCheck} className="text-xs" />
                    )}
                    {isOfflineLoading ? "Starting..." : "Continue Offline"}
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="absolute right-4 text-xs opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"
                    />
                  </button>
                </div>

                <div className="space-y-3 pt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                  <div className="flex gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 mt-1 shrink-0" />
                    <p><span className="font-bold text-slate-500 dark:text-slate-400">Enterprise Cloud:</span> Sign in with Google to push/pull team repositories, share script presets, and interact with the AI Agent.</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1 shrink-0" />
                    <p><span className="font-bold text-slate-500 dark:text-slate-400">Offline Guest Mode:</span> Personal sandbox mode with local folders, full script runner capabilities, and immediate C# REPL execution.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
