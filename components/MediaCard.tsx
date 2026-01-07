import React from 'react';
import { MediaItem, MediaType, SafetyLevel } from '../types';

interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  onSelect: (item: MediaItem) => void;
  onCancelUpload?: (item: MediaItem) => void;
  onRetryUpload?: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
}

const MediaCardComponent: React.FC<MediaCardProps> = ({ item, isSelected, onSelect, onCancelUpload, onRetryUpload, onDelete }) => {
  // Helpers for status checks
  const isUploading = item.status === 'uploading';
  const isProcessing = item.status === 'processing';
  const isPending = item.status === 'pending';
  const isError = item.status === 'error' || item.status === 'failed'; // handle legacy
  const isComplete = item.status === 'complete' || item.status === 'ready'; // handle legacy

  return (
    <div 
      onClick={() => isError ? null : onSelect(item)}
      className={`relative aspect-square overflow-hidden cursor-pointer group bg-ios-surface2 transition-all duration-300 ${
        isSelected
          ? 'z-10 ring-2 ring-ios-blue rounded-xl shadow-2xl shadow-black/50' 
          : 'hover:z-10 md:rounded-xl md:hover:scale-105 md:hover:ring-1 md:hover:ring-white/20 md:hover:shadow-xl md:hover:shadow-black/60'
      }`}
    >
      {/* Main Content Render */}
      {(isUploading || isError) ? (
         <div className="w-full h-full relative">
            {item.type === MediaType.IMAGE ? (
                <img src={item.url} alt={item.name} className="w-full h-full object-cover opacity-30 blur-sm" />
            ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/50 text-zinc-600 gap-2">
                    <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                 </div>
            )}
         </div>
      ) : (
         // Content for Pending, Processing, Complete
         <>
            {item.type === MediaType.IMAGE && (
                <img src={item.url} alt={item.name} loading="lazy" className={`w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-110 ${!isComplete ? 'opacity-50 grayscale' : ''}`} />
            )}
            {item.type === MediaType.VIDEO && (
                <div className={`w-full h-full relative bg-black ${!isComplete ? 'opacity-50' : ''}`}>
                    <video src={item.url} className="w-full h-full object-cover pointer-events-none" />
                    {isComplete && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center ring-1 ring-white/30">
                                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {item.type === MediaType.AUDIO && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-ios-surface2 to-ios-surface3 text-zinc-500 gap-2 p-4">
                    <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center border border-white/5">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                    </div>
                </div>
            )}
         </>
      )}

      {/* Badges */}
      <div className="absolute top-2 right-2 flex gap-1 z-20 pointer-events-none">
        {item.type === MediaType.VIDEO && <div className="bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-bold text-white border border-white/10 shadow-sm">VID</div>}
        {item.type === MediaType.AUDIO && <div className="bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-bold text-white border border-white/10 shadow-sm">AUD</div>}
      </div>

      {/* Delete Button */}
      {onDelete && !isUploading && (
         <button
           onClick={(e) => { e.stopPropagation(); onDelete(item); }}
           className="absolute top-2 left-2 w-6 h-6 bg-black/50 hover:bg-ios-danger/90 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center border border-white/10 z-30 md:hidden md:group-hover:flex"
           title="Delete"
         >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
         </button>
      )}

      {/* ---- OVERLAYS ---- */}

      {/* Uploading */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-20">
           <div className="w-full max-w-[80%] h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-white transition-all duration-300 ease-out" style={{ width: `${item.progress || 0}%` }}></div>
           </div>
           <div className="flex justify-between w-full max-w-[80%] text-[9px] font-medium text-zinc-400">
              <span>Uploading...</span>
              {onCancelUpload && (
                  <button onClick={(e) => { e.stopPropagation(); onCancelUpload(item); }} className="hover:text-white">Cancel</button>
              )}
           </div>
        </div>
      )}

      {/* Pending / Processing */}
      {(isPending || isProcessing) && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-20">
           <div className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md p-1.5 border border-white/20 shadow-lg">
              <div className="w-full h-full border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
           </div>
           <span className="mt-2 text-[9px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur shadow-sm border border-white/10">
             {isPending ? 'Queued' : 'Analyzing'}
           </span>
        </div>
      )}

      {/* Error */}
      {isError && (
         <div className="absolute inset-0 bg-ios-danger/10 backdrop-blur-sm flex flex-col items-center justify-center p-2 text-center z-20 border border-ios-danger/30">
            <svg className="w-5 h-5 text-ios-danger mb-1 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-[10px] text-ios-danger font-bold drop-shadow-sm">Failed</span>
            {onRetryUpload && (
                <button onClick={(e) => { e.stopPropagation(); onRetryUpload(item); }} className="mt-2 px-2 py-1 bg-ios-danger/20 rounded text-[9px] text-white hover:bg-ios-danger/40 transition-colors border border-ios-danger/30 shadow-sm">Retry</button>
            )}
         </div>
      )}
    </div>
  );
};

export const MediaCard = React.memo(MediaCardComponent);