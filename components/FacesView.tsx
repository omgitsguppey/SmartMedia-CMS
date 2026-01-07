
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
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 p-8 space-y-4">
        <div className="w-20 h-20 rounded-full bg-ios-surface2 flex items-center justify-center border border-white/5">
            <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        </div>
        <p className="text-center text-sm font-medium">No faces detected yet.</p>
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
          <div className="aspect-square rounded-full overflow-hidden border border-white/10 group-hover:border-ios-blue transition-colors bg-ios-surface2 relative shadow-lg">
             <img src={data.latestImage} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={person} />
             <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
             
             {/* Edit Button */}
             <button 
                onClick={(e) => handleStartEdit(person, e)}
                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 backdrop-blur rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity md:opacity-0"
             >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
             </button>
          </div>
          <div className="mt-3 text-center px-2">
            <h3 className="text-sm font-semibold text-white truncate">{person}</h3>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wide">{data.count} {data.count === 1 ? 'photo' : 'photos'}</p>
          </div>
        </div>
      ))}

      {/* Rename Modal */}
      {editingPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
           <div className="bg-ios-surface border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-bold text-white mb-4">Rename Person</h3>
              <input 
                autoFocus
                type="text" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-ios-surface2 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-ios-blue focus:border-transparent outline-none mb-6 placeholder-zinc-600"
              />
              <div className="flex justify-end gap-3">
                 <button onClick={() => setEditingPerson(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium transition-colors">Cancel</button>
                 <button onClick={handleSaveRename} className="px-6 py-2 bg-white text-black rounded-lg font-bold text-sm hover:bg-zinc-200 transition-colors shadow-lg">Save</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
