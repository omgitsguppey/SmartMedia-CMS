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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900/90 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h2 className="text-lg font-bold text-white">Create with AI</h2>
          <button onClick={onClose} className="p-1 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Prompt</label>
            <textarea 
              className="w-full bg-black border border-zinc-800 rounded-xl p-4 text-white placeholder-zinc-600 focus:ring-2 focus:ring-blue-600 focus:border-transparent focus:outline-none resize-none h-32 text-base leading-relaxed"
              placeholder="A futuristic city with flying cars in cyberpunk style..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Ratio</label>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all whitespace-nowrap ${
                    aspectRatio === ratio 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {error && (
             <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
               {error}
             </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-zinc-950/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !prompt}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                Creating...
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