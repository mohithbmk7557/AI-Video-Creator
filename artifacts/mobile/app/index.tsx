import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

export default function RootIndex() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0B14", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#6C63FF" size="large" />
      </View>
    );
  }

  if (isSignedIn) return <Redirect href="/(home)" />;
  return <Redirect href="/(auth)" />;
}
