import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { analyzeMediaFlow } from "./flows/analyzeMedia";
import { ai, flashModel, proModel } from "./genkit";
import { z } from "zod";

const db = admin.firestore().getFirestore("senseosdata");

// --- Async Background Trigger (Processing Lifecycle) ---
// Triggers on creation or update to handle the 'pending' state
export const onFileUpload = onDocumentWritten(
  {
    document: "users/{uid}/files/{fileId}",
    database: "senseosdata",
    memory: "1GiB",
    timeoutSeconds: 300, 
    retry: true, 
  },
  async (event) => {
    // 1. Validate Event
    if (!event.data) return; // No data (e.g. delete)
    
    const after = event.data.after.data();
    
    // Handle Deletion (after is null) or non-pending states (Idempotency)
    // Only process if status is strictly 'pending'
    if (!after || after.status !== 'pending') {
      return;
    }

    const { uid, fileId } = event.params;
    const { downloadURL, mimeType } = after;

    // 2. Validate Data
    if (!downloadURL) {
      logger.error(`File ${fileId} missing downloadURL.`, { uid, fileId });
      await event.data.after.ref.update({ 
        status: 'failed', 
        error: { code: 'missing_url', message: 'Download URL is required', at: new Date().toISOString() },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    const requestId = event.id || 'unknown';
    logger.info(`Pipeline started for ${fileId}`, { uid, fileId, requestId, status: 'processing' });

    try {
      // 3. Set Processing State
      await event.data.after.ref.update({ 
        status: "processing",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Fetch context for personalization (Known People)
      let knownPeople: string[] = [];
      try {
        const filesRef = db.collection(`users/${uid}/files`);
        // Limit context to recent 50 files to avoid context window explosion
        const recentFilesSnapshot = await filesRef.orderBy('createdAt', 'desc').limit(50).get();
        const peopleSet = new Set<string>();
        recentFilesSnapshot.forEach(doc => {
           const analysis = doc.data().analysis;
           if (analysis?.peopleDetected) {
               analysis.peopleDetected.forEach((p: string) => peopleSet.add(p));
           }
        });
        knownPeople = Array.from(peopleSet);
      } catch (e) {
        logger.warn("Failed to fetch known people context", { error: e });
      }

      // 4. Call Genkit Flow
      const analysis = await analyzeMediaFlow({
        downloadURL,
        mimeType,
        uid,
        fileId,
        knownPeople
      });

      // 5. Success State
      await event.data.after.ref.update({
        status: "ready", // Mapped to 'complete' in frontend
        tags: analysis.tags,
        caption: analysis.caption,
        moderation: analysis.moderation,
        extractedEntities: analysis.extractedEntities || null,
        analysis: {
            description: analysis.caption,
            tags: analysis.tags,
            peopleDetected: analysis.extractedEntities?.people || [],
            safetyLevel: analysis.moderation.verdict,
            safetyReason: analysis.moderation.reasons.join(", "),
            transcript: analysis.extractedEntities?.text,
            suggestedAction: "Organized by SmartMedia AI",
            technicalMetadata: { estimatedLocation: analysis.extractedEntities?.location }
        },
        analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info(`Pipeline success for ${fileId}`, { uid, fileId, status: 'ready' });

    } catch (error: any) {
      // 6. Failure State
      logger.error(`Pipeline failed for ${fileId}`, { error: error.message, uid });
      await event.data.after.ref.update({
        status: "failed", // Mapped to 'error' in frontend
        error: { 
            code: 'analysis_failed', 
            message: error.message || "Unknown error", 
            at: new Date().toISOString() 
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
);

// --- Watchdog: Cleanup Stuck Processing ---
// Runs every 5 minutes to catch files that have been stuck in 'pending' or 'processing'
// for more than 5 minutes.
export const cleanupStuckProcessing = onSchedule({
  schedule: "every 5 minutes",
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (event) => {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  
  try {
     // Note: collectionGroup queries require an index on status + updatedAt.
     // If index is missing, this will fail in logs with a link to create it.
     // We query 'files' collection group across the 'senseosdata' database implicitly via `db` instance.
     const snapshot = await db.collectionGroup('files')
       .where('status', 'in', ['pending', 'processing'])
       .where('updatedAt', '<', admin.firestore.Timestamp.fromDate(cutoff))
       .get();
     
     if (snapshot.empty) {
        logger.info("Watchdog: No stuck files found.");
        return;
     }

     const batch = db.batch();
     snapshot.docs.forEach(doc => {
       logger.warn(`Watchdog: Marking stuck file ${doc.id} as failed.`);
       batch.update(doc.ref, {
         status: 'failed',
         error: { 
             code: 'timeout', 
             message: 'AI pipeline timeout. Please click Reanalyze.', 
             at: new Date().toISOString() 
         },
         updatedAt: admin.firestore.FieldValue.serverTimestamp()
       });
     });
     
     await batch.commit();
     logger.info(`Watchdog: Cleaned up ${snapshot.size} stuck files.`);
  } catch (e) {
     logger.error("Watchdog failed", e);
  }
});

// --- Quota Management Trigger ---
// Keeps usedBytes in sync with file creation/deletion
export const manageQuota = onDocumentWritten(
  {
    document: "users/{uid}/files/{fileId}",
    database: "senseosdata",
  },
  async (event) => {
    const { uid } = event.params;
    const userRef = db.collection("users").doc(uid);

    const before = event.data?.before.data();
    const after = event.data?.after.data();

    let sizeDelta = 0;

    // Case 1: Created (before is undefined/null, after exists)
    if (!before && after) {
      sizeDelta = after.sizeBytes || 0;
    }
    // Case 2: Deleted (before exists, after is undefined/null)
    else if (before && !after) {
      sizeDelta = -(before.sizeBytes || 0);
    }
    // Case 3: Updated (Both exist - check if size changed)
    else if (before && after) {
      const oldSize = before.sizeBytes || 0;
      const newSize = after.sizeBytes || 0;
      sizeDelta = newSize - oldSize;
    }

    if (sizeDelta !== 0) {
      try {
        await userRef.update({
          usedBytes: admin.firestore.FieldValue.increment(sizeDelta)
        });
        logger.info(`Updated quota for user ${uid}`, { delta: sizeDelta });
      } catch (error) {
        logger.error(`Failed to update quota for user ${uid}`, error);
      }
    }
  }
);

// --- Callable Proxies (On-Demand & Features) ---

/**
 * 1) analyzeMediaCallable: Re-runs analysis on an existing file document.
 * Input: { fileId: string }
 * Used by: Admin Dashboard ("Force Re-analysis")
 */
export const analyzeMediaCallable = onCall({ cors: true, memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in');
  const { fileId } = request.data;
  const uid = request.auth.uid;

  if (!fileId) throw new HttpsError('invalid-argument', 'fileId is required');

  const docRef = db.collection('users').doc(uid).collection('files').doc(fileId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    throw new HttpsError('not-found', 'File document not found');
  }

  const data = docSnap.data();
  if (!data?.downloadURL) {
    throw new HttpsError('failed-precondition', 'Document is missing downloadURL');
  }

  // Set processing state
  await docRef.update({ 
    status: 'processing', 
    updatedAt: admin.firestore.FieldValue.serverTimestamp() 
  });

  try {
    // Re-fetch context
    let knownPeople: string[] = [];
    try {
      const filesRef = db.collection(`users/${uid}/files`);
      const recentSnapshot = await filesRef.orderBy('createdAt', 'desc').limit(50).get();
      const peopleSet = new Set<string>();
      recentSnapshot.forEach(d => {
         d.data().analysis?.peopleDetected?.forEach((p: string) => peopleSet.add(p));
      });
      knownPeople = Array.from(peopleSet);
    } catch (e) {
      logger.warn('Context fetch failed in callable', e);
    }

    const analysis = await analyzeMediaFlow({
      downloadURL: data.downloadURL,
      mimeType: data.mimeType || 'application/octet-stream',
      uid,
      fileId,
      knownPeople
    });

    // Update with success
    await docRef.update({
      status: "ready",
      tags: analysis.tags,
      caption: analysis.caption,
      moderation: analysis.moderation,
      extractedEntities: analysis.extractedEntities || null,
      analysis: {
          description: analysis.caption,
          tags: analysis.tags,
          peopleDetected: analysis.extractedEntities?.people || [],
          safetyLevel: analysis.moderation.verdict,
          safetyReason: analysis.moderation.reasons.join(", "),
          transcript: analysis.extractedEntities?.text,
          suggestedAction: "Re-analyzed on demand",
          technicalMetadata: { estimatedLocation: analysis.extractedEntities?.location }
      },
      analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };

  } catch (error: any) {
    logger.error(`Callable Analysis failed for ${fileId}`, { error: error.message, uid });
    await docRef.update({
      status: "failed",
      error: { code: 'manual_analysis_failed', message: error.message, at: new Date().toISOString() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    throw new HttpsError('internal', `Analysis failed: ${error.message}`);
  }
});

/**
 * 2) checkFaceMatch: Face recognition logic.
 * Input: { targetPersonName, referenceImageUrl, candidateImageUrl }
 * Used by: FaceMatchModal
 */
export const checkFaceMatch = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in');
  const { targetPersonName, referenceImageUrl, candidateImageUrl } = request.data;
  
  // Use Pro model for higher reasoning capability on images
  const result = await ai.generate({
    model: proModel,
    prompt: [
      { text: `Do these images show the same person: ${targetPersonName}? Return JSON: { "isMatch": boolean }` },
      { media: { url: referenceImageUrl } },
      { media: { url: candidateImageUrl } }
    ],
    output: { schema: z.object({ isMatch: z.boolean() }) }
  });
  return result.output;
});

/**
 * 3) generateImage: Generates SVGs.
 * Input: { prompt, aspectRatio }
 * Used by: GenerationModal
 */
export const generateImage = onCall({ cors: true, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in');
  const { prompt, aspectRatio } = request.data;
  
  // Use Flash model for speed on SVG generation
  const result = await ai.generate({
    model: flashModel,
    prompt: `Generate SVG for: "${prompt}". Aspect: ${aspectRatio}. Return raw SVG.`,
  });
  
  const svgContent = result.text.replace(/```xml|```svg|```/g, '').trim();
  const base64 = btoa(unescape(encodeURIComponent(svgContent)));
  return { mediaUrl: `data:image/svg+xml;base64,${base64}` };
});

/**
 * 4) getDeepInsights: Analysis summary.
 * Input: { libraryMetadata }
 * Used by: App (Thinking Mode)
 */
export const getDeepInsights = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in');
  
  // Use Pro model for deep reasoning over metadata text
  const result = await ai.generate({
    model: proModel,
    prompt: `Analyze this library metadata and provide 3 organization insights: ${request.data.libraryMetadata}`
  });
  return { insights: result.text };
});