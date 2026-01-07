import { genkit } from 'genkit';
import { googleAI, gemini15Flash, gemini15Pro } from '@genkit-ai/googleai';
import { logger } from 'firebase-functions';

/**
 * Initialize Genkit with the Google AI plugin.
 * This automatically loads the API key from the `GOOGLE_GENAI_API_KEY` environment variable.
 * No manual API key handling is required in the code.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: gemini15Flash, // Default model
});

// Export specific models for explicit usage in flows
export const flashModel = gemini15Flash;
export const proModel = gemini15Pro;

logger.info("Genkit initialized with Google AI plugin (Gemini 1.5 Series)");
