import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Link, useRouter } from "expo-router";
import { useSignUp } from "@clerk/expo";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyStep, setVerifyStep] = useState(false);
  const [code, setCode] = useState("");

  const handleSignUp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    await signUp.verifications.sendEmailCode();
    setVerifyStep(true);
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          router.replace(url as any);
        },
      });
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const fieldError = (field: string) => {
    const e = errors?.fields as Record<string, { message: string }> | undefined;
    return e?.[field]?.message;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: topPad + 40, paddingBottom: bottomPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.logoBox}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Feather name="film" size={32} color="#fff" />
          </LinearGradient>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {verifyStep ? "Verify your email" : "Create account"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {verifyStep
              ? `We sent a code to ${email}`
              : "Start generating AI videos today"}
          </Text>

          {verifyStep ? (
            <>
              <View style={styles.fieldGroup}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      borderColor: colors.border,
                    },
                  ]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="6-digit code"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  autoFocus
                />
                {fieldError("code") && (
                  <Text style={[styles.errorText, { color: colors.destructive }]}>
                    {fieldError("code")}
                  </Text>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  (fetchStatus === "fetching" || !code) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleVerify}
                disabled={fetchStatus === "fetching" || !code}
              >
                {fetchStatus === "fetching" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Verify & continue</Text>
                )}
              </Pressable>
              <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
                <Text style={[styles.resend, { color: colors.mutedForeground }]}>
                  Resend code
                </Text>
              </Pressable>
              <View nativeID="clerk-captcha" />
            </>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.input,
                      color: colors.foreground,
                      borderColor: fieldError("emailAddress") ? colors.destructive : colors.border,
                    },
                  ]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {fieldError("emailAddress") && (
                  <Text style={[styles.errorText, { color: colors.destructive }]}>
                    {fieldError("emailAddress")}
                  </Text>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
                <View>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.input,
                        color: colors.foreground,
                        borderColor: fieldError("password") ? colors.destructive : colors.border,
                        paddingRight: 48,
                      },
                    ]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Min 8 characters"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword((v) => !v)}
                  >
                    <Feather
                      name={showPassword ? "eye-off" : "eye"}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                </View>
                {fieldError("password") && (
                  <Text style={[styles.errorText, { color: colors.destructive }]}>
                    {fieldError("password")}
                  </Text>
                )}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  (fetchStatus === "fetching" || !email || !password) && { opacity: 0.5 },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleSignUp}
                disabled={fetchStatus === "fetching" || !email || !password}
              >
                {fetchStatus === "fetching" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Create account</Text>
                )}
              </Pressable>

              <View style={styles.switchRow}>
                <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
                  Have an account?{" "}
                </Text>
                <Link href="/(auth)/sign-in" asChild>
                  <Pressable>
                    <Text style={[styles.link, { color: colors.primary }]}>Sign in</Text>
                  </Pressable>
                </Link>
              </View>
              <View nativeID="clerk-captcha" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    alignItems: "stretch",
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 36,
    lineHeight: 22,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 17,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  switchText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  link: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  resend: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 12,
  },
});
