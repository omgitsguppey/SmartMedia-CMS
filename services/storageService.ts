import { MediaItem, MediaType, UploadStatus, UserProfile, AdminStatus, Visibility } from '../types';
import { db, storage } from '../firebase/client';
import { collection, doc, setDoc, getDocs, getDoc, query, orderBy, serverTimestamp, updateDoc, onSnapshot, deleteDoc, collectionGroup } from 'firebase/firestore';
import { ref, uploadBytesResumable, UploadTask, deleteObject, getDownloadURL } from 'firebase/storage';
import { User } from 'firebase/auth';

// --- Helpers ---
const guessMediaType = (mime: string): MediaType => {
  if (mime.startsWith('video/')) return MediaType.VIDEO;
  if (mime.startsWith('audio/')) return MediaType.AUDIO;
  return MediaType.IMAGE;
};

// --- User Profile Management ---

/**
 * Ensures the user profile document exists in Firestore.
 * Creates it with default fields if missing.
 */
export const ensureUserProfile = async (user: User) => {
  if (!user) return;
  
  const userRef = doc(db, 'users', user.uid);
  
  try {
    const snapshot = await getDoc(userRef);
    
    if (!snapshot.exists()) {
      // Create new profile with Default Quota (100MB)
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL,
        role: 'user', 
        quotaBytes: 104857600, // 100 MB
        usedBytes: 0,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        preferences: {
           theme: 'dark'
        }
      });
      console.log(`[UserProfile] Created new profile for ${user.uid}`);
    } else {
      // Update last login
      await updateDoc(userRef, { 
        lastLogin: serverTimestamp(),
        email: user.email, 
        photoURL: user.photoURL, 
        displayName: user.displayName || snapshot.data().displayName
      }).catch(err => console.warn("Failed to update lastLogin", err));
    }
  } catch (error) {
    console.error("[UserProfile] Failed to ensure user profile:", error);
  }
};

/**
 * Checks if the user has enough quota for the file.
 * Returns true if allowed, false if exceeded.
 */
export const checkQuota = async (userId: string, fileSize: number): Promise<boolean> => {
    try {
        const userRef = doc(db, 'users', userId);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
            const data = snapshot.data() as UserProfile;
            const remaining = data.quotaBytes - data.usedBytes;
            return remaining >= fileSize;
        }
        return true; // Fail open if no profile found (rare)
    } catch (e) {
        console.error("Quota check failed", e);
        return false; // Fail safe on error
    }
};

// --- Core Operations ---

/**
 * Prepares the upload by creating a placeholder doc and starting the resumable upload.
 */
export const initializeUpload = async (
  userId: string, 
  file: File
): Promise<{ 
  fileId: string; 
  uploadTask: UploadTask; 
  storagePath: string; 
}> => {
  // Client-side quota check
  const isWithinQuota = await checkQuota(userId, file.size);
  if (!isWithinQuota) {
      throw new Error(`Storage quota exceeded. File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
  }

  const fileId = crypto.randomUUID();
  // Ensure path adheres to: users/{uid}/**
  const storagePath = `users/${userId}/originals/${fileId}-${file.name}`;
  const firestorePath = `users/${userId}/files/${fileId}`;

  // 1. Create Placeholder Doc (Lightweight)
  const placeholderData = {
    ownerId: userId,
    fileId: fileId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storagePath: storagePath,
    createdAt: serverTimestamp(),
    status: 'uploading',
    progress: 0,
    downloadURL: null,
    // Moderation Defaults
    adminStatus: 'pending',
    visibility: 'private'
  };

  await setDoc(doc(db, firestorePath), placeholderData);

  // 2. Start Upload Task
  const storageRef = ref(storage, storagePath);
  const metadata = { contentType: file.type };
  const uploadTask = uploadBytesResumable(storageRef, file, metadata);

  return { fileId, uploadTask, storagePath };
};

/**
 * Subscribes to the user's library in real-time.
 */
export const subscribeToLibrary = (userId: string, onUpdate: (items: MediaItem[]) => void, onError: (error: any) => void) => {
  if (!userId) return () => {};
  
  const q = query(collection(db, `users/${userId}/files`), orderBy("createdAt", "desc"));
  
  return onSnapshot(q, (snapshot) => {
    const items = mapSnapshotToMediaItems(snapshot);
    onUpdate(items);
  }, (err) => {
    console.error("[Library Sync] Real Firestore Error:", err);
    onError(err);
  });
};

/**
 * ADMIN ONLY: Subscribes to ALL files across the system using Collection Group Query.
 */
export const subscribeToAllFiles = (onUpdate: (items: MediaItem[]) => void, onError: (error: any) => void) => {
  // Collection Group Query 'files'
  // Requires index on 'createdAt' DESC for 'files' collection group (usually auto-created or link provided in console)
  const q = query(collectionGroup(db, 'files'), orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const items = mapSnapshotToMediaItems(snapshot);
    onUpdate(items);
  }, (err) => {
    console.error("[Admin Sync] Error:", err);
    onError(err);
  });
};

/**
 * ADMIN ONLY: Subscribes to ALL Users.
 */
export const subscribeToAllUsers = (onUpdate: (users: UserProfile[]) => void, onError: (error: any) => void) => {
  const q = query(collection(db, 'users'), orderBy("lastLogin", "desc"));
  return onSnapshot(q, (snapshot) => {
     const users: UserProfile[] = [];
     snapshot.forEach(doc => {
         users.push(doc.data() as UserProfile);
     });
     onUpdate(users);
  }, onError);
};

export const updateUserQuota = async (targetUserId: string, newQuotaBytes: number) => {
    const ref = doc(db, 'users', targetUserId);
    await updateDoc(ref, { quotaBytes: newQuotaBytes });
};

export const setModerationStatus = async (
    targetUserId: string, 
    fileId: string, 
    status: AdminStatus,
    visibility: Visibility
) => {
    const ref = doc(db, `users/${targetUserId}/files/${fileId}`);
    await updateDoc(ref, { 
        adminStatus: status,
        visibility: visibility,
        updatedAt: serverTimestamp()
    });
};

const mapSnapshotToMediaItems = (snapshot: any): MediaItem[] => {
    if (snapshot.empty) return [];
    
    const items: MediaItem[] = [];
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      let status = data.status as string;

      // Normalize Backend Status -> Frontend Status
      if (status === 'ready') status = 'complete';
      if (status === 'failed') status = 'error';
      
      const safeStatus = status as UploadStatus;
      const analysis = data.analysis;

      items.push({
        id: data.fileId,
        url: data.downloadURL || '',
        type: guessMediaType(data.mimeType || ''),
        name: data.fileName,
        timestamp: data.createdAt?.toMillis() || Date.now(),
        status: safeStatus,
        progress: safeStatus === 'complete' ? 100 : (data.progress || 0),
        error: data.error,
        analysis: analysis,
        isAnalyzing: safeStatus === 'pending' || safeStatus === 'processing',
        ownerId: data.ownerId,
        storagePath: data.storagePath,
        sizeBytes: data.sizeBytes,
        adminStatus: data.adminStatus || 'pending',
        visibility: data.visibility || 'private'
      });
    });
    return items;
}

export const deleteMediaItem = async (userId: string, item: MediaItem) => {
  if (item.storagePath) {
    try {
      const storageRef = ref(storage, item.storagePath);
      await deleteObject(storageRef);
    } catch (e) {
      console.warn("Storage delete failed", e);
    }
  }
  
  if (item.id) {
    await deleteDoc(doc(db, `users/${userId}/files/${item.id}`));
  }
};

export const updateMediaMetadata = async (userId: string, fileId: string, updates: Partial<MediaItem> | any) => {
  const docRef = doc(db, `users/${userId}/files/${fileId}`);
  await updateDoc(docRef, updates);
};

export const finalizeUpload = async (userId: string, fileId: string, downloadURL: string) => {
  await updateMediaMetadata(userId, fileId, {
    status: 'pending',
    downloadURL: downloadURL,
    updatedAt: serverTimestamp()
  });
};

export const failUpload = async (userId: string, fileId: string, errorMsg: string) => {
  await updateMediaMetadata(userId, fileId, {
    status: 'error',
    error: errorMsg,
    updatedAt: serverTimestamp()
  });
};

export const saveRejectedMatches = async (userId: string, matches: string[]): Promise<void> => {
  try {
    await setDoc(doc(db, `users/${userId}/settings/preferences`), { rejectedMatches: matches }, { merge: true });
  } catch (e) {
    console.error("Failed to save preferences:", e);
  }
};

export const getRejectedMatches = async (userId: string): Promise<Set<string>> => {
  try {
    const docRef = doc(db, `users/${userId}/settings/preferences`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().rejectedMatches) {
      return new Set(docSnap.data().rejectedMatches);
    }
  } catch(e) { 
    console.warn("Failed to fetch preferences:", e); 
  }
  return new Set();
};

export const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
};

export const saveGeneratedItem = async (userId: string, item: MediaItem): Promise<void> => {
    if (!item.file) return;
    const { fileId, uploadTask } = await initializeUpload(userId, item.file);
    
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
            null, 
            (error) => {
                failUpload(userId, fileId, error.message);
                reject(error);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await finalizeUpload(userId, fileId, downloadURL);
                if (item.analysis) {
                    await updateMediaMetadata(userId, fileId, { analysis: item.analysis });
                }
                resolve();
            }
        );
    });
};