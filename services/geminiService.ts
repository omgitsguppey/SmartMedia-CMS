import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/client";
import { AspectRatio } from "../types";

/**
 * Pings the backend to verify connectivity, auth, and database access.
 */
export const pingBackend = async (): Promise<any> => {
  try {
    const pingFunction = httpsCallable<void, any>(functions, 'pipelinePing');
    const result = await pingFunction();
    return result.data;
  } catch (error: any) {
    console.error("Backend Ping Failed:", error);
    throw error;
  }
};

/**
 * Calls the server-side 'analyzeMediaCallable' function to force a re-analysis.
 */
export const reanalyzeMedia = async (fileId: string): Promise<boolean> => {
    try {
        const fn = httpsCallable<{ fileId: string }, { success: boolean }>(functions, 'analyzeMediaCallable');
        const result = await fn({ fileId });
        return result.data.success;
    } catch (error) {
        console.error("Re-analysis failed:", error);
        throw error;
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