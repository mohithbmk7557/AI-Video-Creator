import { Redirect, Stack } from "expo-router";
import React from "react";
import { useAppAuth } from "@/context/AuthContext";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAppAuth();

  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/(home)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
  );
}
