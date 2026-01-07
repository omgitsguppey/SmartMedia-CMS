import React, { useState } from 'react';
import { MediaItem, MediaType, SafetyLevel } from '../types';
import { reanalyzeMedia } from '../services/geminiService';

interface InspectorProps {
  item: MediaItem | null;
  onClose?: () => void;
  onUpdate?: (id: string, updates: Partial<MediaItem>) => void;
}

export const Inspector: React.FC<InspectorProps> = ({ item, onClose, onUpdate }) => {
  const [newTag, setNewTag] = useState('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-600 p-8 text-center space-y-4 select-none">
        <div className="w-16 h-16 rounded-2xl bg-ios-surface2 flex items-center justify-center border border-white/5">
           <svg className="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <p className="text-sm font-medium">Select an item to view analysis</p>
      </div>
    );
  }

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim() || !item.analysis || !onUpdate) return;
    
    const cleanTag = newTag.trim().toLowerCase();
    if (!item.analysis.tags.includes(cleanTag)) {
        onUpdate(item.id, {
            analysis: {
                ...item.analysis,
                tags: [...item.analysis.tags, cleanTag],
                isUserEdited: true // Mark as correction signal
            }
        });
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!item.analysis || !onUpdate) return;
    onUpdate(item.id, {
        analysis: {
            ...item.analysis,
            tags: item.analysis.tags.filter(t => t !== tagToRemove),
            isUserEdited: true // Mark as correction signal
        }
    });
  };

  const handleReanalyze = async () => {
      if (isReanalyzing) return;
      setIsReanalyzing(true);
      try {
          await reanalyzeMedia(item.id);
          // Optimistic update handled by Firestore subscription
      } catch (e) {
          console.error("Reanalysis failed", e);
      } finally {
          setIsReanalyzing(false);
      }
  };

  const isComplete = item.status === 'complete' || item.status === 'ready';
  const isProcessing = item.status === 'processing';
  const isPending = item.status === 'pending' || item.status === 'uploading';
  const isError = item.status === 'error' || item.status === 'failed';
  
  // Show reanalyze if it's stuck pending/queued, or explicitly failed, or is empty of analysis but should be done.
  const showReanalyze = isError || (isPending && !item.progress) || (isProcessing) || (isComplete && !item.analysis);

  return (
    <div className="h-full flex flex-col bg-ios-surface/50 relative">
      
      {/* Header Image/Preview */}
      <div className="relative h-64 shrink-0 bg-black flex items-center justify-center overflow-hidden border-b border-white/5">
         {item.type === MediaType.IMAGE && (
             <>
               <div className="absolute inset-0 bg-center bg-cover blur-3xl opacity-30" style={{ backgroundImage: `url(${item.url})` }}></div>
               <img src={item.url} className="w-full h-full object-contain relative z-10" alt="" />
             </>
         )}
         {item.type === MediaType.VIDEO && <video src={item.url} controls className="w-full h-full object-contain bg-black relative z-10" />}
         {item.type === MediaType.AUDIO && (
           <div className="w-full h-full flex items-center justify-center relative z-10">
              <svg className="w-16 h-16 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
           </div>
         )}
         
         {onClose && (
            <button 
                onClick={onClose} 
                className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur rounded-full text-white border border-white/10 z-20 active:scale-95 transition-transform hover:bg-black/80"
                aria-label="Close Inspector"
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
         )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
        <div>
          <h2 className="text-lg font-bold text-white leading-tight break-words">{item.name}</h2>
          <div className="flex items-center gap-3 mt-3">
             <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-zinc-300 border border-white/5 tracking-wide">{item.type}</span>
             <span className="text-xs text-zinc-500 font-medium">{new Date(item.timestamp).toLocaleDateString()}</span>
             {item.analysis?.isUserEdited && (
                 <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-ios-blue/10 text-ios-blue border border-ios-blue/20 tracking-wide">Edited</span>
             )}
          </div>
        </div>

        {item.analysis ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Safety Indicator */}
            <div className={`flex flex-col p-4 rounded-xl border transition-colors ${
              item.analysis.safetyLevel === SafetyLevel.SAFE ? 'border-ios-success/20 bg-ios-success/5' :
              item.analysis.safetyLevel === SafetyLevel.NSFW ? 'border-ios-danger/20 bg-ios-danger/5' :
              'border-ios-warning/20 bg-ios-warning/5'
            }`}>
               <div className="flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${
                    item.analysis.safetyLevel === SafetyLevel.SAFE ? 'bg-ios-success shadow-[0_0_10px_rgba(50,215,75,0.5)]' :
                    item.analysis.safetyLevel === SafetyLevel.NSFW ? 'bg-ios-danger shadow-[0_0_10px_rgba(255,69,58,0.5)]' :
                    'bg-ios-warning shadow-[0_0_10px_rgba(255,214,10,0.5)]'
                 }`}></div>
                 <div className="flex-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Safety Level</span>
                    <p className="text-sm font-medium text-white">{item.analysis.safetyLevel}</p>
                 </div>
               </div>
               
               {item.analysis.safetyReason && item.analysis.safetyLevel !== SafetyLevel.SAFE && (
                 <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Reason</p>
                    <p className="text-xs text-zinc-300 leading-normal">{item.analysis.safetyReason}</p>
                 </div>
               )}
            </div>

            {/* AI Description */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Analysis</h3>
              <p className="text-sm text-zinc-300 leading-relaxed font-normal">
                {item.analysis.description}
              </p>
            </div>

            {/* Tags (Editable) */}
            <div className="space-y-3">
               <div className="flex justify-between items-center">
                   <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tags</h3>
                   <span className="text-[9px] text-zinc-600">Edits improve future AI accuracy</span>
               </div>
               
               <div className="flex flex-wrap gap-2">
                 {item.analysis.tags.map((tag, i) => (
                   <span key={i} className="group relative px-3 py-1 bg-ios-surface2 text-zinc-300 text-xs font-medium rounded-full border border-white/10 hover:border-white/30 transition-colors cursor-default">
                     #{tag}
                     <button 
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                     >
                        ×
                     </button>
                   </span>
                 ))}
                 
                 <form onSubmit={handleAddTag} className="flex items-center">
                    <input 
                        type="text" 
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="+ Add tag"
                        className="px-3 py-1 bg-transparent text-white text-xs border border-dashed border-zinc-700 rounded-full hover:border-zinc-500 focus:border-ios-blue focus:ring-0 outline-none w-24 transition-colors"
                    />
                 </form>
               </div>
            </div>

            {/* People */}
            {(item.type === MediaType.IMAGE || item.type === MediaType.VIDEO) && item.analysis.peopleDetected.length > 0 && (
              <div className="space-y-3">
                 <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">People Detected</h3>
                 <div className="flex flex-wrap gap-2">
                   {item.analysis.peopleDetected.map((person, i) => (
                     <span key={i} className="flex items-center gap-2 px-3 py-1.5 bg-ios-blue/10 text-ios-blue text-xs rounded-lg border border-ios-blue/20">
                       <span className="w-1.5 h-1.5 bg-ios-blue rounded-full"></span>
                       {person}
                     </span>
                   ))}
                 </div>
              </div>
            )}
            
            {/* Suggestion */}
             {item.analysis.suggestedAction && (
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                 <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <svg className="w-3 h-3 text-ios-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Suggestion
                 </h3>
                 <p className="text-sm text-zinc-200">{item.analysis.suggestedAction}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 rounded-xl border border-dashed border-white/10 flex flex-col items-center gap-4 text-center mt-10">
            {isProcessing ? (
               <>
                 <div className="relative">
                     <div className="absolute inset-0 bg-ios-blue/20 blur-lg rounded-full"></div>
                     <div className="animate-spin h-8 w-8 border-2 border-ios-blue rounded-full border-t-transparent relative z-10"></div>
                 </div>
                 <span className="text-xs text-zinc-500 font-medium">Analyzing contents...</span>
               </>
            ) : isPending ? (
               <>
                 <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                    <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <span className="text-xs text-zinc-600">Pending analysis...</span>
               </>
            ) : isError ? (
               <>
                 <div className="w-8 h-8 rounded-full bg-ios-danger/10 flex items-center justify-center border border-ios-danger/20">
                    <svg className="w-4 h-4 text-ios-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <span className="text-xs text-ios-danger">Analysis failed</span>
               </>
            ) : (
               <span className="text-xs text-zinc-600">No analysis available.</span>
            )}
            
            {showReanalyze && (
               <button 
                  onClick={handleReanalyze}
                  disabled={isReanalyzing || isProcessing}
                  className="mt-2 px-4 py-2 bg-ios-surface2 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50"
               >
                  {isReanalyzing ? 'Queueing...' : 'Force Re-analyze'}
               </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};