
import React, { useState } from 'react';
import { AspectRatio } from '../types';
import { generateImage } from '../services/geminiService';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageGenerated: (url: string, prompt: string) => void;
}

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "3:4", "4:3", "9:16", "16:9"];

export const GenerationModal: React.FC<GenerationModalProps> = ({ isOpen, onClose, onImageGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const url = await generateImage(prompt, aspectRatio);
      if (url) {
        onImageGenerated(url, prompt);
        onClose();
        setPrompt('');
      } else {
        setError("Failed to generate image.");
      }
    } catch (e) {
      setError("An error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-ios-surface border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden ring-1 ring-white/5 transform transition-all scale-100 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h2 className="text-lg font-bold text-white">Create with AI</h2>
          <button onClick={onClose} className="p-2 rounded-full bg-black/50 text-zinc-400 hover:text-white transition-colors">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Prompt</label>
            <textarea 
              className="w-full bg-ios-surface2 border border-white/10 rounded-xl p-4 text-white placeholder-zinc-600 focus:ring-2 focus:ring-ios-blue focus:border-transparent focus:outline-none resize-none h-32 text-base leading-relaxed"
              placeholder="Imagine something amazing..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Aspect Ratio</label>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ${
                    aspectRatio === ratio 
                      ? 'bg-white text-black border-white shadow-lg' 
                      : 'bg-ios-surface2 text-zinc-400 border-white/10 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {error && (
             <div className="p-3 bg-ios-danger/10 border border-ios-danger/20 rounded-lg text-ios-danger text-sm">
               {error}
             </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-ios-surface2/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !prompt}
            className="px-6 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-xl text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-black/30 border-t-black rounded-full"></div>
                Generating...
              </>
            ) : (
              'Generate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
