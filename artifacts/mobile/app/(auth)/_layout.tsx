import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import React from "react";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  // If Clerk confirms the user is signed in, leave the auth group immediately.
  // This fires automatically after setSignInActive / setSignUpActive resolves,
  // removing any manual router.replace() race condition.
  if (isSignedIn) return <Redirect href="/(home)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    />
  );
}
