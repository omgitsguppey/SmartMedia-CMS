import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'error' | 'success' | 'warn';
  details?: any;
}

interface LogContextType {
  logs: LogEntry[];
  addLog: (message: string, type?: LogEntry['type'], details?: any) => void;
  clearLogs: () => void;
  lastError: LogEntry | null;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const useLogs = () => {
  const context = useContext(LogContext);
  if (!context) throw new Error('useLogs must be used within a LogProvider');
  return context;
};

export const LogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastError, setLastError] = useState<LogEntry | null>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', details?: any) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      message,
      type,
      details
    };

    if (type === 'error') {
      setLastError(entry);
      console.error(`[App Log] ${message}`, details || '');
    } else {
      console.log(`[App Log] ${message}`, details || '');
    }

    setLogs(prev => {
      const newLogs = [entry, ...prev];
      return newLogs.slice(0, 20); // Keep last 20
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setLastError(null);
  }, []);

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs, lastError }}>
      {children}
    </LogContext.Provider>
  );
};