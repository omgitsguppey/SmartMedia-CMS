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
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { UploadTask, getDownloadURL } from 'firebase/storage';

const WATCHDOG_TIMEOUT_MS = 90000; // 90 seconds

const AppContent: React.FC = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { addToast } = useToast();
  
  // Data State
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<any | null>(null); // Store full error object
  
  // Ephemeral State (Local Progress & Previews)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  
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
        setLibraryError(null); // Clear any previous error on success
        setIsLibraryLoading(false);
      },
      (error) => {
        setLibraryError(error);
        setIsLibraryLoading(false);
        addToast("Library sync failed", "error");
      }
    );

    // Load preferences once
    getRejectedMatches(user.uid).then(setRejectedMatches);

    return () => unsubscribe();
  }, [user, addToast]);

  // 2. Computed Properties
  const mergedLibrary = useMemo(() => {
    // Merge remote library with local upload progress and previews
    return library.map(item => {
      // If we have local progress for this item, override the static db progress
      if (uploadProgress[item.id] !== undefined) {
        return { 
          ...item, 
          progress: uploadProgress[item.id], 
          status: 'uploading' as const,
          url: localPreviews[item.id] || item.url // Use local preview if available
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
      addToast("Upload timed out", "error");
    }
  }, [user, addToast, cleanupLocalPreview]);

  const handleUpload = useCallback(async (file: File, type: MediaType) => {
    if (!user) return;

    try {
        addToast(`Uploading ${file.name}...`);
        
        // Generate local preview for immediate feedback
        const previewUrl = URL.createObjectURL(file);
        
        const { fileId, uploadTask } = await initializeUpload(user.uid, file);
        
        // Set local state
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
                
                // Clear local states
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[fileId];
                    return next;
                });
                cleanupLocalPreview(fileId);
                
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
                
                // Clear local progress but keep preview until we confirm sync (or just clear it, browser will load real URL)
                setUploadProgress(prev => {
                    const next = { ...prev };
                    delete next[fileId];
                    return next;
                });
                cleanupLocalPreview(fileId);

                addToast("Upload complete. Analyzing...", "success");
                
                // Get real URL
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await finalizeUpload(user.uid, fileId, downloadURL);

                // Run AI (Server Side)
                try {
                    const result = await analyzeMedia(undefined, type, knownPeople, downloadURL);
                    await updateMediaMetadata(user.uid, fileId, { analysis: result });
                } catch (aiErr) {
                    console.error("AI Analysis failed", aiErr);
                }
            }
        );

    } catch (initErr: any) {
        console.error("Init upload failed", initErr);
        addToast("Failed to start upload", "error");
    }
  }, [user, knownPeople, addToast, kickWatchdog, clearWatchdog, cleanupLocalPreview]);

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
      setDeepInsights("Insights unavailable.");
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

    // Critical Error State Display
    if (libraryError) {
        const isPermission = libraryError.code === 'permission-denied';
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4 p-8">
                <div className="p-4 bg-ios-danger/10 rounded-full text-ios-danger animate-pulse">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-white">Database Connection Error</h3>
                
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 max-w-lg w-full font-mono text-xs text-left overflow-auto">
                    <div className="flex flex-col gap-2">
                      <span className="text-zinc-400">Code: <span className="text-ios-danger">{libraryError.code || 'UNKNOWN'}</span></span>
                      <span className="text-zinc-400">Message: <span className="text-white">{libraryError.message}</span></span>
                      <span className="text-zinc-400">Path: <span className="text-ios-blue">users/{user?.uid}/files</span></span>
                      <span className="text-zinc-400">Target DB: <span className="text-ios-warning">senseosdata</span></span>
                      <span className="text-zinc-400">Time: {new Date().toISOString()}</span>
                    </div>
                </div>

                {isPermission && (
                   <div className="bg-ios-warning/10 border border-ios-warning/20 p-4 rounded-xl max-w-lg text-sm text-ios-warning">
                      <strong>Action Required:</strong> The security rules for database <code>senseosdata</code> are blocking this request. You must update your Firestore Rules for this specific database in the Firebase Console.
                   </div>
                )}

                <button onClick={() => window.location.reload()} className="px-6 py-2 bg-white text-black rounded-lg font-bold hover:bg-zinc-200">Retry Connection</button>
            </div>
        );
    }

    if (filteredLibrary.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8 space-y-4">
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
                {/* Desktop Upload Button */}
                <div className="relative group">
                    <input 
                        type="file" 
                        multiple
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        accept="image/*,video/*,audio/*"
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                Array.from(e.target.files).forEach((file: File) => {
                                    let type = MediaType.IMAGE;
                                    if (file.type.startsWith('video/')) type = MediaType.VIDEO;
                                    else if (file.type.startsWith('audio/')) type = MediaType.AUDIO;
                                    else if (!file.type.startsWith('image/')) return;
                                    handleUpload(file, type);
                                });
                                e.target.value = '';
                            }
                        }}
                    />
                    <button className="p-2 rounded-full bg-ios-surface2 text-zinc-400 group-hover:text-white group-hover:bg-zinc-700 transition-colors border border-white/5" title="Upload Media">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
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

          <main className="flex-1 overflow-y-auto no-scrollbar relative">
             {renderMainContent()}
             
             {/* Upload FAB */}
             <div className="fixed bottom-6 right-6 md:hidden z-30">
                <div className="w-14 h-14 rounded-full bg-white text-black shadow-2xl flex items-center justify-center overflow-hidden">
                   <Uploader onUpload={handleUpload} />
                   <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                   </div>
                </div>
             </div>
          </main>
       </div>

       {/* Inspector Panel */}
       <div className={`fixed inset-y-0 right-0 w-full md:w-96 bg-ios-surface border-l border-white/10 transform transition-transform duration-300 z-40 ${selectedId ? 'translate-x-0' : 'translate-x-full'}`}>
          <Inspector item={selectedItem} onClose={() => setSelectedId(null)} />
       </div>
       
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
       
       <DiagnosticsModal
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

export default AppContent;