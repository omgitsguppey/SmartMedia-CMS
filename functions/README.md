# SmartMedia Backend

## Deploying Functions
1.  **Set Secrets**:
    ```bash
    firebase functions:secrets:set GOOGLE_GENAI_API_KEY
    ```
2.  **Deploy**:
    ```bash
    firebase deploy --only functions
    ```

## Verification
Call `pipelinePing` from the app console or a test script to verify:
- **Region**: us-central1
- **Database**: senseosdata (Non-default ID)
- **Auth**: Required

## Database Configuration
The backend explicitly targets the `senseosdata` Firestore database. Ensure this database exists in the Firebase Console before deploying.

## Callables

### `analyzeMediaCallable`
- **Input**: `{ fileId: string }`
- **Description**: Triggers a re-analysis of an existing file. Updates status to `processing` then `ready` or `failed`.

### `generateTagsCallable`
- **Input**: `{ text: string, mimeType?: string }`
- **Description**: Returns specific tags for the given text.

### `moderateTextCallable`
- **Input**: `{ text: string }`
- **Description**: Returns moderation verdict (SAFE/NSFW) for the text.

### `generateImage`
- **Input**: `{ prompt: string, aspectRatio: string }`
- **Description**: Generates an SVG image based on the prompt.

### `checkFaceMatch`
- **Input**: `{ targetPersonName, referenceImageUrl, candidateImageUrl }`
- **Description**: Checks if two images contain the same person.
