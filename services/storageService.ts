
import { MediaItem, MediaType } from '../types';
import { db, storage } from '../firebase/client';
import { collection, doc, setDoc, getDocs, getDoc, query, orderBy, serverTimestamp, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, UploadTask, deleteObject, getDownloadURL } from 'firebase/storage';

const DB_ID = "senseosdata";

// --- Helpers ---
const guessMediaType = (mime: string): MediaType => {
  if (mime.startsWith('video/')) return MediaType.VIDEO;
  if (mime.startsWith('audio/')) return MediaType.AUDIO;
  return MediaType.IMAGE;
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
  const fileId = crypto.randomUUID();
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
    downloadURL: null
  };

  await setDoc(doc(db, firestorePath), placeholderData);

  // 2. Start Upload Task
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return { fileId, uploadTask, storagePath };
};

/**
 * Subscribes to the user's library in real-time.
 */
export const subscribeToLibrary = (userId: string, onUpdate: (items: MediaItem[]) => void, onError: (error: Error) => void) => {
  if (!userId) return () => {};
  
  const q = query(collection(db, `users/${userId}/files`), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const items: MediaItem[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const status = data.status;
      const analysis = data.analysis;

      items.push({
        id: data.fileId,
        url: data.downloadURL || '',
        type: guessMediaType(data.mimeType || ''),
        name: data.fileName,
        timestamp: data.createdAt?.toMillis() || Date.now(),
        status: status,
        progress: status === 'ready' ? 100 : (data.progress || 0),
        error: data.error,
        analysis: analysis,
        // If it's ready but has no analysis, we assume it's still being analyzed in the background
        isAnalyzing: status === 'ready' && !analysis,
        ownerId: data.ownerId,
        storagePath: data.storagePath,
        sizeBytes: data.sizeBytes
      });
    });
    onUpdate(items);
  }, onError);
};

/**
 * Deletes a media item from Storage first, then Firestore.
 */
export const deleteMediaItem = async (userId: string, item: MediaItem) => {
  // 1. Delete from Storage
  if (item.storagePath) {
    try {
      const storageRef = ref(storage, item.storagePath);
      await deleteObject(storageRef);
    } catch (e) {
      console.warn("Storage delete failed (file may already be gone)", e);
    }
  }
  
  // 2. Delete from Firestore
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
    status: 'ready',
    downloadURL: downloadURL,
    updatedAt: serverTimestamp()
  });
};

export const failUpload = async (userId: string, fileId: string, errorMsg: string) => {
  await updateMediaMetadata(userId, fileId, {
    status: 'failed',
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
