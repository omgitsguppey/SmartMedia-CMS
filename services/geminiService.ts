import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AspectRatio, MediaType, SafetyLevel } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

// Helper to get base64 from a Blob URL or Remote URL
export const urlToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error("Failed to convert URL to base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to fetch/convert URL", e);
    throw e;
  }
};

export const analyzeMedia = async (file: File | undefined, type: MediaType, knownPeople: string[] = [], url?: string): Promise<AnalysisResult> => {
  let base64Data = "";
  let mimeType = "";

  if (file) {
    base64Data = await fileToBase64(file);
    mimeType = file.type;
  } else if (url) {
    base64Data = await urlToBase64(url);
    // Guess mime type from type or extension if possible, or default
    if (type === MediaType.IMAGE) mimeType = 'image/jpeg';
    else if (type === MediaType.VIDEO) mimeType = 'video/mp4';
    else mimeType = 'audio/mp3';
  } else {
    throw new Error("No file or URL provided for analysis");
  }

  let model = 'gemini-3-pro-preview';
  let prompt = "";
  
  const knownPeopleContext = knownPeople.length > 0 
    ? `\nContext - Known People in Library: ${knownPeople.join(', ')}. If you recognize any of these people based on general appearance or if the image clearly contains them, prefer using these names.` 
    : "";

  if (type === MediaType.IMAGE) {
    prompt = `Analyze this image. ${knownPeopleContext}
    1. Describe the visual content in detail.
    2. List 5-10 relevant tags for categorization.
    3. Identify if there are specific famous people, 'Known People' from context, or just generic 'person'/'people'.
    4. Assess safety: Is this Safe, Possible NSFW, or NSFW? If it is NSFW or Possible NSFW, provide a short specific reason why (e.g. "Contains nudity", "Graphic violence").
    5. Suggest an improvement action (e.g., 'Crop', 'Color Correct').
    Return JSON.`;
  } else if (type === MediaType.VIDEO) {
    prompt = `Analyze this video. ${knownPeopleContext}
    1. Summarize the key events.
    2. List relevant tags.
    3. Identify people/faces if clear.
    4. Assess safety level. If it is NSFW or Possible NSFW, provide a short specific reason why.
    Return JSON.`;
  } else if (type === MediaType.AUDIO) {
    model = 'gemini-3-flash-preview'; // Flash is better/faster for pure audio transcription
    prompt = `Listen to this audio.
    1. Provide a full transcription.
    2. List tags based on topics discussed.
    3. Assess safety based on language. If it is NSFW or Possible NSFW, provide a short specific reason why.
    Return JSON.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            peopleDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
            safetyLevel: { type: Type.STRING, enum: [SafetyLevel.SAFE, SafetyLevel.POSSIBLE_NSFW, SafetyLevel.NSFW] },
            safetyReason: { type: Type.STRING },
            transcript: { type: Type.STRING },
            suggestedAction: { type: Type.STRING }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    // Parse JSON
    const result = JSON.parse(text);
    return {
      description: result.description || "No description available",
      tags: result.tags || [],
      peopleDetected: result.peopleDetected || [],
      safetyLevel: (result.safetyLevel as SafetyLevel) || SafetyLevel.UNKNOWN,
      safetyReason: result.safetyReason,
      transcript: result.transcript,
      suggestedAction: result.suggestedAction
    };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      description: "Analysis failed.",
      tags: [],
      peopleDetected: [],
      safetyLevel: SafetyLevel.UNKNOWN
    };
  }
};

export const checkForMatch = async (
  targetPersonName: string,
  referenceImageUrl: string,
  candidateImageUrl: string
): Promise<boolean> => {
  try {
    const refBase64 = await urlToBase64(referenceImageUrl);
    const candBase64 = await urlToBase64(candidateImageUrl);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Use Flash for speed in batch checks
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: refBase64 } },
          { inlineData: { mimeType: 'image/jpeg', data: candBase64 } },
          { text: `Compare these two images. Image 1 (first image) contains a person identified as "${targetPersonName}". Does this SAME person appear in Image 2 (second image)? Focus on facial features and identity. Return JSON.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isMatch: { type: Type.BOOLEAN },
            confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    // Only return true for high confidence or strict match
    return result.isMatch === true;
  } catch (e) {
    console.error("Match check failed", e);
    return false;
  }
};

export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1K"
        }
      }
    });

    // Check parts for inlineData
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

export const getDeepInsights = async (libraryMetadata: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Here is a JSON representation of a media library. Analyze the patterns, identifying common themes, potential projects these assets could belong to, and suggest an organizational folder structure.
      
      Library Data:
      ${libraryMetadata}`,
      config: {
        thinkingConfig: {
          thinkingBudget: 32768 // Max thinking budget for deep reasoning
        }
      }
    });

    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Thinking Mode Error:", error);
    return "Failed to generate insights.";
  }
};