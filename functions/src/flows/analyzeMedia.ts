import { z } from "zod";
import { ai, flashModel } from "../genkit";
import { logger } from "firebase-functions";

// Output Schema corresponding to the strict requirements
export const AnalysisOutputSchema = z.object({
  tags: z.array(z.string()).describe("5-10 SEO-friendly keywords"),
  caption: z.string().describe("A visual description of the content"),
  moderation: z.object({
    verdict: z.enum(['SAFE', 'POSSIBLE_NSFW', 'NSFW']).describe("Safety conclusion"),
    reasons: z.array(z.string()).describe("List of reasons if unsafe"),
  }),
  extractedEntities: z.object({
    people: z.array(z.string()).optional().describe("Names of identified people or 'Unknown Person'"),
    location: z.string().optional().describe("Estimated location if visually identifiable"),
    text: z.string().optional().describe("OCR or Speech transcript"),
  }).optional()
});

export const analyzeMediaFlow = ai.defineFlow(
  {
    name: "analyzeMediaFlow",
    inputSchema: z.object({
      downloadURL: z.string(),
      mimeType: z.string().optional(),
      uid: z.string(),
      fileId: z.string(),
      knownPeople: z.array(z.string()).optional().describe("Context: Names of people known to this user"),
    }),
    outputSchema: AnalysisOutputSchema,
  },
  async (input) => {
    const { downloadURL, mimeType, uid, fileId, knownPeople } = input;

    logger.info("Starting Genkit Media Analysis", { uid, fileId, mimeType });

    const peopleContext = knownPeople && knownPeople.length > 0 
      ? `Check against known people: ${knownPeople.join(", ")}.` 
      : "";

    const promptText = `
      Analyze this media file. Return strict JSON.
      
      Tasks:
      1. Generate a descriptive caption.
      2. List 5-10 relevant tags.
      3. Identify people. ${peopleContext}
      4. Perform safety check (NSFW/Hate/Gore).
      5. Extract text/location if present.
    `;

    try {
      const result = await ai.generate({
        model: flashModel,
        prompt: [
          { text: promptText },
          { media: { url: downloadURL, contentType: mimeType } } 
        ],
        output: { schema: AnalysisOutputSchema },
        config: {
          temperature: 0.4, // Lower temperature for accuracy
        }
      });

      if (!result.output) {
        throw new Error("Gemini returned null output.");
      }

      logger.info("Genkit Analysis Complete", { uid, fileId, verdict: result.output.moderation.verdict });

      return result.output;

    } catch (error: any) {
      logger.error("Genkit Flow Error", { uid, fileId, error: error.message });
      throw new Error(`AI Analysis failed: ${error.message}`);
    }
  }
);
