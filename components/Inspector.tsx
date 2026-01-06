import React from 'react';
import { MediaItem, MediaType, SafetyLevel } from '../types';

interface InspectorProps {
  item: MediaItem | null;
  onClose?: () => void;
}

export const Inspector: React.FC<InspectorProps> = ({ item, onClose }) => {
  if (!item) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center">
           <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <p className="text-sm">Select an item to view AI analysis.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header Image/Preview for Context */}
      <div className="relative h-48 md:h-64 bg-zinc-900 shrink-0">
         {item.type === MediaType.IMAGE && <img src={item.url} className="w-full h-full object-contain bg-black/50 backdrop-blur-3xl" alt="" />}
         {item.type === MediaType.VIDEO && <video src={item.url} controls className="w-full h-full object-contain bg-black" />}
         {item.type === MediaType.AUDIO && (
           <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
              <svg className="w-16 h-16 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
           </div>
         )}
         
         {onClose && (
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white md:hidden">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
         )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-zinc-950/50">
        <div>
          <h2 className="text-2xl font-bold text-white leading-tight break-words">{item.name}</h2>
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500 font-medium font-mono uppercase tracking-wide">
            <span>{item.type}</span>
            <span>•</span>
            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
          </div>
        </div>

        {item.analysis ? (
          <div className="space-y-6">
            
            {/* Safety Indicator */}
            <div className={`flex flex-col p-3 rounded-xl border ${
              item.analysis.safetyLevel === SafetyLevel.SAFE ? 'border-green-500/20 bg-green-500/10' :
              item.analysis.safetyLevel === SafetyLevel.NSFW ? 'border-red-500/20 bg-red-500/10' :
              'border-yellow-500/20 bg-yellow-500/10'
            }`}>
               <div className="flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${
                    item.analysis.safetyLevel === SafetyLevel.SAFE ? 'bg-green-500' :
                    item.analysis.safetyLevel === SafetyLevel.NSFW ? 'bg-red-500' :
                    'bg-yellow-500'
                 }`}></div>
                 <div className="flex-1">
                    <span className="text-xs font-bold text-zinc-400 uppercase">Safety Level</span>
                    <p className="text-sm font-medium text-white">{item.analysis.safetyLevel}</p>
                 </div>
               </div>
               
               {item.analysis.safetyReason && item.analysis.safetyLevel !== SafetyLevel.SAFE && (
                 <div className="mt-3 pt-2 border-t border-white/10">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Reason for Flag</p>
                    <p className="text-sm text-zinc-200 leading-snug">{item.analysis.safetyReason}</p>
                 </div>
               )}
            </div>

            {/* AI Description */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Analysis</h3>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {item.analysis.description}
              </p>
            </div>

            {/* Transcript (Collapsible) */}
            {item.analysis.transcript && (
              <div className="space-y-2">
                 <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Transcript</h3>
                 <details key={item.id} className="group bg-zinc-900 rounded-xl overflow-hidden border border-white/5 open:ring-1 open:ring-white/10 transition-all">
                    <summary className="flex items-center justify-between p-3 cursor-pointer select-none text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors">
                       <span>View Full Transcript</span>
                       <svg className="w-5 h-5 text-zinc-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="p-4 pt-0 text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap border-t border-white/5 mt-2 bg-black/20">
                       {item.analysis.transcript}
                    </div>
                 </details>
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
               <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Tags</h3>
               <div className="flex flex-wrap gap-2">
                 {item.analysis.tags.map((tag, i) => (
                   <span key={i} className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs font-medium rounded-md border border-blue-500/20">
                     #{tag}
                   </span>
                 ))}
               </div>
            </div>

            {/* People */}
            {(item.type === MediaType.IMAGE || item.type === MediaType.VIDEO) && item.analysis.peopleDetected.length > 0 && (
              <div className="space-y-2">
                 <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Detected People</h3>
                 <div className="flex flex-wrap gap-2">
                   {item.analysis.peopleDetected.map((person, i) => (
                     <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 text-zinc-200 text-xs rounded-full">
                       <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                       {person}
                     </span>
                   ))}
                 </div>
              </div>
            )}

            {/* Suggestion (Enhanced) */}
             {item.analysis.suggestedAction && (
              <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
                 <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    AI Suggestion
                 </h3>
                 <p className="text-sm text-zinc-200">{item.analysis.suggestedAction}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center gap-3">
            {item.isAnalyzing ? (
               <>
                 <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                 <span className="text-sm text-zinc-500">Processing media...</span>
               </>
            ) : (
               <span className="text-sm text-zinc-500">Pending analysis.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};