import React, { ChangeEvent } from 'react';
import { MediaType } from '../types';

interface UploaderProps {
  onUpload: (file: File, type: MediaType) => void;
}

export const Uploader: React.FC<UploaderProps> = ({ onUpload }) => {
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Convert FileList to Array to iterate
      const files = Array.from(e.target.files);
      
      files.forEach(file => {
        let type = MediaType.IMAGE;
        if (file.type.startsWith('video/')) type = MediaType.VIDEO;
        else if (file.type.startsWith('audio/')) type = MediaType.AUDIO;
        else if (!file.type.startsWith('image/')) {
          console.warn(`Skipping unsupported file: ${file.name}`);
          return;
        }
        onUpload(file, type);
      });

      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="relative group w-full">
      <input 
        type="file" 
        multiple
        onChange={handleFileChange} 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        accept="image/*,video/*,audio/*"
      />
      <button className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        <span>Upload Media</span>
      </button>
    </div>
  );
};