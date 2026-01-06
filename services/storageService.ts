import { MediaItem } from '../types';

const DB_NAME = 'SmartMediaCMS_DB';
const STORE_NAME_LIBRARY = 'library';
const STORE_NAME_SETTINGS = 'settings';
const DB_VERSION = 1;

export const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME_LIBRARY)) {
        db.createObjectStore(STORE_NAME_LIBRARY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAME_SETTINGS)) {
        db.createObjectStore(STORE_NAME_SETTINGS, { keyPath: 'key' });
      }
    };
  });
};

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const saveMediaItem = async (item: MediaItem): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME_LIBRARY, 'readwrite');
  const store = tx.objectStore(STORE_NAME_LIBRARY);
  
  // Exclude the volatile URL, store the File object (which is supported in IDB)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { url, ...storageItem } = item;
  
  return new Promise<void>((resolve, reject) => {
    const req = store.put(storageItem);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const getLibrary = async (): Promise<MediaItem[]> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME_LIBRARY, 'readonly');
  const store = tx.objectStore(STORE_NAME_LIBRARY);
  
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = req.result as Omit<MediaItem, 'url'>[];
      // Recreate object URLs from the stored Files/Blobs
      const fullItems: MediaItem[] = items.map(item => ({
        ...item,
        url: URL.createObjectURL(item.file)
      }));
      // Sort by timestamp descending
      fullItems.sort((a, b) => b.timestamp - a.timestamp);
      resolve(fullItems);
    };
    req.onerror = () => reject(req.error);
  });
};

export const saveRejectedMatches = async (matches: string[]): Promise<void> => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME_SETTINGS, 'readwrite');
    const store = tx.objectStore(STORE_NAME_SETTINGS);
    
    store.put({ key: 'rejectedMatches', value: matches });
};

export const getRejectedMatches = async (): Promise<Set<string>> => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_NAME_SETTINGS);
    
    return new Promise((resolve) => {
        const req = store.get('rejectedMatches');
        req.onsuccess = () => {
            if (req.result && Array.isArray(req.result.value)) {
                resolve(new Set(req.result.value));
            } else {
                resolve(new Set());
            }
        };
        req.onerror = () => resolve(new Set());
    });
};

// Helper to convert Data URI to File for storage
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
