import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const colors = useColors();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    />
  );
}
