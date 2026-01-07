import React, { useEffect, useState } from 'react';
import { app, auth, db, storage } from '../firebase/client';
import { useLogs } from '../contexts/LogContext';
import { pingBackend } from '../services/geminiService';

interface DiagnosticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({ isOpen, onClose }) => {
  const { logs, lastError, addLog } = useLogs();
  const [pingStatus, setPingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pingData, setPingData] = useState<any>(null);

  const handleCopyLogs = () => {
    const text = logs.map(l => `[${l.timestamp.toISOString()}] ${l.type.toUpperCase()}: ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`).join('\n');
    navigator.clipboard.writeText(text);
    addLog("Logs copied to clipboard", "success");
  };

  const handleTestFunctions = async () => {
    setPingStatus('loading');
    addLog("Testing Cloud Functions connection...");
    try {
      const result = await pingBackend();
      setPingData(result);
      setPingStatus('success');
      addLog("Pipeline Ping Successful", "success", result);
    } catch (error: any) {
      setPingStatus('error');
      addLog("Pipeline Ping Failed", "error", error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}></div>
      
      {/* Drawer */}
      <div className="relative w-full max-w-md h-full bg-ios-surface border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-ios-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
            System Status
          </h2>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
            
            {/* 1. System Status Card */}
            <div className="space-y-4">
               <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Configuration</h3>
               <div className="bg-ios-surface2 rounded-xl border border-white/10 overflow-hidden">
                  
                  {/* Auth */}
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${auth.currentUser ? 'bg-ios-success shadow-[0_0_8px_rgba(50,215,75,0.6)]' : 'bg-ios-danger'}`}></div>
                        <span className="text-sm font-medium text-zinc-300">Authentication</span>
                     </div>
                     <span className="text-xs text-zinc-500 font-mono truncate max-w-[120px]">{auth.currentUser?.email || 'Signed Out'}</span>
                  </div>

                  {/* Firestore */}
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${db ? 'bg-ios-success' : 'bg-ios-danger'}`}></div>
                        <span className="text-sm font-medium text-zinc-300">Firestore DB</span>
                     </div>
                     <span className="text-xs text-zinc-500 font-mono">{(db as any)._databaseId?.database || 'senseosdata'}</span>
                  </div>

                  {/* Storage */}
                  <div className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${storage ? 'bg-ios-success' : 'bg-ios-danger'}`}></div>
                        <span className="text-sm font-medium text-zinc-300">Storage</span>
                     </div>
                     <span className="text-xs text-zinc-500 font-mono truncate max-w-[120px]">{storage.app.options.storageBucket}</span>
                  </div>
               </div>

               {/* Functions Tester */}
               <div className="bg-ios-surface2 rounded-xl border border-white/10 p-4">
                  <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-zinc-300">Cloud Functions</span>
                      <button 
                         onClick={handleTestFunctions}
                         disabled={pingStatus === 'loading'}
                         className="px-3 py-1 bg-white text-black text-xs font-bold rounded hover:bg-zinc-200 transition-colors disabled:opacity-50"
                      >
                         {pingStatus === 'loading' ? 'Testing...' : 'Test Connection'}
                      </button>
                  </div>
                  
                  {pingStatus === 'success' && (
                     <div className="p-3 bg-ios-success/10 border border-ios-success/20 rounded text-xs text-ios-success font-mono">
                        ✓ Connected: {pingData?.region} ({pingData?.status})
                     </div>
                  )}
                  {pingStatus === 'error' && (
                     <div className="p-3 bg-ios-danger/10 border border-ios-danger/20 rounded text-xs text-ios-danger font-mono">
                        ⚠ Unreachable (AI Services warming up)
                     </div>
                  )}
               </div>
            </div>

            {/* 2. Last Error */}
            {lastError && (
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-ios-danger uppercase tracking-widest">Last Error</h3>
                    <div className="p-4 bg-ios-danger/10 border border-ios-danger/20 rounded-xl text-xs text-ios-danger font-mono break-all">
                        <div className="mb-2 opacity-70">[{lastError.timestamp.toLocaleTimeString()}]</div>
                        {lastError.message}
                    </div>
                </div>
            )}

            {/* 3. Diagnostics Logs (The Drawer Content) */}
            <div className="space-y-4">
               <div className="flex justify-between items-end">
                   <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Client Logs (Last 20)</h3>
                   <button onClick={handleCopyLogs} className="text-[10px] text-ios-blue hover:text-white transition-colors font-medium">
                       Copy to Clipboard
                   </button>
               </div>
               
               <div className="bg-black/50 rounded-xl border border-white/5 p-4 h-64 overflow-y-auto font-mono text-[10px] space-y-2 no-scrollbar">
                  {logs.length === 0 && <span className="text-zinc-600 italic">No logs recorded yet...</span>}
                  {logs.map((log) => (
                      <div key={log.id} className="flex gap-2">
                          <span className="text-zinc-600 shrink-0">[{log.timestamp.toLocaleTimeString()}]</span>
                          <span className={`
                              ${log.type === 'error' ? 'text-ios-danger' : ''}
                              ${log.type === 'success' ? 'text-ios-success' : ''}
                              ${log.type === 'warn' ? 'text-ios-warning' : ''}
                              ${log.type === 'info' ? 'text-zinc-300' : ''}
                          `}>
                             {log.message}
                          </span>
                      </div>
                  ))}
               </div>
            </div>
        </div>

      </div>
    </div>
  );
};