import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  authError: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
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
      // We do not throw here so that UI components don't need to catch
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
    <AuthContext.Provider value={{ user, loading, signIn, signOut, authError }}>
      {children}
    </AuthContext.Provider>
  );
};