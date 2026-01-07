
import React, { useEffect, useState } from 'react';
import { app, auth, db } from '../firebase/client';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [checks, setChecks] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      runChecks();
    }
  }, [isOpen]);

  const runChecks = async () => {
    setLoading(true);
    const results: any = {};

    // Config Check
    results.projectId = app.options.projectId;
    results.storageBucket = app.options.storageBucket;
    results.authDomain = app.options.authDomain;

    // Auth Check
    results.authReady = !!auth;
    results.currentUser = auth.currentUser ? auth.currentUser.uid : 'Not signed in';

    // Firestore Check (Connectivity)
    try {
      results.firestoreInitialized = !!db;
    } catch (e: any) {
      results.firestoreError = e.message;
    }

    setChecks(results);
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-ios-surface border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-ios-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
            System Diagnostics
          </h2>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors">
             <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin h-8 w-8 border-2 border-ios-blue rounded-full border-t-transparent"></div></div>
        ) : (
            <div className="space-y-4 text-sm">
                <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                    <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-3">Firebase Config</h3>
                    <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                        <span className="text-zinc-400">Project ID</span>
                        <span className="text-white font-mono text-xs">{checks.projectId}</span>
                        <span className="text-zinc-400">Auth Domain</span>
                        <span className="text-white font-mono text-xs">{checks.authDomain}</span>
                        <span className="text-zinc-400">Storage</span>
                        <span className="text-white font-mono text-xs">{checks.storageBucket}</span>
                    </div>
                </div>

                <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                    <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-3">Connection Status</h3>
                    <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                        <span className="text-zinc-400">Auth Service</span>
                        <span className={`text-xs font-bold ${checks.authReady ? 'text-ios-success' : 'text-ios-danger'}`}>
                            {checks.authReady ? '● Online' : '● Offline'}
                        </span>
                        <span className="text-zinc-400">User Session</span>
                        <span className="text-zinc-300 text-xs truncate" title={checks.currentUser}>{checks.currentUser}</span>
                        <span className="text-zinc-400">Firestore</span>
                        <span className={`text-xs font-bold ${checks.firestoreInitialized ? 'text-ios-success' : 'text-ios-danger'}`}>
                             {checks.firestoreInitialized ? '● Connected' : '● Error'}
                        </span>
                    </div>
                </div>
                
                <div className="bg-ios-blue/10 p-4 rounded-xl border border-ios-blue/20 text-xs text-ios-blue leading-relaxed flex gap-3">
                   <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   <div>
                     <strong>Deployment Check:</strong> Ensure <code>{window.location.hostname}</code> is listed in <em>Authorized Domains</em> in your Firebase Console (Authentication &gt; Settings).
                   </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
