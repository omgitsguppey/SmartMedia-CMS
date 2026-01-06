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

export interface AnalysisResult {
  description: string;
  tags: string[];
  peopleDetected: string[];
  safetyLevel: SafetyLevel;
  safetyReason?: string;
  transcript?: string;
  suggestedAction?: string;
}

export interface MediaItem {
  id: string;
  file: File;
  url: string;
  type: MediaType;
  name: string;
  timestamp: number;
  analysis?: AnalysisResult;
  isAnalyzing: boolean;
}

export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";

export interface GenerationConfig {
  prompt: string;
  aspectRatio: AspectRatio;
}