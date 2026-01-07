
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export const LoginScreen: React.FC = () => {
  const { signIn, authError } = useAuth();

  return (
    <div className="flex h-screen w-full bg-black text-white items-center justify-center p-4">
      <div className="max-w-md w-full bg-ios-surface border border-white/10 rounded-[2rem] p-8 md:p-12 flex flex-col items-center text-center shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-gradient-to-tr from-ios-blue to-purple-600 rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(41,151,255,0.3)]">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold mb-3 tracking-tight">SmartMedia</h1>
        <p className="text-zinc-400 mb-10 text-lg leading-relaxed font-light">
          Your personal AI-powered cloud library.
        </p>
        
        {authError && (
          <div className="mb-8 p-4 bg-ios-danger/10 border border-ios-danger/20 rounded-xl text-ios-danger text-sm w-full text-left">
            <p className="font-bold mb-1">Authentication Failed</p>
            <p>{authError}</p>
          </div>
        )}

        <button 
          onClick={() => signIn()}
          className="w-full flex items-center justify-center gap-3 bg-white text-black font-bold py-4 px-6 rounded-2xl hover:bg-zinc-200 transition-transform active:scale-95 shadow-xl"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        
        <p className="mt-8 text-xs text-zinc-600 font-medium">
           Secure • Private • Intelligent
        </p>
      </div>
    </div>
  );
};
