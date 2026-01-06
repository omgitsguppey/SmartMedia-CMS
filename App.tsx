import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { MediaItem, MediaType, SafetyLevel } from './types';
import { analyzeMedia, getDeepInsights } from './services/geminiService';
import { initDB, getLibrary, saveMediaItem, saveRejectedMatches, getRejectedMatches, dataURLtoFile } from './services/storageService';
import { Uploader } from './components/Uploader';
import { MediaGrid } from './components/MediaGrid';
import { Inspector } from './components/Inspector';
import { GenerationModal } from './components/GenerationModal';
import { FacesView } from './components/FacesView';
import { FaceMatchModal } from './components/FaceMatchModal';
import { NSFWMatchModal } from './components/NSFWMatchModal';

const App: React.FC = () => {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isGenerationModalOpen, setGenerationModalOpen] = useState(false);
  const [isFaceMatchOpen, setIsFaceMatchOpen] = useState(false);
  const [isNSFWMatchOpen, setIsNSFWMatchOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [deepInsights, setDeepInsights] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FACES' | 'NSFW'>('ALL');
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Track rejected matches to never ask again: "itemId-personName"
  const [rejectedMatches, setRejectedMatches] = useState<Set<string>>(new Set());

  // Initialize DB and load data
  useEffect(() => {
    const init = async () => {
      try {
        await initDB();
        const loadedLibrary = await getLibrary();
        const loadedMatches = await getRejectedMatches();
        setLibrary(loadedLibrary);
        setRejectedMatches(loadedMatches);
      } catch (error) {
        console.error("Failed to initialize storage:", error);
      } finally {
        setIsInitialized(true);
      }
    };
    init();
  }, []);

  const selectedItem = library.find(item => item.id === selectedId) || null;

  // Derive known people list for the AI context
  const knownPeople = useMemo(() => {
    const people = new Set<string>();
    library.forEach(item => item.analysis?.peopleDetected.forEach(p => people.add(p)));
    return Array.from(people);
  }, [library]);

  // Helper to update library and persist
  const updateLibraryItem = async (updatedItem: MediaItem) => {
    setLibrary(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    await saveMediaItem(updatedItem);
  };

  const handleUpload = useCallback(async (file: File, type: MediaType) => {
    const newItem: MediaItem = {
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      type,
      name: file.name,
      timestamp: Date.now(),
      isAnalyzing: true
    };

    // Optimistic update
    setLibrary(prev => [newItem, ...prev]);
    setIsUploadOpen(false);
    // Save initial state
    await saveMediaItem(newItem);

    try {
      // Use current knownPeople (captured via closure, or passed if we refactor, but standard closure works as knownPeople updates on re-renders)
      // Note: In a real app with rapid batch uploads, `knownPeople` might be stale inside this callback if not careful, 
      // but for "improving over time", using the state at upload start is acceptable.
      const result = await analyzeMedia(file, type, knownPeople);
      
      setLibrary(prev => {
        const updated = prev.map(item => 
          item.id === newItem.id 
            ? { ...item, analysis: result, isAnalyzing: false } 
            : item
        );
        return updated;
      });
      
      // Save analyzed state
      const analyzedItem = { ...newItem, analysis: result, isAnalyzing: false };
      await saveMediaItem(analyzedItem);
      
    } catch (e) {
      setLibrary(prev => prev.map(item => 
        item.id === newItem.id 
          ? { ...item, isAnalyzing: false } 
          : item
      ));
      // Save error state (analyzing false)
      await saveMediaItem({ ...newItem, isAnalyzing: false });
    }
  }, [knownPeople]);

  const handleGeneratedImage = async (url: string, prompt: string) => {
    // Convert Data URL to File for persistence
    const file = dataURLtoFile(url, `generated-${Date.now()}.png`);
    
    const newItem: MediaItem = {
      id: crypto.randomUUID(),
      file: file,
      url: url,
      type: MediaType.IMAGE,
      name: `Gen: ${prompt.slice(0, 15)}...`,
      timestamp: Date.now(),
      isAnalyzing: false,
      analysis: {
        description: prompt,
        tags: ["generated", "ai"],
        peopleDetected: [],
        safetyLevel: SafetyLevel.SAFE,
      }
    };
    setLibrary(prev => [newItem, ...prev]);
    await saveMediaItem(newItem);
  };

  const handleThinkingMode = async () => {
    if (library.length === 0) return;
    setIsThinking(true);
    setDeepInsights(null);
    
    const metadataSummary = JSON.stringify(library.map(item => ({
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
    // We need to update multiple items
    const itemsToUpdate: MediaItem[] = [];
    
    setLibrary(prev => prev.map(item => {
       if (item.analysis?.peopleDetected.includes(oldName)) {
         const updatedItem = {
           ...item,
           analysis: {
             ...item.analysis,
             peopleDetected: item.analysis.peopleDetected.map(p => p === oldName ? newName : p)
           }
         };
         itemsToUpdate.push(updatedItem);
         return updatedItem;
       }
       return item;
    }));

    // Persist all changes
    itemsToUpdate.forEach(item => saveMediaItem(item));

    if (personFilter === oldName) setPersonFilter(newName);
  };

  const handleConfirmMatch = async (itemId: string, personName: string) => {
    const item = library.find(i => i.id === itemId);
    if (item && item.analysis) {
        // Remove generic tags if present to clean up? Optional.
        // We just append the person if not present
        const currentPeople = item.analysis.peopleDetected || [];
        if (!currentPeople.includes(personName)) {
           const updatedItem = {
             ...item,
             analysis: {
               ...item.analysis,
               peopleDetected: [...currentPeople, personName]
             }
           };
           await updateLibraryItem(updatedItem);
        }
    }
  };

  const handleRejectMatch = async (itemId: string, personName: string) => {
    const newRejected = new Set(rejectedMatches).add(`${itemId}-${personName}`);
    setRejectedMatches(newRejected);
    await saveRejectedMatches(Array.from(newRejected));
  };

  const handleNSFWReview = async (itemId: string, isNSFW: boolean) => {
    const item = library.find(i => i.id === itemId);
    if (item && item.analysis) {
        const updatedItem = {
           ...item,
           analysis: {
             ...item.analysis,
             safetyLevel: isNSFW ? SafetyLevel.NSFW : SafetyLevel.SAFE
           }
         };
         await updateLibraryItem(updatedItem);
    }
  };

  const filteredLibrary = library.filter(item => {
    if (filter === 'FACES') {
      if (personFilter) {
        return item.analysis?.peopleDetected.includes(personFilter);
      }
      return false;
    }
    if (filter === 'NSFW') {
      return item.analysis?.safetyLevel === SafetyLevel.NSFW || item.analysis?.safetyLevel === SafetyLevel.POSSIBLE_NSFW;
    }
    if (filter === 'ALL') return true;
    return item.type === filter;
  });

  const renderMainContent = () => {
    if (filter === 'FACES' && !personFilter) {
      return (
        <FacesView 
          items={library} 
          onRename={handleRenamePerson} 
          onSelectPerson={(person) => setPersonFilter(person)} 
        />
      );
    }
    
    if (filteredLibrary.length === 0 && !isUploadOpen) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 opacity-50 pointer-events-none">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-sm">No media found</p>
        </div>
      );
    }

    return (
      <MediaGrid items={filteredLibrary} onSelect={item => setSelectedId(item.id)} selectedId={selectedId} />
    );
  };

  if (!isInitialized) {
    return (
        <div className="flex h-screen w-full bg-black text-white items-center justify-center">
             <div className="flex flex-col items-center gap-4">
                 <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"></div>
                 <p className="text-zinc-500 text-sm animate-pulse">Loading Library...</p>
             </div>
        </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-black text-white font-sans overflow-hidden">
      
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-72 flex-col border-r border-white/10 bg-zinc-950/50 backdrop-blur-xl">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </span>
            SmartCMS
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <button onClick={() => { setFilter('ALL'); setPersonFilter(null); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${filter === 'ALL' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>Library</button>
          <button onClick={() => { setFilter('IMAGE'); setPersonFilter(null); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${filter === 'IMAGE' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>Images</button>
          <button onClick={() => { setFilter('VIDEO'); setPersonFilter(null); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${filter === 'VIDEO' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>Videos</button>
          <button onClick={() => { setFilter('AUDIO'); setPersonFilter(null); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${filter === 'AUDIO' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>Audio</button>
          
          <div className="pt-4 pb-2 px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">People</div>
          <button onClick={() => { setFilter('FACES'); setPersonFilter(null); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${filter === 'FACES' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>
             Faces & People
          </button>

          <div className="pt-8 pb-2 px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Moderation</div>
          <button onClick={() => { setFilter('NSFW'); setPersonFilter(null); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all group flex items-center justify-between ${filter === 'NSFW' ? 'bg-red-500/10 text-red-400' : 'text-zinc-400 hover:bg-white/5 hover:text-red-400'}`}>
             <span>NSFW Flagged</span>
             <span className="w-2 h-2 rounded-full bg-red-500"></span>
          </button>

          <div className="pt-8 pb-2 px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Smart Tools</div>
          <button 
            onClick={() => setIsFaceMatchOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-all group"
          >
             <span className="p-1.5 rounded-md bg-green-500/20 text-green-400 group-hover:bg-green-500/30">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </span>
             Face Match
          </button>
          <button 
            onClick={() => setIsNSFWMatchOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-all group"
          >
             <span className="p-1.5 rounded-md bg-red-500/20 text-red-400 group-hover:bg-red-500/30">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             </span>
             NSFW Match
          </button>
          <button 
            onClick={() => setGenerationModalOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-all group"
          >
            <span className="p-1.5 rounded-md bg-purple-500/20 text-purple-400 group-hover:bg-purple-500/30">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </span>
            Generate Image
          </button>
          <button 
            onClick={handleThinkingMode}
            disabled={library.length === 0}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition-all group disabled:opacity-50"
          >
             <span className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </span>
            Deep Insights
          </button>
        </nav>
        
        <div className="p-6">
           <div className="border-t border-white/10 pt-4">
              <Uploader onUpload={handleUpload} />
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-black relative">
        {/* Mobile Header */}
        <header className="md:hidden flex flex-col bg-black/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 py-3">
             <h1 className="text-xl font-bold">Library</h1>
             <div className="flex gap-2">
               <button 
                 onClick={() => setIsUploadOpen(!isUploadOpen)}
                 className="p-2 bg-blue-600 rounded-full text-white hover:bg-blue-500 transition-colors"
               >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
               </button>
             </div>
          </div>
          
          {/* Mobile Filter Pills */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
             {['ALL', 'IMAGE', 'VIDEO', 'AUDIO', 'FACES', 'NSFW'].map((f) => (
               <button
                 key={f}
                 onClick={() => { setFilter(f as any); setPersonFilter(null); }}
                 className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                   filter === f 
                     ? f === 'NSFW' ? 'bg-red-500 text-white' : 'bg-white text-black' 
                     : f === 'NSFW' ? 'bg-red-500/10 text-red-500' : 'bg-zinc-800 text-zinc-400'
                 }`}
               >
                 {f === 'ALL' ? 'All Items' : f === 'NSFW' ? 'NSFW' : f.charAt(0) + f.slice(1).toLowerCase()}
               </button>
             ))}
          </div>

          {/* Mobile Uploader Drawer */}
          {isUploadOpen && (
             <div className="px-4 pb-4 animate-in slide-in-from-top-4 fade-in duration-200">
                <Uploader onUpload={handleUpload} />
             </div>
          )}
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex h-16 border-b border-white/10 items-center px-8 justify-between bg-black/50 backdrop-blur-sm z-20">
           <div className="flex items-center gap-4">
              {personFilter && (
                <button 
                  onClick={() => setPersonFilter(null)}
                  className="p-1 rounded-full hover:bg-zinc-800 text-zinc-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
              )}
              <h2 className="text-xl font-semibold text-white">
                {personFilter 
                  ? personFilter 
                  : filter === 'ALL' ? 'Library' : filter === 'FACES' ? 'People' : filter.charAt(0).toUpperCase() + filter.slice(1).toLowerCase()}
                {!personFilter && filter !== 'FACES' && <span className="ml-3 text-base text-zinc-500 font-normal">{filteredLibrary.length} items</span>}
              </h2>
           </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden relative h-full">
           {renderMainContent()}
        </main>

        {/* Mobile Bottom Bar Actions */}
        <div className="md:hidden border-t border-white/10 bg-zinc-950/80 backdrop-blur-xl px-6 py-3 flex justify-between items-center safe-area-bottom z-40">
           <button 
             onClick={() => setGenerationModalOpen(true)}
             className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white"
           >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              <span className="text-[10px] font-medium">Generate</span>
           </button>
           <button 
             onClick={() => setIsFaceMatchOpen(true)}
             className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white"
           >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[10px] font-medium">Matches</span>
           </button>
           <button 
             onClick={() => setIsNSFWMatchOpen(true)}
             className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white"
           >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span className="text-[10px] font-medium">NSFW</span>
           </button>
           <button 
             onClick={handleThinkingMode}
             disabled={library.length === 0}
             className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white disabled:opacity-30"
           >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-[10px] font-medium">Insights</span>
           </button>
        </div>
      </div>

      {/* Inspector (Responsive) */}
      <div 
        className={`fixed inset-0 z-50 transform transition-transform duration-300 md:hidden flex flex-col justify-end ${selectedId ? 'translate-y-0' : 'translate-y-full'}`}
      >
         <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedId(null)}></div>
         <div className="relative bg-zinc-900 rounded-t-3xl h-[85vh] overflow-hidden flex flex-col shadow-2xl ring-1 ring-white/10">
            <div className="w-full flex justify-center pt-3 pb-1" onClick={() => setSelectedId(null)}>
               <div className="w-12 h-1.5 bg-zinc-700 rounded-full"></div>
            </div>
            <div className="flex-1 overflow-y-auto">
               <Inspector item={selectedItem} onClose={() => setSelectedId(null)} />
            </div>
         </div>
      </div>

      {/* Desktop: Right Sidebar */}
      <aside className="hidden md:flex w-96 border-l border-white/10 bg-zinc-950/50 backdrop-blur-xl flex-col">
         <Inspector item={selectedItem} />
      </aside>

      {/* Insights Overlay */}
      {(isThinking || deepInsights) && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl p-6 md:p-12 flex flex-col items-center overflow-y-auto">
          <div className="max-w-2xl w-full mt-10 md:mt-0">
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-black/90 backdrop-blur-md py-4 -mx-4 px-4">
               <h3 className="text-2xl font-bold text-amber-500 flex items-center gap-3">
                 <span className="p-2 bg-amber-500/10 rounded-full">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 </span>
                 Insights
               </h3>
               <button onClick={() => setDeepInsights(null)} className="p-2 rounded-full bg-zinc-800 text-white hover:bg-zinc-700">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>
            
            {isThinking ? (
              <div className="space-y-6 animate-pulse mt-8">
                 <div className="h-4 bg-zinc-800 rounded w-3/4"></div>
                 <div className="h-4 bg-zinc-800 rounded w-full"></div>
                 <div className="h-4 bg-zinc-800 rounded w-5/6"></div>
                 <div className="flex justify-center mt-12">
                   <div className="animate-spin h-8 w-8 border-2 border-amber-500 rounded-full border-t-transparent"></div>
                 </div>
                 <p className="text-amber-500/80 text-center text-sm font-mono mt-4">Analyzing patterns in your library...</p>
              </div>
            ) : (
              <div className="prose prose-invert prose-amber max-w-none pb-20">
                 <div className="bg-zinc-900/50 p-6 md:p-8 rounded-2xl border border-white/5 leading-relaxed whitespace-pre-wrap text-zinc-200">
                   {deepInsights}
                 </div>
              </div>
            )}
          </div>
        </div>
      )}

      <GenerationModal 
        isOpen={isGenerationModalOpen} 
        onClose={() => setGenerationModalOpen(false)}
        onImageGenerated={handleGeneratedImage}
      />

      <FaceMatchModal 
        isOpen={isFaceMatchOpen} 
        onClose={() => setIsFaceMatchOpen(false)}
        library={library}
        knownPeople={knownPeople}
        rejectedMatches={rejectedMatches}
        onConfirmMatch={handleConfirmMatch}
        onRejectMatch={handleRejectMatch}
        onBatchUpload={handleUpload}
      />
      
      <NSFWMatchModal 
        isOpen={isNSFWMatchOpen} 
        onClose={() => setIsNSFWMatchOpen(false)}
        library={library}
        onReview={handleNSFWReview}
        onBatchUpload={handleUpload}
      />
    </div>
  );
};

export default App;