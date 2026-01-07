import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/client';
import { ensureUserProfile } from '../services/storageService';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  isAdmin: false,
  signIn: async () => {},
  signOut: async () => {},
  authError: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for auth state changes
    let profileUnsubscribe: () => void | undefined;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // 1. UI_READY: Render immediately, don't wait for profile
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
          // 2. DATA_READY: Fetch profile in background
          ensureUserProfile(currentUser).catch(err => 
             console.warn("[Auth] Profile init minor issue:", err)
          );
           
          // Subscribe to Profile Changes (Real-time Quota/Role)
          const userRef = doc(db, 'users', currentUser.uid);
          profileUnsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              setUserProfile(data);
              setIsAdmin(data.role === 'admin');
            }
          });
      } else {
        setUserProfile(null);
        setIsAdmin(false);
        if (profileUnsubscribe) profileUnsubscribe();
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  const signIn = async () => {
    setAuthError(null);
    try {
      console.log("Initiating sign-in from origin:", window.location.origin);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Auth Error:", error);
      let msg = "Failed to sign in.";
      if (error.code === 'auth/unauthorized-domain') {
        msg = `Domain unauthorized (${window.location.hostname}). This domain must be added to Firebase Console > Authentication > Settings > Authorized Domains.`;
      } else if (error.code === 'auth/popup-closed-by-user') {
        msg = "Sign-in cancelled.";
      } else if (error.message) {
        msg = error.message;
      }
      setAuthError(msg);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.error("Sign out error", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAdmin, signIn, signOut, authError }}>
      {children}
    </AuthContext.Provider>
  );
};