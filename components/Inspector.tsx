
import React from 'react';
import { MediaItem, MediaType, SafetyLevel } from '../types';

interface InspectorProps {
  item: MediaItem | null;
  onClose?: () => void;
}

export const Inspector: React.FC<InspectorProps> = ({ item, onClose }) => {
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

  return (
    <div className="h-full flex flex-col bg-ios-surface/50">
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
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur rounded-full text-white border border-white/10 z-20 md:hidden active:scale-95 transition-transform">
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
          </div>
        </div>

        {item.analysis ? (
          <div className="space-y-8">
            
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

            {/* Transcript */}
            {item.analysis.transcript && (
              <div className="space-y-2">
                 <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Transcript</h3>
                 <div className="p-4 bg-ios-surface2 rounded-xl border border-white/5 text-xs text-zinc-400 leading-relaxed max-h-40 overflow-y-auto no-scrollbar">
                    {item.analysis.transcript}
                 </div>
              </div>
            )}

            {/* Tags */}
            <div className="space-y-3">
               <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tags</h3>
               <div className="flex flex-wrap gap-2">
                 {item.analysis.tags.map((tag, i) => (
                   <span key={i} className="px-3 py-1 bg-ios-surface2 text-zinc-300 text-xs font-medium rounded-full border border-white/10">
                     #{tag}
                   </span>
                 ))}
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
          <div className="p-8 rounded-xl border border-dashed border-white/10 flex flex-col items-center gap-4 text-center">
            {item.isAnalyzing ? (
               <>
                 <div className="animate-spin h-6 w-6 border-2 border-ios-blue rounded-full border-t-transparent"></div>
                 <span className="text-xs text-zinc-500 font-medium">Analyzing contents...</span>
               </>
            ) : (
               <span className="text-xs text-zinc-600">Pending analysis.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
