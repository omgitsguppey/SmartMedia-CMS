
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyCC8ksmQiErzESmcqXLDpthnRgHSDy-aDQ",
  authDomain: "gen-lang-client-0258908409.firebaseapp.com",
  databaseURL: "https://gen-lang-client-0258908409-default-rtdb.firebaseio.com",
  projectId: "gen-lang-client-0258908409",
  storageBucket: "gen-lang-client-0258908409.firebasestorage.app",
  messagingSenderId: "45155466016",
  appId: "1:45155466016:web:0b0842186613991f0bf545",
  measurementId: "G-HZWYC9Q3TH"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Connect to the specific Firestore database 'senseosdata'
// This syntax is correct for Modular SDK to access a named database.
export const db = getFirestore(app, "senseosdata");

// Connect to Storage (uses bucket from config by default)
export const storage = getStorage(app);

// Connect to Cloud Functions (Genkit)
export const functions = getFunctions(app, "us-central1");

// --- Diagnostic Log ---
console.log(`[Firebase Init] Connected to Firestore Database ID: ${(db as any)._databaseId?.database || "senseosdata"}`);
