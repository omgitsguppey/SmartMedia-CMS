import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions";

// Initialize Admin SDK
// Note: Admin SDK uses the default database unless specified in specific calls
admin.initializeApp();

// Configure Global Options for all V2 Functions
setGlobalOptions({ 
  region: "us-central1",
  memory: "512MiB" 
});

/**
 * Lightweight Health Check.
 * Verifies Auth and Cloud Function reachability ONLY.
 * Does NOT access Firestore to prevent cold-start timeouts or permission errors.
 */
export const pipelinePing = onCall({ cors: true }, async (request) => {
  // 1. Verify Authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = request.auth.uid;
  const requestId = request.rawRequest.header('x-github-request-id') || 'internal';

  logger.info("Pipeline Ping Received", { requestId, uid });

  // 2. Return Static Success
  return {
    ok: true,
    region: "us-central1",
    authenticated: true,
    uid: uid,
    timestamp: new Date().toISOString(),
    status: "ready"
  };
});

// Re-export triggers and active callables
export { 
  onFileUpload,
  manageQuota,
  cleanupStuckProcessing,
  analyzeMediaCallable, 
  checkFaceMatch, 
  generateImage, 
  getDeepInsights
} from "./handlers";