
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useToast } from './contexts/ToastContext';
import { MediaItem, MediaType, SafetyLevel } from './types';
import { analyzeMedia, getDeepInsights } from './services/geminiService';
import { subscribeToLibrary, deleteMediaItem, initializeUpload, finalizeUpload, failUpload, saveRejectedMatches, getRejectedMatches, dataURLtoFile, updateMediaMetadata } from './services/storageService';
import { Uploader } from './components/Uploader';
import { MediaGrid, MediaGridSkeleton } from './components/MediaGrid';
import { Inspector } from './components/Inspector';
import { GenerationModal } from './components/GenerationModal';
import { FacesView } from './components/FacesView';
import { FaceMatchModal } from './components/FaceMatchModal';
import { NSFWMatchModal } from './components/NSFWMatchModal';
import { LoginScreen } from './components/LoginScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { UploadTask, getDownloadURL } from 'firebase/storage';

const WATCHDOG_TIMEOUT_MS = 90000; // 90 seconds

const AppContent: React.FC = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { addToast } = useToast();
  
  // Data State
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  
  // Ephemeral State (Local Progress)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  
  // UI State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isGenerationModalOpen, setGenerationModalOpen] = useState(false);
  const [isFaceMatchOpen, setIsFaceMatchOpen] = useState(false);
  const [isNSFWMatchOpen, setIsNSFWMatchOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
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
    if (!user) {
      setLibrary([]);
      return;
    }

    setIsLibraryLoading(true);
    setLibraryError(null);

    const unsubscribe = subscribeToLibrary(
      user.uid,
      (items) => {
        setLibrary(items);
        setIsLibraryLoading(false);
      },
      (error) => {
        console.error("Library Subscription Error:", error);
        setLibraryError("Failed to sync library. Please check your connection.");
        setIsLibraryLoading(false);
        addToast("Connection to library lost", "error");
      }
    );

    // Load preferences once
    getRejectedMatches(user.uid).then(setRejectedMatches);

    return () => unsubscribe();
  }, [user, addToast]);

  // 2. Computed Properties
  const mergedLibrary = useMemo(() => {
    // Merge remote library with local upload progress
    return library.map(item => {
      // If we have local progress for this item, override the static db progress
      if (uploadProgress[item.id] !== undefined) {
        return { ...item, progress: uploadProgress[item.id], status: 'uploading' as const };
      }
      return item;
    });
  }, [library, uploadProgress]);

  const selectedItem = useMemo(() => mergedLibrary.find(item => item.id === selectedId) || null, [mergedLibrary, selectedId]);

  const knownPeople = useMemo(() => {
    const people = new Set<string>();
    mergedLibrary.forEach(item => item.analysis?.peopleDetected.forEach(p => people.add(p)));
    return Array.from(people);
  }, [mergedLibrary]);

  // 3. Actions
  const updateLibraryItem = useCallback(async (updatedItem: MediaItem) => {
    if (!user) return;
    const { file, ...data } = updatedItem;
    await updateMediaMetadata(user.uid, updatedItem.id, data);
  }, [user]);

  const handleDeleteItem = useCallback(async (item: MediaItem) => {
    if (!user) return;
    if (confirm("Are you sure you want to delete this item?")) {
       if (selectedId === item.id) setSelectedId(null);
       await deleteMediaItem(user.uid, item);
       addToast("Item deleted", "success");
    }
  }, [user, selectedId, addToast]);

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
    if (user) {
      failUpload(user.uid, fileId, "Upload stalled (timeout)");
      addToast("Upload timed out", "error");
    }
  }, [user, addToast]);

  const handleUpload = useCallback(async (file: File, type: MediaType) => {
    if (!user) return;

    try {
        addToast(`Uploading ${file.name}...`);
        const { fileId, uploadTask } = await initializeUpload(user.uid, file);
        
        // Track local progress
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
                // Clear local progress so the Grid falls back to DB state (which we set to 'failed')
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[fileId];
                    return next;
                });
                
                let errorMsg = error.message;
                if (error.code === 'storage/canceled') errorMsg = 'Upload cancelled by user';
                failUpload(user.uid, fileId, errorMsg);
                if (error.code !== 'storage/canceled') {
                  addToast("Upload failed", "error");
                }
            },
            async () => {
                // Success
                clearWatchdog(fileId);
                activeUploads.current.delete(fileId);
                // Clear local progress
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[fileId];
                    return next;
                });

                addToast("Upload complete. Analyzing...", "success");
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await finalizeUpload(user.uid, fileId, downloadURL);

                // Run AI
                try {
                    const result = await analyzeMedia(file, type, knownPeople);
                    await updateMediaMetadata(user.uid, fileId, { analysis: result });
                } catch (aiErr) {
                    console.error("AI Analysis failed", aiErr);
                    // Don't show toast for analysis fail, user sees it in inspector
                }
            }
        );

    } catch (initErr: any) {
        console.error("Init upload failed", initErr);
        addToast("Failed to start upload", "error");
    }
  }, [user, knownPeople, addToast, kickWatchdog, clearWatchdog]);

  const handleCancelUpload = useCallback((item: MediaItem) => {
      const task = activeUploads.current.get(item.id);
      if (task) {
          task.cancel();
          addToast("Upload cancelled");
      }
  }, [addToast]);

  const handleRetryUpload = useCallback((item: MediaItem) => {
      if (!user) return;
      if (item.file) {
           deleteMediaItem(user.uid, item).then(() => {
               handleUpload(item.file!, item.type);
           });
      } else {
          alert("Cannot retry this upload (file lost). Please upload again.");
          deleteMediaItem(user.uid, item);
      }
  }, [user, handleUpload]);

  const handleGeneratedImage = useCallback(async (url: string, prompt: string) => {
    if (!user) return;
    const file = dataURLtoFile(url, `generated-${Date.now()}.png`);
    handleUpload(file, MediaType.IMAGE);
  }, [user, handleUpload]);

  const handleThinkingMode = async () => {
    if (mergedLibrary.length === 0) return;
    setIsThinking(true);
    setDeepInsights(null);
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
    } catch (e) {
      setDeepInsights("Failed to think profoundly.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleRenamePerson = (oldName: string, newName: string) => {
    mergedLibrary.forEach(item => {
       if (item.analysis?.peopleDetected.includes(oldName)) {
         const updatedAnalysis = {
             ...item.analysis!,
             peopleDetected: item.analysis!.peopleDetected.map(p => p === oldName ? newName : p)
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
        const currentPeople = item.analysis.peopleDetected || [];
        if (!currentPeople.includes(personName)) {
           updateLibraryItem({
             ...item,
             analysis: { ...item.analysis, peopleDetected: [...currentPeople, personName] }
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
         updateLibraryItem({
           ...item,
           analysis: {
             ...item.analysis,
             safetyLevel: isNSFW ? SafetyLevel.NSFW : SafetyLevel.SAFE
           }
         });
         addToast("Content review saved", "success");
    }
  };

  const handleSelect = useCallback((item: MediaItem) => {
    setSelectedId(item.id);
  }, []);

  // Filtering
  const filteredLibrary = useMemo(() => mergedLibrary.filter(item => {
    if (filter === 'FACES') {
      if (personFilter) return item.analysis?.peopleDetected.includes(personFilter);
      return false;
    }
    if (filter === 'NSFW') return item.analysis?.safetyLevel === SafetyLevel.NSFW || item.analysis?.safetyLevel === SafetyLevel.POSSIBLE_NSFW;
    if (filter === 'ALL') return true;
    return item.type === filter;
  }), [mergedLibrary, filter, personFilter]);

  const renderMainContent = () => {
    if (filter === 'FACES' && !personFilter) {
      return (
        <FacesView 
          items={mergedLibrary} 
          onRename={handleRenamePerson} 
          onSelectPerson={(person) => setPersonFilter(person)} 
        />
      );
    }
    
    if (isLibraryLoading) {
        return <MediaGridSkeleton />;
    }

    if (libraryError) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
                <div className="p-4 bg-ios-danger/10 rounded-full text-ios-danger">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <p>{libraryError}</p>
                <button onClick={() => window.location.reload()} className="text-ios-blue hover:underline">Retry Connection</button>
            </div>
        );
    }

    if (filteredLibrary.length === 0 && activeUploads.current.size === 0) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 opacity-60 pointer-events-none p-6 text-center">
            <svg className="w-16 h-16 mb-6 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-base font-medium">No media found</p>
            <p className="text-sm mt-1">Upload images or videos to get started.</p>
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
        <div className="flex h-screen w-full bg-ios-black text-white items-center justify-center">
             <div className="flex flex-col items-center gap-6">
                 <div className="animate-spin h-6 w-6 border-2 border-ios-blue rounded-full border-t-transparent"></div>
                 <p className="text-zinc-500 text-xs font-medium tracking-wide uppercase">SenseOS</p>
             </div>
        </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen w-full bg-ios-black text-white font-sans overflow-hidden selection:bg-ios-blue/30">
      
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-72 flex-col border-r border-white/5 bg-ios-surface/50 backdrop-blur-2xl z-20">
        <div className="p-6 pt-8">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-lg shadow-white/5">
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </div>
            SmartMedia
          </h1>
          
          <div className="mt-6 flex items-center justify-between px-3 py-2.5 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group cursor-default">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ios-blue to-purple-500 flex items-center justify-center text-xs font-bold shadow-inner">
                    {user.email?.charAt(0).toUpperCase()}
                 </div>
                 <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium text-white truncate w-24">{user.displayName || 'User'}</span>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">Pro Plan</span>
                 </div>
              </div>
              <button onClick={() => signOut()} className="p-1.5 text-zinc-600 hover:text-white transition-colors rounded-full hover:bg-white/10">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto no-scrollbar">
          <button onClick={() => { setFilter('ALL'); setPersonFilter(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'ALL' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Library</button>
          <button onClick={() => { setFilter('IMAGE'); setPersonFilter(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'IMAGE' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Images</button>
          <button onClick={() => { setFilter('VIDEO'); setPersonFilter(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'VIDEO' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Videos</button>
          <button onClick={() => { setFilter('AUDIO'); setPersonFilter(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'AUDIO' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>Audio</button>
          
          <div className="pt-6 pb-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">People</div>
          <button onClick={() => { setFilter('FACES'); setPersonFilter(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'FACES' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
             Faces & People
          </button>

          <div className="pt-6 pb-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Safety</div>
          <button onClick={() => { setFilter('NSFW'); setPersonFilter(null); }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all group flex items-center justify-between ${filter === 'NSFW' ? 'bg-ios-danger/10 text-ios-danger' : 'text-zinc-400 hover:bg-white/5 hover:text-ios-danger'}`}>
             <span>Flagged Content</span>
             {filter === 'NSFW' && <span className="w-1.5 h-1.5 rounded-full bg-ios-danger"></span>}
          </button>

          <div className="pt-6 pb-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Tools</div>
          <button onClick={() => setIsFaceMatchOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
             <svg className="w-4 h-4 text-ios-success opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             Face Match
          </button>
          <button onClick={() => setIsNSFWMatchOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
             <svg className="w-4 h-4 text-ios-danger opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             NSFW Review
          </button>
          <button onClick={() => setGenerationModalOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
            <svg className="w-4 h-4 text-purple-500 opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Generate Image
          </button>
          <button onClick={handleThinkingMode} disabled={mergedLibrary.length === 0} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all group disabled:opacity-30">
             <svg className="w-4 h-4 text-ios-warning opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            Deep Insights
          </button>

          <div className="pt-6 pb-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">System</div>
          <button onClick={() => setIsDiagnosticsOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-all group">
             <svg className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
             Diagnostics
          </button>
        </nav>
        
        <div className="p-6">
           <Uploader onUpload={handleUpload} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-ios-black relative overflow-hidden">
         <header className="hidden md:flex h-16 border-b border-white/5 items-center px-8 justify-between bg-ios-black/80 backdrop-blur-md z-10 sticky top-0">
           <div className="flex items-center gap-4">
              {personFilter && (
                <button onClick={() => setPersonFilter(null)} className="p-1 rounded-full hover:bg-white/10 text-zinc-400 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}
              <h2 className="text-lg font-semibold text-white tracking-wide">
                {personFilter ? personFilter : filter === 'ALL' ? 'Library' : filter === 'FACES' ? 'People' : filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase()}
                {!personFilter && filter !== 'FACES' && <span className="ml-3 text-sm text-zinc-500 font-normal tabular-nums">{filteredLibrary.length} items</span>}
              </h2>
           </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative h-full no-scrollbar">
           {renderMainContent()}
        </main>
        
        {/* Mobile FAB */}
        <div className="md:hidden fixed bottom-6 right-6 z-40">
           <div className="relative group">
              <input 
                type="file" 
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    Array.from(e.target.files).forEach((f: File) => handleUpload(f, f.type.startsWith('video') ? MediaType.VIDEO : f.type.startsWith('audio') ? MediaType.AUDIO : MediaType.IMAGE));
                    e.target.value = '';
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                accept="image/*,video/*,audio/*"
              />
              <button className="w-14 h-14 bg-white text-black rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
           </div>
        </div>

      </div>

      <div className={`fixed inset-0 z-50 transform transition-transform duration-300 md:hidden flex flex-col justify-end ${selectedId ? 'translate-y-0' : 'translate-y-full'}`}>
         <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSelectedId(null)}></div>
         <div className="relative bg-ios-surface rounded-t-[2rem] h-[85vh] overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10">
            <div className="w-full flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setSelectedId(null)}>
               <div className="w-10 h-1 bg-zinc-700 rounded-full"></div>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
               <Inspector item={selectedItem} onClose={() => setSelectedId(null)} />
            </div>
         </div>
      </div>

      <aside className="hidden md:flex w-80 border-l border-white/5 bg-ios-surface/50 backdrop-blur-2xl flex-col z-20">
         <Inspector item={selectedItem} />
      </aside>

      {(isThinking || deepInsights) && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl p-6 md:p-12 flex flex-col items-center overflow-y-auto">
           <div className="max-w-2xl w-full mt-10 md:mt-0">
             <div className="flex justify-between items-center mb-8 sticky top-0 bg-black/90 backdrop-blur-md py-4 -mx-4 px-4 z-10">
                <h3 className="text-2xl font-bold text-ios-warning flex items-center gap-3">
                  <span className="p-2 bg-ios-warning/10 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></span>
                  Insights
                </h3>
                <button onClick={() => setDeepInsights(null)} className="p-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 transition-colors border border-white/10">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>
             {isThinking ? (
                <div className="space-y-6 mt-8 opacity-70">
                   <div className="h-4 bg-zinc-800 rounded w-3/4 animate-pulse-slow"></div>
                   <div className="h-4 bg-zinc-800 rounded w-full animate-pulse-slow delay-100"></div>
                   <div className="h-4 bg-zinc-800 rounded w-5/6 animate-pulse-slow delay-200"></div>
                   <div className="flex justify-center mt-12"><div className="animate-spin h-8 w-8 border-2 border-ios-warning rounded-full border-t-transparent"></div></div>
                </div>
             ) : (
                <div className="prose prose-invert prose-amber max-w-none pb-20">
                   <div className="bg-ios-surface2 p-6 md:p-8 rounded-2xl border border-white/5 leading-relaxed whitespace-pre-wrap text-zinc-300 shadow-2xl">{deepInsights}</div>
                </div>
             )}
          </div>
        </div>
      )}

      <GenerationModal isOpen={isGenerationModalOpen} onClose={() => setGenerationModalOpen(false)} onImageGenerated={handleGeneratedImage} />
      <FaceMatchModal isOpen={isFaceMatchOpen} onClose={() => setIsFaceMatchOpen(false)} library={mergedLibrary} knownPeople={knownPeople} rejectedMatches={rejectedMatches} onConfirmMatch={handleConfirmMatch} onRejectMatch={handleRejectMatch} onBatchUpload={handleUpload} />
      <NSFWMatchModal isOpen={isNSFWMatchOpen} onClose={() => setIsNSFWMatchOpen(false)} library={mergedLibrary} onReview={handleNSFWReview} onBatchUpload={handleUpload} />
      <DiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
    </div>
  );
};

// Wrap main app with ErrorBoundary
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
