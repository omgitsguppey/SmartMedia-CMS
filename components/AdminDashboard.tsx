import React, { useEffect, useState, useMemo } from 'react';
import { useLogs } from '../contexts/LogContext';
import { subscribeToAllFiles, subscribeToAllUsers, updateUserQuota, setModerationStatus } from '../services/storageService';
import { reanalyzeMedia } from '../services/geminiService';
import { MediaItem, SafetyLevel, UserProfile } from '../types';
import { Inspector } from './Inspector';

interface AdminDashboardProps {
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const { addLog } = useLogs();
  const [viewMode, setViewMode] = useState<'FILES' | 'USERS'>('FILES');
  
  // Files State
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Users State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Filtering
  const [userIdFilter, setUserIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  
  // Selection
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [isActionProcessing, setIsActionProcessing] = useState(false);

  // Edit Quota State
  const [editingQuotaUser, setEditingQuotaUser] = useState<string | null>(null);
  const [newQuotaGB, setNewQuotaGB] = useState<string>('');

  // 1. Subscribe to Files
  useEffect(() => {
    if (viewMode === 'FILES') {
        setLoadingFiles(true);
        addLog("[Admin] Subscribing to all files...");
        const unsubscribe = subscribeToAllFiles(
          (data) => {
            setItems(data);
            setLoadingFiles(false);
          },
          (err) => {
            setFileError(err.message);
            setLoadingFiles(false);
            addLog("Admin Sync Error", "error", err);
          }
        );
        return () => unsubscribe();
    }
  }, [viewMode, addLog]);

  // 2. Subscribe to Users
  useEffect(() => {
    if (viewMode === 'USERS') {
        setLoadingUsers(true);
        addLog("[Admin] Subscribing to all users...");
        const unsubscribe = subscribeToAllUsers(
            (data) => {
                setUsers(data);
                setLoadingUsers(false);
            },
            (err) => {
                addLog("User Sync Error", "error", err);
                setLoadingUsers(false);
            }
        );
        return () => unsubscribe();
    }
  }, [viewMode, addLog]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchUser = userIdFilter ? item.ownerId?.includes(userIdFilter) : true;
      const matchStatus = statusFilter === 'ALL' ? true : item.status === statusFilter;
      return matchUser && matchStatus;
    });
  }, [items, userIdFilter, statusFilter]);

  const handleUpdateQuota = async (userId: string) => {
      const gb = parseFloat(newQuotaGB);
      if (isNaN(gb) || gb < 0) return;
      
      const bytes = Math.floor(gb * 1024 * 1024 * 1024);
      await updateUserQuota(userId, bytes);
      setEditingQuotaUser(null);
      setNewQuotaGB('');
      addLog(`Updated quota for ${userId} to ${gb}GB`);
  };

  const handleApprove = async () => {
      if (!selectedItem || !selectedItem.ownerId) return;
      setIsActionProcessing(true);
      try {
          await setModerationStatus(selectedItem.ownerId, selectedItem.id, 'approved', 'shared');
          addLog(`Approved item ${selectedItem.id} (Visibility: Shared)`, "success");
          // Selection updates automatically via subscription
      } catch (e: any) {
          addLog(`Failed to approve: ${e.message}`, "error");
      } finally {
          setIsActionProcessing(false);
      }
  };

  const handleReject = async () => {
      if (!selectedItem || !selectedItem.ownerId) return;
      setIsActionProcessing(true);
      try {
          await setModerationStatus(selectedItem.ownerId, selectedItem.id, 'rejected', 'blocked');
          addLog(`Rejected item ${selectedItem.id} (Visibility: Blocked)`, "warn");
      } catch (e: any) {
          addLog(`Failed to reject: ${e.message}`, "error");
      } finally {
          setIsActionProcessing(false);
      }
  };

  const handleReanalyze = async () => {
      if (!selectedItem) return;
      setIsActionProcessing(true);
      try {
          await reanalyzeMedia(selectedItem.id);
          addLog(`Triggered re-analysis for ${selectedItem.id}`, "info");
      } catch (e: any) {
          addLog(`Re-analysis failed: ${e.message}`, "error");
      } finally {
          setIsActionProcessing(false);
      }
  };

  const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (fileError && viewMode === 'FILES') {
     return (
         <div className="p-8 text-center">
             <div className="text-ios-danger font-bold mb-2">Access Denied or Error</div>
             <div className="text-zinc-500 text-sm">{fileError}</div>
         </div>
     )
  }

  return (
    <div className="flex h-full bg-black relative">
       {/* Main Content */}
       <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-zinc-900/50">
             <div className="flex items-center gap-4">
                 <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-ios-blue text-white text-[10px] font-bold uppercase tracking-wider">Admin</span>
                    Dashboard
                 </h2>
                 <div className="flex bg-black/50 p-1 rounded-lg border border-white/5">
                     <button 
                        onClick={() => setViewMode('FILES')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${viewMode === 'FILES' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
                     >
                        Files
                     </button>
                     <button 
                        onClick={() => setViewMode('USERS')}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${viewMode === 'USERS' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}
                     >
                        Users
                     </button>
                 </div>
             </div>
             
             <div className="flex items-center gap-3">
                {viewMode === 'FILES' && (
                    <>
                        <input 
                        type="text" 
                        placeholder="Filter User ID" 
                        className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
                        value={userIdFilter}
                        onChange={(e) => setUserIdFilter(e.target.value)}
                        />
                        <select 
                        className="bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        >
                        <option value="ALL">All Status</option>
                        <option value="processing">Processing</option>
                        <option value="complete">Complete</option>
                        <option value="error">Error</option>
                        <option value="uploading">Uploading</option>
                        </select>
                    </>
                )}
                <div className="h-4 w-px bg-white/10 mx-1"></div>
                <button onClick={onClose} className="text-xs font-bold text-zinc-500 hover:text-white">Exit</button>
             </div>
          </div>

          {/* VIEW: FILES */}
          {viewMode === 'FILES' && (
              <>
                <div className="grid grid-cols-[60px_1fr_100px_120px_100px_1fr] gap-4 px-6 py-3 border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    <div>Media</div>
                    <div>File Info</div>
                    <div>Admin Status</div>
                    <div>User</div>
                    <div>Safety</div>
                    <div>Analysis</div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar">
                    {loadingFiles ? (
                         <div className="p-8 text-center text-zinc-500 text-sm animate-pulse">Loading global library...</div>
                    ) : filteredItems.map(item => (
                        <div 
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={`grid grid-cols-[60px_1fr_100px_120px_100px_1fr] gap-4 px-6 py-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${selectedItem?.id === item.id ? 'bg-white/10' : ''}`}
                        >
                            {/* Thumb */}
                            <div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden relative">
                                {item.type === 'IMAGE' ? (
                                    <img src={item.url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-[8px] font-bold">{item.type}</div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-white truncate" title={item.name}>{item.name}</div>
                                <div className="text-xs text-zinc-500 font-mono mt-0.5 truncate">{item.id.substring(0,8)}...</div>
                            </div>

                            {/* Status */}
                            <div className="flex items-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    item.adminStatus === 'approved' ? 'bg-ios-success/10 text-ios-success' :
                                    item.adminStatus === 'rejected' ? 'bg-ios-danger/10 text-ios-danger' :
                                    'bg-white/10 text-zinc-400'
                                }`}>
                                    {item.adminStatus}
                                </span>
                            </div>

                            {/* User */}
                            <div className="flex items-center">
                                <span className="text-xs text-zinc-400 font-mono truncate max-w-[100px]" title={item.ownerId}>
                                    {item.ownerId?.substring(0, 6)}...
                                </span>
                            </div>

                            {/* Safety */}
                            <div className="flex items-center">
                                {item.analysis?.safetyLevel && (
                                    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${
                                        item.analysis.safetyLevel === SafetyLevel.SAFE ? 'text-zinc-400' :
                                        item.analysis.safetyLevel === SafetyLevel.NSFW ? 'text-ios-danger' : 'text-ios-warning'
                                    }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${
                                            item.analysis.safetyLevel === SafetyLevel.SAFE ? 'bg-zinc-600' :
                                            item.analysis.safetyLevel === SafetyLevel.NSFW ? 'bg-ios-danger' : 'bg-ios-warning'
                                        }`}></div>
                                        {item.analysis.safetyLevel}
                                    </span>
                                )}
                            </div>

                            {/* Analysis Preview */}
                            <div className="min-w-0">
                                <p className="text-xs text-zinc-400 truncate">{item.analysis?.description || 'No description'}</p>
                                <div className="flex gap-1 mt-1 overflow-hidden">
                                    {item.analysis?.tags?.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[9px] text-zinc-600 bg-white/5 px-1 rounded">#{tag}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {!loadingFiles && filteredItems.length === 0 && (
                        <div className="p-12 text-center text-zinc-500 text-sm">No items found matching filters.</div>
                    )}
                </div>
              </>
          )}

          {/* VIEW: USERS */}
          {viewMode === 'USERS' && (
               <>
                 <div className="grid grid-cols-[200px_100px_1fr_120px] gap-4 px-6 py-3 border-b border-white/5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    <div>User</div>
                    <div>Role</div>
                    <div>Storage Quota</div>
                    <div>Actions</div>
                 </div>

                 <div className="flex-1 overflow-y-auto no-scrollbar">
                    {loadingUsers ? (
                         <div className="p-8 text-center text-zinc-500 text-sm animate-pulse">Loading users...</div>
                    ) : users.map(user => {
                        const usagePct = user.quotaBytes > 0 ? (user.usedBytes / user.quotaBytes) * 100 : 0;
                        const isOver = usagePct > 100;
                        
                        return (
                            <div key={user.uid} className="grid grid-cols-[200px_100px_1fr_120px] gap-4 px-6 py-4 border-b border-white/5 items-center">
                                {/* User Info */}
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-white truncate" title={user.email}>{user.email}</div>
                                    <div className="text-[10px] text-zinc-500 font-mono truncate">{user.uid}</div>
                                </div>

                                {/* Role */}
                                <div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-zinc-400'
                                    }`}>
                                        {user.role}
                                    </span>
                                </div>

                                {/* Quota */}
                                <div className="w-full pr-8">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className={`font-mono ${isOver ? 'text-ios-danger' : 'text-zinc-300'}`}>
                                            {formatBytes(user.usedBytes)} / {formatBytes(user.quotaBytes)}
                                        </span>
                                        <span className="text-zinc-500">{usagePct.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-500 ${isOver ? 'bg-ios-danger' : 'bg-ios-blue'}`} 
                                            style={{ width: `${Math.min(usagePct, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div>
                                    {editingQuotaUser === user.uid ? (
                                        <div className="flex items-center gap-2">
                                            <input 
                                                autoFocus
                                                type="number"
                                                className="w-16 bg-black border border-white/20 rounded px-1 py-1 text-xs text-white"
                                                placeholder="GB"
                                                value={newQuotaGB}
                                                onChange={(e) => setNewQuotaGB(e.target.value)}
                                            />
                                            <button onClick={() => handleUpdateQuota(user.uid)} className="text-ios-success text-xs font-bold">✓</button>
                                            <button onClick={() => setEditingQuotaUser(null)} className="text-zinc-500 text-xs">✕</button>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => { setEditingQuotaUser(user.uid); setNewQuotaGB((user.quotaBytes / (1024*1024*1024)).toFixed(0)); }}
                                            className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded text-xs text-zinc-300 transition-colors"
                                        >
                                            Edit Quota
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                 </div>
               </>
          )}

       </div>

       {/* Inspector Panel with Moderation Actions */}
       {selectedItem && viewMode === 'FILES' && (
          <div className="w-96 border-l border-white/10 bg-ios-surface h-full flex flex-col">
             <div className="flex-1 overflow-y-auto no-scrollbar">
                <Inspector 
                    item={selectedItem} 
                    onClose={() => setSelectedItem(null)} 
                    // No onUpdate, this is readonly inspector for metadata
                />
             </div>
             
             {/* Moderation Controls */}
             <div className="p-6 border-t border-white/10 bg-zinc-900/50 space-y-4">
                 <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Moderation Actions</h3>
                 
                 <div className="grid grid-cols-2 gap-3">
                     <button 
                         onClick={handleApprove}
                         disabled={isActionProcessing}
                         className="py-3 bg-ios-success/10 border border-ios-success/20 hover:bg-ios-success hover:text-white text-ios-success rounded-xl font-bold text-xs transition-colors flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                     >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                         Approve & Share
                     </button>
                     <button 
                         onClick={handleReject}
                         disabled={isActionProcessing}
                         className="py-3 bg-ios-danger/10 border border-ios-danger/20 hover:bg-ios-danger hover:text-white text-ios-danger rounded-xl font-bold text-xs transition-colors flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                     >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                         Reject & Block
                     </button>
                 </div>

                 <button 
                     onClick={handleReanalyze}
                     disabled={isActionProcessing}
                     className="w-full py-3 bg-ios-surface2 border border-white/10 hover:bg-white/10 text-zinc-300 rounded-xl font-medium text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                     Force Re-Analysis
                 </button>

                 <div className="pt-2 text-[10px] text-zinc-600 font-mono text-center">
                     Current Visibility: <span className="text-zinc-400 uppercase">{selectedItem.visibility}</span>
                 </div>
             </div>
          </div>
       )}
    </div>
  );
};