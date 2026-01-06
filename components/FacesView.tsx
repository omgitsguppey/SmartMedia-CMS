import React, { useMemo, useState } from 'react';
import { MediaItem } from '../types';

interface FacesViewProps {
  items: MediaItem[];
  onRename: (oldName: string, newName: string) => void;
  onSelectPerson: (person: string) => void;
}

export const FacesView: React.FC<FacesViewProps> = ({ items, onRename, onSelectPerson }) => {
  const [editingPerson, setEditingPerson] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const faces = useMemo(() => {
    const peopleMap = new Map<string, { count: number, latestImage: string }>();

    items.forEach(item => {
      if (item.analysis?.peopleDetected) {
        item.analysis.peopleDetected.forEach(person => {
          const current = peopleMap.get(person);
          if (!current) {
            peopleMap.set(person, { count: 1, latestImage: item.url });
          } else {
            peopleMap.set(person, { ...current, count: current.count + 1 });
          }
        });
      }
    });

    return Array.from(peopleMap.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [items]);

  const handleStartEdit = (person: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPerson(person);
    setNewName(person);
  };

  const handleSaveRename = () => {
    if (editingPerson && newName.trim() && newName !== editingPerson) {
      onRename(editingPerson, newName.trim());
    }
    setEditingPerson(null);
  };

  if (faces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8 space-y-4">
        <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center">
            <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        </div>
        <p className="text-center">No faces detected yet.<br/><span className="text-xs opacity-70">Upload photos with people to see them here.</span></p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 md:p-6 pb-32 md:pb-6">
      {faces.map(([person, data]) => (
        <div 
          key={person} 
          onClick={() => onSelectPerson(person)}
          className="relative group cursor-pointer"
        >
          <div className="aspect-square rounded-full overflow-hidden border-2 border-zinc-800 group-hover:border-blue-500 transition-colors bg-zinc-900 relative">
             <img src={data.latestImage} className="w-full h-full object-cover" alt={person} />
             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
             
             {/* Edit Button */}
             <button 
                onClick={(e) => handleStartEdit(person, e)}
                className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-black/80 backdrop-blur rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity md:opacity-0"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
             </button>
          </div>
          <div className="mt-3 text-center px-2">
            <h3 className="text-sm font-semibold text-white truncate">{person}</h3>
            <p className="text-xs text-zinc-500">{data.count} {data.count === 1 ? 'item' : 'items'}</p>
          </div>
        </div>
      ))}

      {/* Rename Modal */}
      {editingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={(e) => e.stopPropagation()}>
           <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Rename Person</h3>
              <input 
                autoFocus
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none mb-6"
              />
              <div className="flex justify-end gap-3">
                 <button onClick={() => setEditingPerson(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
                 <button onClick={handleSaveRename} className="px-6 py-2 bg-blue-600 rounded-xl text-white font-semibold text-sm hover:bg-blue-500">Save</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
