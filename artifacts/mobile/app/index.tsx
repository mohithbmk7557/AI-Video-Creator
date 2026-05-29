import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function RootIndex() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useColors();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isSignedIn) return <Redirect href="/(home)" />;
  return <Redirect href="/(auth)/sign-in" />;
}
