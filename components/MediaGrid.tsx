
import React from 'react';
import { MediaItem } from '../types';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  selectedId: string | null;
  onCancelUpload?: (item: MediaItem) => void;
  onRetryUpload?: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
}

export const MediaGridSkeleton = () => (
  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 md:gap-4 p-1 md:p-6 pb-32 md:pb-6">
    {Array.from({ length: 15 }).map((_, i) => (
      <div key={i} className="aspect-square bg-ios-surface2 rounded-lg md:rounded-xl animate-pulse border border-white/5" />
    ))}
  </div>
);

export const MediaGrid: React.FC<MediaGridProps> = ({ items, onSelect, selectedId, onCancelUpload, onRetryUpload, onDelete }) => {
  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px md:gap-4 md:p-6 pb-32 md:pb-6">
      {items.map((item) => (
        <MediaCard 
          key={item.id}
          item={item}
          isSelected={selectedId === item.id}
          onSelect={onSelect}
          onCancelUpload={onCancelUpload}
          onRetryUpload={onRetryUpload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};
