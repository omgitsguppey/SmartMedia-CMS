
export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
}

export enum SafetyLevel {
  SAFE = 'SAFE',
  POSSIBLE_NSFW = 'POSSIBLE_NSFW',
  NSFW = 'NSFW',
  UNKNOWN = 'UNKNOWN',
}

export type AdminStatus = 'pending' | 'approved' | 'rejected';
export type Visibility = 'private' | 'shared' | 'blocked';

export interface AnalysisResult {
  description: string;
  tags: string[];
  peopleDetected: string[];
  safetyLevel: SafetyLevel;
  safetyReason?: string;
  transcript?: string;
  suggestedAction?: string;
  // Feedback Signal
  isUserEdited?: boolean;
}

// Updated lifecycle states
// 'ready' and 'failed' are backend terms mapped to 'complete' and 'error' in frontend
export type UploadStatus = 'uploading' | 'pending' | 'processing' | 'complete' | 'error';

export interface MediaItem {
  id: string;
  file?: File;
  url: string;
  type: MediaType;
  name: string;
  timestamp: number;
  analysis?: AnalysisResult;
  isAnalyzing: boolean; // Computed property
  
  // Storage & Upload Metadata
  ownerId?: string;
  storagePath?: string;
  status?: UploadStatus;
  progress?: number; // 0 to 100
  error?: string;
  mimeType?: string;
  sizeBytes?: number;

  // Moderation & Visibility
  adminStatus: AdminStatus;
  visibility: Visibility;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'user' | 'admin';
  quotaBytes: number;
  usedBytes: number;
  createdAt?: any;
  lastLogin?: any;
}

export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";

export interface GenerationConfig {
  prompt: string;
  aspectRatio: AspectRatio;
}