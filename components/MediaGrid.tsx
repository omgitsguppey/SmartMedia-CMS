import React from 'react';
import { MediaItem, MediaType, SafetyLevel } from '../types';

interface MediaGridProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  selectedId: string | null;
}

export const MediaGrid: React.FC<MediaGridProps> = ({ items, onSelect, selectedId }) => {
  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0.5 md:gap-4 md:p-6 pb-32 md:pb-6">
      {items.map((item) => (
        <div 
          key={item.id}
          onClick={() => onSelect(item)}
          className={`relative aspect-square overflow-hidden cursor-pointer group bg-zinc-900 md:rounded-xl md:ring-1 md:ring-white/5 transition-all ${
            selectedId === item.id ? 'z-10 ring-2 ring-blue-500' : 'hover:opacity-90'
          }`}
        >
          {item.type === MediaType.IMAGE && (
            <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
          )}
          {item.type === MediaType.VIDEO && (
            <video src={item.url} className="w-full h-full object-cover pointer-events-none" />
          )}
          {item.type === MediaType.AUDIO && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-zinc-500 gap-2 p-2">
              <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span className="text-[10px] text-center truncate w-full px-1">{item.name}</span>
            </div>
          )}

          {/* Type Icon (Mobile Friendly) */}
          <div className="absolute top-1 right-1">
             {item.type === MediaType.VIDEO && (
               <div className="bg-black/40 backdrop-blur-md rounded-full p-1">
                 <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
               </div>
             )}
          </div>

          {/* Badges */}
          <div className="absolute bottom-0 left-0 right-0 p-1 flex justify-between items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity md:opacity-100">
            {item.analysis?.safetyLevel === SafetyLevel.NSFW && (
              <span className="bg-red-500/90 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">NSFW</span>
            )}
          </div>

          {/* Overlay Status */}
          {item.isAnalyzing && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/50 border-t-white"></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};