
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/client";
import { AnalysisResult, AspectRatio, MediaType, SafetyLevel } from "../types";

/**
 * Calls the server-side Genkit flow 'analyzeMedia'.
 */
export const analyzeMedia = async (
  file: File | undefined, 
  type: MediaType,
  knownPeople: string[] = [],
  url?: string
): Promise<AnalysisResult> => {
  if (!url) {
    throw new Error("Media URL is required for server-side analysis.");
  }

  try {
    const analyzeFunction = httpsCallable<
      { url: string; type: string; knownPeople: string[] },
      AnalysisResult
    >(functions, 'analyzeMedia');

    const result = await analyzeFunction({
      url,
      type,
      knownPeople
    });

    return result.data;
  } catch (error: any) {
    console.warn("Genkit Analysis failed:", error.message);
    throw error; // Propagate error so UI shows "Pending/Failed" instead of fake data
  }
};

/**
 * Calls the server-side Genkit flow 'checkFaceMatch'.
 */
export const checkForMatch = async (
  targetPersonName: string,
  referenceImageUrl: string,
  candidateImageUrl: string
): Promise<boolean> => {
  try {
    const checkMatchFunction = httpsCallable<
      { targetPersonName: string; referenceImageUrl: string; candidateImageUrl: string },
      { isMatch: boolean; confidence: string }
    >(functions, 'checkFaceMatch');

    const result = await checkMatchFunction({
      targetPersonName,
      referenceImageUrl,
      candidateImageUrl
    });

    return result.data.isMatch;
  } catch (e) {
    console.error("Server Match Check Failed", e);
    return false;
  }
};

/**
 * Calls the server-side Genkit flow 'generateImage'.
 */
export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string | null> => {
  try {
    const generateFunction = httpsCallable<
      { prompt: string; aspectRatio: string },
      { mediaUrl?: string; base64?: string }
    >(functions, 'generateImage');

    const result = await generateFunction({
      prompt,
      aspectRatio
    });

    if (result.data.mediaUrl) return result.data.mediaUrl;
    if (result.data.base64) return `data:image/png;base64,${result.data.base64}`;
    
    return null;
  } catch (error) {
    console.warn("Server Image Generation failed:", error);
    return null;
  }
};

/**
 * Calls the server-side Genkit flow 'getDeepInsights'.
 */
export const getDeepInsights = async (libraryMetadata: string): Promise<string> => {
  try {
    const insightsFunction = httpsCallable<
      { libraryMetadata: string },
      { insights: string }
    >(functions, 'getDeepInsights');

    const result = await insightsFunction({
      libraryMetadata
    });

    return result.data.insights || "No insights returned from server.";
  } catch (error) {
    console.warn("Server Thinking Mode Error:", error);
    throw error;
  }
};
