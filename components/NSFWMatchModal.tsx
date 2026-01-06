import React, { useState, useEffect } from 'react';
import { MediaItem, MediaType, SafetyLevel } from '../types';
import { Uploader } from './Uploader';

interface NSFWMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  library: MediaItem[];
  onReview: (itemId: string, isNSFW: boolean) => void;
  onBatchUpload: (file: File, type: MediaType) => void;
}

export const NSFWMatchModal: React.FC<NSFWMatchModalProps> = ({ 
  isOpen, onClose, library, onReview, onBatchUpload 
}) => {
  const [currentCandidate, setCurrentCandidate] = useState<MediaItem | null>(null);
  
  // Find the next candidate
  useEffect(() => {
    if (isOpen) {
      const candidate = library.find(item => item.analysis?.safetyLevel === SafetyLevel.POSSIBLE_NSFW);
      setCurrentCandidate(candidate || null);
    }
  }, [isOpen, library]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      
      {/* Close Button */}
      <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="w-full max-w-4xl flex flex-col items-center space-y-8">
        <div className="text-center space-y-2">
           <h2 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent flex items-center justify-center gap-3">
             <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             NSFW Match
           </h2>
           <p className="text-zinc-400">Verify content flagged as potentially unsafe to improve accuracy.</p>
        </div>

        {currentCandidate ? (
           <div className="w-full animate-in zoom-in-95 duration-300 flex flex-col items-center">
             
             {/* Media Preview Container */}
             <div className="relative w-full max-w-2xl h-[400px] bg-zinc-900 rounded-2xl overflow-hidden border-2 border-orange-500/30 shadow-2xl mb-8 group">
                {currentCandidate.type === MediaType.IMAGE && (
                  <img src={currentCandidate.url} className="w-full h-full object-contain" alt="Candidate" />
                )}
                {currentCandidate.type === MediaType.VIDEO && (
                  <video src={currentCandidate.url} controls className="w-full h-full object-contain" />
                )}
                {currentCandidate.type === MediaType.AUDIO && (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                     <svg className="w-24 h-24 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                )}
                
                <div className="absolute top-4 left-4 px-3 py-1 bg-orange-500/90 text-white text-xs font-bold rounded-full shadow-lg">
                  Flagged: Possible NSFW
                </div>
             </div>

             <div className="flex flex-col items-center gap-6 w-full max-w-lg">
                <p className="text-zinc-300 text-lg">Does this contain adult or unsafe content?</p>
                
                <div className="flex w-full gap-4">
                  <button 
                    onClick={() => onReview(currentCandidate.id, false)}
                    className="flex-1 py-4 rounded-xl bg-green-600/20 text-green-400 border border-green-500/50 hover:bg-green-600 hover:text-white font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Mark Safe
                  </button>
                  <button 
                    onClick={() => onReview(currentCandidate.id, true)}
                    className="flex-1 py-4 rounded-xl bg-red-600/20 text-red-400 border border-red-500/50 hover:bg-red-600 hover:text-white font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Confirm NSFW
                  </button>
                </div>
             </div>
           </div>
        ) : (
           <div className="text-center space-y-6 max-w-md animate-in slide-in-from-bottom-4">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                 <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                 <h3 className="text-xl font-bold text-white">Review Complete!</h3>
                 <p className="text-zinc-400 mt-2">There are no more items flagged as "Possible NSFW".</p>
              </div>
              
              <div className="pt-8 border-t border-white/10 w-full">
                 <p className="text-sm text-zinc-500 mb-4">Upload more media to continue moderation.</p>
                 <Uploader onUpload={onBatchUpload} />
              </div>
           </div>
        )}
      </div>
    </div>
  );
};
