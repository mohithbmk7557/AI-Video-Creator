/**
 * AuthContext — local auth backed by AsyncStorage.
 * No external service or API key needed. Works offline.
 *
 * Accounts are stored as a JSON map  { [email]: { passwordHash, id } }
 * Session is stored as               { id, email }
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoaded: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isSignedIn: false,
  isLoaded: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

const SESSION_KEY = "@aivid_session_v2";
const ACCOUNTS_KEY = "@aivid_accounts_v2";

type AccountsStore = Record<string, { passwordHash: string; id: string }>;

function hashPw(password: string): string {
  const salted = `aivid::${password}::demo-salt`;
  return btoa(unescape(encodeURIComponent(salted)));
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then((raw) => {
      if (raw) {
        try { setUser(JSON.parse(raw) as AuthUser); } catch {}
      }
      setIsLoaded(true);
    });
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const accounts: AccountsStore = raw ? JSON.parse(raw) : {};
    const key = email.toLowerCase().trim();
    if (accounts[key]) {
      throw new Error("An account with this email already exists. Please sign in.");
    }
    const id = uid();
    accounts[key] = { passwordHash: hashPw(password), id };
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    const session: AuthUser = { id, email: key };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const accounts: AccountsStore = raw ? JSON.parse(raw) : {};
    const key = email.toLowerCase().trim();
    const account = accounts[key];
    if (!account) {
      throw new Error("No account found for this email. Please sign up first.");
    }
    if (account.passwordHash !== hashPw(password)) {
      throw new Error("Incorrect password. Please try again.");
    }
    const session: AuthUser = { id: account.id, email: key };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isSignedIn: !!user, isLoaded, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
