import React, { useState, useEffect, useRef } from 'react';
import { MediaItem } from '../types';
import { checkForMatch } from '../services/geminiService';
import { Uploader } from './Uploader';
import { MediaType } from '../types';

interface FaceMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  library: MediaItem[];
  knownPeople: string[];
  rejectedMatches: Set<string>; // Set of "itemId-personName" strings
  onConfirmMatch: (itemId: string, personName: string) => void;
  onRejectMatch: (itemId: string, personName: string) => void;
  onBatchUpload: (file: File, type: MediaType) => void;
}

export const FaceMatchModal: React.FC<FaceMatchModalProps> = ({ 
  isOpen, onClose, library, knownPeople, rejectedMatches, onConfirmMatch, onRejectMatch, onBatchUpload 
}) => {
  const [currentMatch, setCurrentMatch] = useState<{ item: MediaItem, person: string, refImage: string } | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'SEARCHING' | 'FOUND' | 'EMPTY'>('IDLE');
  const [searchCount, setSearchCount] = useState(0);

  const processingRef = useRef(false);

  // Helper: Find reference image for a person
  const getReferenceImage = (person: string): string | null => {
    // Prefer items where this person is the ONLY detected person
    const ideal = library.find(i => i.analysis?.peopleDetected.length === 1 && i.analysis?.peopleDetected[0] === person);
    if (ideal) return ideal.url;
    // Fallback
    const any = library.find(i => i.analysis?.peopleDetected.includes(person));
    return any ? any.url : null;
  };

  const findNextMatch = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setStatus('SEARCHING');
    setCurrentMatch(null);

    try {
      // 1. Identify Candidates: Items with generic people tags OR no specific tags but are images
      const genericTags = ['person', 'people', 'man', 'woman', 'child', 'boy', 'girl', 'face'];
      
      const candidates = library.filter(item => {
        if (item.type !== 'IMAGE') return false;
        if (!item.analysis) return false;
        
        const hasKnown = item.analysis.peopleDetected.some(p => knownPeople.includes(p));
        // We look for items that DON'T have a known person yet, or have mixed generic tags
        // Simplification: Look for items with generic tags or empty peopleDetected but tags imply people
        const hasGeneric = item.analysis.peopleDetected.some(p => genericTags.includes(p.toLowerCase()));
        const hasGenericTag = item.analysis.tags.some(t => genericTags.includes(t.toLowerCase()));
        
        // Strict candidate: No Known People yet.
        return !hasKnown && (hasGeneric || hasGenericTag || item.analysis.peopleDetected.length === 0);
      });

      // Shuffle candidates to avoid stuck loops
      const shuffledCandidates = [...candidates].sort(() => 0.5 - Math.random());
      
      // Filter known people to have at least one reference image
      const validPeople = knownPeople.filter(p => getReferenceImage(p) !== null);

      if (shuffledCandidates.length === 0 || validPeople.length === 0) {
        setStatus('EMPTY');
        processingRef.current = false;
        return;
      }

      // Try a limited number of AI checks to find a positive match
      let attempts = 0;
      const MAX_ATTEMPTS = 5;

      for (const item of shuffledCandidates) {
        for (const person of validPeople) {
           const matchKey = `${item.id}-${person}`;
           if (rejectedMatches.has(matchKey)) continue;

           attempts++;
           setSearchCount(attempts);

           const refImage = getReferenceImage(person);
           if (!refImage) continue;

           // AI Check
           const isMatch = await checkForMatch(person, refImage, item.url);
           
           if (isMatch) {
             setCurrentMatch({ item, person, refImage });
             setStatus('FOUND');
             processingRef.current = false;
             return;
           } else {
             // Auto-reject silently to skip next time
             onRejectMatch(item.id, person);
           }

           if (attempts >= MAX_ATTEMPTS) {
             // Stop searching to let user breathe/upload
             setStatus('EMPTY');
             processingRef.current = false;
             return;
           }
        }
      }
      
      setStatus('EMPTY');
    } catch (e) {
      console.error("Error finding match", e);
      setStatus('EMPTY');
    } finally {
      processingRef.current = false;
    }
  };

  useEffect(() => {
    if (isOpen && status === 'IDLE') {
      findNextMatch();
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (currentMatch) {
      onConfirmMatch(currentMatch.item.id, currentMatch.person);
      findNextMatch();
    }
  };

  const handleReject = () => {
    if (currentMatch) {
      onRejectMatch(currentMatch.item.id, currentMatch.person);
      findNextMatch();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      
      {/* Close Button */}
      <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="w-full max-w-4xl flex flex-col items-center space-y-8">
        <div className="text-center space-y-2">
           <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Face Match</h2>
           <p className="text-zinc-400">Improve your library's facial recognition with AI</p>
        </div>

        {status === 'SEARCHING' && (
          <div className="flex flex-col items-center space-y-4 py-12">
             <div className="relative">
               <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
               <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent relative z-10"></div>
             </div>
             <p className="text-zinc-500 animate-pulse">Scanning library for matches...</p>
             <p className="text-xs text-zinc-700 font-mono">Attempt {searchCount}/5</p>
          </div>
        )}

        {status === 'FOUND' && currentMatch && (
           <div className="w-full animate-in zoom-in-95 duration-300">
             <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 mb-8">
                {/* Reference */}
                <div className="flex flex-col items-center gap-3">
                   <div className="w-32 h-32 md:w-48 md:h-48 rounded-2xl overflow-hidden border-4 border-blue-500/30 shadow-2xl relative">
                      <img src={currentMatch.refImage} className="w-full h-full object-cover" alt="Reference" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-center text-xs font-bold text-white uppercase">Known</div>
                   </div>
                   <span className="text-xl font-bold text-white">{currentMatch.person}</span>
                </div>

                {/* Arrow */}
                <div className="hidden md:flex text-zinc-600">
                   <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </div>

                {/* Candidate */}
                <div className="flex flex-col items-center gap-3">
                   <div className="w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden border-4 border-white/10 shadow-2xl relative bg-zinc-900">
                      <img src={currentMatch.item.url} className="w-full h-full object-contain" alt="Candidate" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-center text-xs font-bold text-zinc-400 uppercase">Found in Library</div>
                   </div>
                   <span className="text-sm text-zinc-500">Is this the same person?</span>
                </div>
             </div>

             <div className="flex justify-center gap-4">
                <button 
                  onClick={handleReject}
                  className="px-8 py-3 rounded-xl bg-zinc-800 text-white font-semibold hover:bg-zinc-700 transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  No
                </button>
                <button 
                  onClick={handleConfirm}
                  className="px-8 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Yes, it's {currentMatch.person}
                </button>
             </div>
           </div>
        )}

        {status === 'EMPTY' && (
           <div className="text-center space-y-6 max-w-md animate-in slide-in-from-bottom-4">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                 <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                 <h3 className="text-xl font-bold text-white">All Caught Up!</h3>
                 <p className="text-zinc-400 mt-2">We couldn't find any more obvious matches to confirm right now.</p>
              </div>
              
              <div className="pt-8 border-t border-white/10 w-full">
                 <p className="text-sm text-zinc-500 mb-4">Upload more photos to continue improving detection.</p>
                 <Uploader onUpload={onBatchUpload} />
              </div>
           </div>
        )}
      </div>
    </div>
  );
};
