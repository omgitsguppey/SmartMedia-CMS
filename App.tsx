import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useToast } from './contexts/ToastContext';
import { useLogs } from './contexts/LogContext';
import { MediaItem, MediaType, SafetyLevel } from './types';
import { getDeepInsights, pingBackend } from './services/geminiService';
import { subscribeToLibrary, deleteMediaItem, initializeUpload, finalizeUpload, failUpload, saveRejectedMatches, getRejectedMatches, dataURLtoFile, updateMediaMetadata } from './services/storageService';
import { Uploader } from './components/Uploader';
import { MediaGrid, MediaGridSkeleton } from './components/MediaGrid';
import { Inspector } from './components/Inspector';
import { GenerationModal } from './components/GenerationModal';
import { FacesView } from './components/FacesView';
import { FaceMatchModal } from './components/FaceMatchModal';
import { NSFWMatchModal } from './components/NSFWMatchModal';
import { LoginScreen } from './components/LoginScreen';
import { DiagnosticsDrawer } from './components/DiagnosticsDrawer';
import { AdminDashboard } from './components/AdminDashboard';
import { UploadTask, getDownloadURL } from 'firebase/storage';

const WATCHDOG_TIMEOUT_MS = 90000; // 90 seconds

const App: React.FC = () => {
  const { user, userProfile, loading: authLoading, isAdmin, signOut } = useAuth();
  const { addToast } = useToast();
  const { addLog, lastError } = useLogs();
  
  // Data State
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<any | null>(null);
  
  // Ephemeral State
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  
  // AI Pipeline State
  const [aiStatus, setAiStatus] = useState<'unknown' | 'warming_up' | 'ready'>('unknown');

  // UI State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isGenerationModalOpen, setGenerationModalOpen] = useState(false);
  const [isFaceMatchOpen, setIsFaceMatchOpen] = useState(false);
  const [isNSFWMatchOpen, setIsNSFWMatchOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [deepInsights, setDeepInsights] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FACES' | 'NSFW'>('ALL');
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  
  const [rejectedMatches, setRejectedMatches] = useState<Set<string>>(new Set());

  // Refs
  const activeUploads = useRef<Map<string, UploadTask>>(new Map());
  const watchdogTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 1. Subscription to Firestore
  useEffect(() => {
    if (!user || isAdminView) { // Don't subscribe to user library if in Admin View
      if (!user) setLibrary([]);
      return;
    }

    addLog(`Starting library sync for user: ${user.uid}`);
    setIsLibraryLoading(true);
    setLibraryError(null);

    const unsubscribe = subscribeToLibrary(
      user.uid,
      (items) => {
        setLibrary(items);
        setLibraryError(null);
        setIsLibraryLoading(false);
      },
      (error) => {
        setLibraryError(error);
        setIsLibraryLoading(false);
        addLog("Library sync failed", "error", error);
        addToast("Library sync failed", "error");
      }
    );

    getRejectedMatches(user.uid).then(setRejectedMatches);

    return () => unsubscribe();
  }, [user, addToast, addLog, isAdminView]);

  // 2. Non-blocking AI Health Check
  useEffect(() => {
    if (!user) return;
    
    const checkPipeline = async () => {
      try {
        await pingBackend();
        setAiStatus('ready');
      } catch (e) {
        // Quiet failure for UX
        console.debug("[App] AI Pipeline cold/warming up:", e);
        setAiStatus('warming_up');
      }
    };
    checkPipeline();
  }, [user]);

  // 3. Global Key Listeners (ESC to close Inspector)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        if (isGenerationModalOpen) setGenerationModalOpen(false);
        if (isFaceMatchOpen) setIsFaceMatchOpen(false);
        if (isNSFWMatchOpen) setIsNSFWMatchOpen(false);
        if (isDiagnosticsOpen) setIsDiagnosticsOpen(false);
        if (deepInsights) setDeepInsights(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, isGenerationModalOpen, isFaceMatchOpen, isNSFWMatchOpen, isDiagnosticsOpen, deepInsights]);

  // 4. Computed Properties
  const mergedLibrary = useMemo(() => {
    return library.map(item => {
      if (uploadProgress[item.id] !== undefined) {
        return { 
          ...item, 
          progress: uploadProgress[item.id], 
          status: 'uploading' as const,
          url: localPreviews[item.id] || item.url
        };
      }
      return item;
    });
  }, [library, uploadProgress, localPreviews]);

  const selectedItem = useMemo(() => mergedLibrary.find(item => item.id === selectedId) || null, [mergedLibrary, selectedId]);

  const knownPeople = useMemo(() => {
    const people = new Set<string>();
    mergedLibrary.forEach(item => item.analysis?.peopleDetected.forEach(p => people.add(p)));
    return Array.from(people);
  }, [mergedLibrary]);

  // 5. Actions
  const updateLibraryItem = useCallback(async (updatedItem: MediaItem) => {
    if (!user) return;
    const { file, ...data } = updatedItem;
    await updateMediaMetadata(user.uid, updatedItem.id, data);
  }, [user]);

  const handleUpdateItem = useCallback(async (id: string, updates: Partial<MediaItem>) => {
      if (!user) return;
      await updateMediaMetadata(user.uid, id, updates);
  }, [user]);

  const handleDeleteItem = useCallback(async (item: MediaItem) => {
    if (!user) return;
    if (confirm("Are you sure you want to delete this item?")) {
       addLog(`Deleting item: ${item.id}`);
       if (selectedId === item.id) setSelectedId(null);
       await deleteMediaItem(user.uid, item);
       addToast("Item deleted", "success");
    }
  }, [user, selectedId, addToast, addLog]);

  const kickWatchdog = useCallback((fileId: string) => {
    if (watchdogTimers.current.has(fileId)) {
        clearTimeout(watchdogTimers.current.get(fileId)!);
    }
    const timer = setTimeout(() => {
        handleUploadTimeout(fileId);
    }, WATCHDOG_TIMEOUT_MS);
    watchdogTimers.current.set(fileId, timer);
  }, []);

  const clearWatchdog = useCallback((fileId: string) => {
      if (watchdogTimers.current.has(fileId)) {
          clearTimeout(watchdogTimers.current.get(fileId)!);
          watchdogTimers.current.delete(fileId);
      }
  }, []);

  const cleanupLocalPreview = useCallback((fileId: string) => {
    setLocalPreviews(prev => {
        if (prev[fileId]) {
            URL.revokeObjectURL(prev[fileId]);
            const next = { ...prev };
            delete next[fileId];
            return next;
        }
        return prev;
    });
  }, []);

  const handleUploadTimeout = useCallback((fileId: string) => {
    const task = activeUploads.current.get(fileId);
    if (task) {
        task.cancel();
        activeUploads.current.delete(fileId);
    }
    setUploadProgress(prev => {
        const next = { ...prev };
        delete next[fileId];
        return next;
    });
    cleanupLocalPreview(fileId);
    if (user) {
      failUpload(user.uid, fileId, "Upload stalled (timeout)");
      addLog(`Upload timeout for ${fileId}`, "error");
      addToast("Upload timed out", "error");
    }
  }, [user, addToast, cleanupLocalPreview, addLog]);

  const handleUpload = useCallback(async (file: File, type: MediaType) => {
    if (!user) return;

    // QUOTA CHECK
    if (userProfile) {
        const remaining = userProfile.quotaBytes - userProfile.usedBytes;
        if (file.size > remaining) {
            addToast(`Upload failed: Not enough storage quota (${(remaining/1024/1024).toFixed(1)}MB left)`, "error");
            addLog("Upload blocked by quota", "warn");
            return;
        }
    }

    try {
        addLog(`Starting upload: ${file.name} (${file.type})`);
        addToast(`Uploading ${file.name}...`);
        
        const previewUrl = URL.createObjectURL(file);
        const { fileId, uploadTask } = await initializeUpload(user.uid, file);
        
        setLocalPreviews(prev => ({ ...prev, [fileId]: previewUrl }));
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
        activeUploads.current.set(fileId, uploadTask);
        kickWatchdog(fileId);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
                kickWatchdog(fileId);
            },
            (error) => {
                clearWatchdog(fileId);
                activeUploads.current.delete(fileId);
                
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[fileId];
                    return next;
                });
                cleanupLocalPreview(fileId);
                
                let errorMsg = error.message;
                if (error.code === 'storage/canceled') errorMsg = 'Upload cancelled by user';
                failUpload(user.uid, fileId, errorMsg);
                addLog(`Upload failed: ${file.name}`, "error", error);
                
                if (error.code !== 'storage/canceled') {
                  addToast(error.message || "Upload failed", "error");
                }
            },
            async () => {
                clearWatchdog(fileId);
                activeUploads.current.delete(fileId);
                
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[fileId];
                    return next;
                });
                cleanupLocalPreview(fileId);

                addToast("Upload complete. Analyzing...", "success");
                addLog(`Upload success: ${file.name}`);
                
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await finalizeUpload(user.uid, fileId, downloadURL);
            }
        );

    } catch (initErr: any) {
        addLog("Init upload failed", "error", initErr);
        addToast(initErr.message || "Failed to start upload", "error");
    }
  }, [user, userProfile, addToast, kickWatchdog, clearWatchdog, cleanupLocalPreview, addLog]);

  const handleCancelUpload = useCallback((item: MediaItem) => {
      const task = activeUploads.current.get(item.id);
      if (task) {
          task.cancel();
          addLog(`Upload cancelled: ${item.id}`);
          addToast("Upload cancelled");
      }
  }, [addToast, addLog]);

  const handleRetryUpload = useCallback((item: MediaItem) => {
      if (!user) return;
      if (item.file) {
           deleteMediaItem(user.uid, item).then(() => {
               handleUpload(item.file!, item.type);
           });
      } else {
          deleteMediaItem(user.uid, item);
          addToast("Removed failed item. Please upload again.", "info");
      }
  }, [user, handleUpload, addToast]);

  const handleGeneratedImage = useCallback(async (url: string, prompt: string) => {
    if (!user) return;
    const file = dataURLtoFile(url, `generated-${Date.now()}.png`);
    handleUpload(file, MediaType.IMAGE);
  }, [user, handleUpload]);

  const handleThinkingMode = async () => {
    if (mergedLibrary.length === 0) return;
    setIsThinking(true);
    setDeepInsights(null);
    addLog("Analyzing library with Gemini Pro...");
    const metadataSummary = JSON.stringify(mergedLibrary.map(item => ({
      name: item.name,
      type: item.type,
      tags: item.analysis?.tags || [],
      people: item.analysis?.peopleDetected || [],
      date: new Date(item.timestamp).toISOString()
    })));
    try {
      const insights = await getDeepInsights(metadataSummary);
      setDeepInsights(insights);
      addLog("Insights received", "success");
    } catch (e: any) {
      setDeepInsights("Insights unavailable.");
      addLog("Insights failed", "error", e.message);
    } finally {
      setIsThinking(false);
    }
  };

  const handleRenamePerson = (oldName: string, newName: string) => {
    addLog(`Renaming person ${oldName} -> ${newName}`);
    mergedLibrary.forEach(item => {
       if (item.analysis?.peopleDetected.includes(oldName)) {
         const updatedAnalysis = {
             ...item.analysis!,
             peopleDetected: item.analysis!.peopleDetected.map(p => p === oldName ? newName : p),
             isUserEdited: true
         };
         updateLibraryItem({ ...item, analysis: updatedAnalysis });
       }
    });
    if (personFilter === oldName) setPersonFilter(newName);
    addToast(`Renamed ${oldName} to ${newName}`, "success");
  };

  const handleConfirmMatch = async (itemId: string, personName: string) => {
    const item = mergedLibrary.find(i => i.id === itemId);
    if (item && item.analysis) {
        addLog(`Match confirmed: ${personName} in ${itemId}`);
        const currentPeople = item.analysis.peopleDetected || [];
        if (!currentPeople.includes(personName)) {
           updateLibraryItem({
             ...item,
             analysis: { 
                 ...item.analysis, 
                 peopleDetected: [...currentPeople, personName],
                 isUserEdited: true
             }
           });
           addToast("Face match confirmed", "success");
        }
    }
  };

  const handleRejectMatch = async (itemId: string, personName: string) => {
    const newRejected = new Set(rejectedMatches).add(`${itemId}-${personName}`);
    setRejectedMatches(newRejected);
    if (user) await saveRejectedMatches(user.uid, Array.from(newRejected) as string[]);
  };

  const handleNSFWReview = async (itemId: string, isNSFW: boolean) => {
    const item = mergedLibrary.find(i => i.id === itemId);
    if (item && item.analysis) {
         addLog(`Moderation review: ${itemId} isNSFW=${isNSFW}`);
         updateLibraryItem({
           ...item,
           analysis: {
             ...item.analysis,
             safetyLevel: isNSFW ? SafetyLevel.NSFW : SafetyLevel.SAFE,
             isUserEdited: true
           }
         });
         addToast("Content review saved", "success");
    }
  };

  const handleSelect = useCallback((item: MediaItem) => {
    setSelectedId(item.id);
  }, []);

  const filteredLibrary = useMemo(() => mergedLibrary.filter(item => {
    if (filter === 'FACES') {
      if (personFilter) return item.analysis?.peopleDetected.includes(personFilter);
      return false;
    }
    if (filter === 'NSFW') return item.analysis?.safetyLevel === SafetyLevel.NSFW || item.analysis?.safetyLevel === SafetyLevel.POSSIBLE_NSFW;
    if (filter === 'ALL') return true;
    return item.type === filter;
  }), [mergedLibrary, filter, personFilter]);

  // Render Content Logic
  const renderMainContent = () => {
    if (isAdminView) {
      return <AdminDashboard onClose={() => setIsAdminView(false)} />;
    }

    if (filter === 'FACES' && !personFilter) {
      return (
        <FacesView 
          items={mergedLibrary} 
          onRename={handleRenamePerson} 
          onSelectPerson={(person) => setPersonFilter(person)} 
        />
      );
    }
    
    // 1. Loading State (Skeleton)
    if (isLibraryLoading) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 px-6 py-4 text-zinc-500 text-sm animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-ios-blue"></div>
                    Syncing library...
                </div>
                <MediaGridSkeleton />
            </div>
        );
    }

    // 2. Error State
    if (libraryError) {
        return <div className="p-8 text-center text-ios-danger">{(libraryError as any)?.message || "Failed to load library."}</div>
    }

    // 3. Empty State
    if (filteredLibrary.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8 space-y-4 animate-in fade-in duration-500">
           <div className="w-16 h-16 bg-ios-surface2 rounded-full flex items-center justify-center border border-white/5">
              <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
           </div>
           <p className="font-medium">Library is empty.</p>
           <p className="text-xs max-w-xs text-center leading-relaxed">Upload photos and videos to get started.</p>
           
           <div className="w-64 mt-4">
               <Uploader onUpload={handleUpload} />
           </div>
        </div>
      );
    }

    return (
      <MediaGrid 
        items={filteredLibrary} 
        onSelect={handleSelect} 
        selectedId={selectedId}
        onCancelUpload={handleCancelUpload}
        onRetryUpload={handleRetryUpload}
        onDelete={handleDeleteItem}
      />
    );
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-zinc-500">
        <div className="animate-spin h-8 w-8 border-2 border-zinc-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans selection:bg-ios-blue/30 overflow-hidden">
       {/* Main Layout */}
       <div className="flex-1 flex flex-col min-w-0 bg-ios-surface relative">
          {/* Top Bar */}
          {!isAdminView && (
              <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-white/5 backdrop-blur-xl z-20 sticky top-0">
                 <div className="flex items-center gap-4">
                   <h1 className="text-lg font-bold tracking-tight">Library</h1>
                   
                   {/* Filter Tabs */}
                   <div className="hidden md:flex bg-ios-surface2 rounded-lg p-1 border border-white/5">
                      {(['ALL', 'IMAGE', 'VIDEO', 'AUDIO', 'FACES'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => { setFilter(f); setPersonFilter(null); }}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${filter === f ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-white'}`}
                        >
                          {f === 'ALL' ? 'All Items' : f.charAt(0) + f.slice(1).toLowerCase()}
                        </button>
                      ))}
                   </div>
                 </div>

                 <div className="flex items-center gap-3">
                    {/* Admin Button */}
                    {isAdmin && (
                        <button 
                          onClick={() => setIsAdminView(true)}
                          className="px-3 py-1.5 rounded-full bg-ios-blue text-white text-xs font-bold hover:bg-ios-blue/90 shadow-[0_0_10px_rgba(41,151,255,0.4)] transition-all"
                        >
                           Admin
                        </button>
                    )}

                    {/* System Status Indicator */}
                    <button 
                      onClick={() => setIsDiagnosticsOpen(true)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 transition-all text-xs font-medium 
                        ${lastError ? 'bg-ios-danger/10 text-ios-danger border-ios-danger/20' : 'bg-ios-surface2 text-zinc-400 hover:text-white hover:bg-zinc-700'}
                      `}
                    >
                       <div className={`w-1.5 h-1.5 rounded-full ${
                            lastError ? 'bg-ios-danger animate-pulse' : 
                            aiStatus === 'ready' ? 'bg-ios-success' : 
                            'bg-ios-warning animate-pulse' 
                       }`}></div>
                       <span className="hidden md:inline">
                           {lastError ? 'System Error' : aiStatus === 'ready' ? 'System' : 'AI Warming Up'}
                       </span>
                    </button>

                    <div className="h-6 w-px bg-white/10 mx-1"></div>

                    {/* Upload Button: Hidden on Mobile (FAB used instead) */}
                    <div className="relative group hidden md:block">
                        <Uploader onUpload={handleUpload} />
                    </div>

                    <button onClick={() => setGenerationModalOpen(true)} className="p-2 rounded-full bg-ios-surface2 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-white/5" title="Generate Image">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </button>
                    <button onClick={() => setIsFaceMatchOpen(true)} className="p-2 rounded-full bg-ios-surface2 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-white/5" title="Face Match">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                    <button onClick={() => setIsNSFWMatchOpen(true)} className="p-2 rounded-full bg-ios-surface2 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-white/5" title="Safety Review">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </button>
                    <button onClick={handleThinkingMode} disabled={isThinking} className={`p-2 rounded-full bg-ios-surface2 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-white/5 ${isThinking ? 'animate-pulse text-ios-blue' : ''}`} title="Get Insights">
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-2"></div>
                    <button onClick={() => signOut()} className="text-xs font-bold text-zinc-500 hover:text-white transition-colors">Sign Out</button>
                 </div>
              </header>
          )}

          <main className="flex-1 overflow-y-auto no-scrollbar relative">
             {renderMainContent()}
             
             {/* Upload FAB (Only show if not in admin view and on mobile) */}
             {!isAdminView && (
                 <div className="fixed bottom-6 right-6 md:hidden z-30">
                    <div className="w-14 h-14 rounded-full bg-white text-black shadow-2xl flex items-center justify-center overflow-hidden">
                       <Uploader onUpload={handleUpload} />
                       <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                       </div>
                    </div>
                 </div>
             )}
          </main>
       </div>

       {/* Inspector Panel (Normal User Flow) */}
       {/* Note: Admin Dashboard has its own internal Inspector handling */}
       {!isAdminView && selectedId && (
           <>
              {/* Overlay (Mobile/Tablet Only usually, but effective for closing focus) */}
              <div 
                className="fixed inset-0 bg-black/50 z-30 md:hidden animate-in fade-in" 
                onClick={() => setSelectedId(null)}
              />
              
              <div className={`fixed inset-y-0 right-0 w-full md:w-96 bg-ios-surface border-l border-white/10 transform transition-transform duration-300 z-40 translate-x-0`}>
                  <Inspector 
                    item={selectedItem} 
                    onClose={() => setSelectedId(null)} 
                    onUpdate={handleUpdateItem}
                  />
              </div>
           </>
       )}
       
       {/* Modals */}
       <GenerationModal 
         isOpen={isGenerationModalOpen} 
         onClose={() => setGenerationModalOpen(false)} 
         onImageGenerated={handleGeneratedImage} 
       />
       
       <FaceMatchModal 
         isOpen={isFaceMatchOpen}
         onClose={() => setIsFaceMatchOpen(false)}
         library={mergedLibrary}
         knownPeople={knownPeople}
         rejectedMatches={rejectedMatches}
         onConfirmMatch={handleConfirmMatch}
         onRejectMatch={handleRejectMatch}
         onBatchUpload={handleUpload}
       />

       <NSFWMatchModal
         isOpen={isNSFWMatchOpen}
         onClose={() => setIsNSFWMatchOpen(false)}
         library={mergedLibrary}
         onReview={handleNSFWReview}
         onBatchUpload={handleUpload}
       />
       
       <DiagnosticsDrawer
         isOpen={isDiagnosticsOpen}
         onClose={() => setIsDiagnosticsOpen(false)}
       />
       
       {/* Insights Modal */}
       {deepInsights && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
             <div className="bg-ios-surface border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
                <button onClick={() => setDeepInsights(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                <h3 className="text-xl font-bold text-white mb-4 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Library Insights</h3>
                <div className="prose prose-invert prose-sm max-h-[60vh] overflow-y-auto">
                   <p className="whitespace-pre-line text-zinc-300">{deepInsights}</p>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default App;