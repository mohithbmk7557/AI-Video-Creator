import React, { createContext, useContext, type ReactNode } from "react";
import { useAuth, useUser } from "@clerk/expo";

interface AuthContextValue {
  isSignedIn: boolean;
  isLoaded: boolean;
  userId: string | null | undefined;
  userEmail: string | null | undefined;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isSignedIn: false,
  isLoaded: false,
  userId: null,
  userEmail: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const { user } = useUser();

  return (
    <AuthContext.Provider
      value={{
        isSignedIn: !!isSignedIn,
        isLoaded,
        userId: user?.id,
        userEmail: user?.emailAddresses?.[0]?.emailAddress,
        signOut: async () => { await signOut(); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
