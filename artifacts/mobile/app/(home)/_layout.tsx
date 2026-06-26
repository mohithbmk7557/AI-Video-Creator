import { Redirect, Stack } from "expo-router";
import React from "react";
import { useAppAuth } from "@/context/AuthContext";

export default function HomeLayout() {
  const { isSignedIn, isLoaded } = useAppAuth();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }} />
  );
}
