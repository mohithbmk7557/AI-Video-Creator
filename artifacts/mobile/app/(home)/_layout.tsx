import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useEffect } from "react";

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
      }}
    />
  );
}
