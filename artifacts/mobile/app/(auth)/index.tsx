import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSignIn, useSignUp } from "@clerk/expo";
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

type Tab = "signin" | "signup";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verify step for sign-up
  const [verifyStep, setVerifyStep] = useState(false);
  const [code, setCode] = useState("");

  const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp();

  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const bottomPad = Platform.OS === "web" ? 30 : insets.bottom;

  const reset = () => {
    setEmail(""); setPassword(""); setError(null); setCode(""); setVerifyStep(false);
  };

  const switchTab = (t: Tab) => { setTab(t); reset(); };

  const handleSignIn = async () => {
    if (!signInLoaded || !signIn || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      const result = await signIn.create({ strategy: "password", identifier: email, password });
      if (result.status === "complete") {
        await setActiveSignIn({ session: result.createdSessionId });
        router.replace("/(home)");
      } else {
        setError("Sign-in incomplete. Please try again.");
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUpLoaded || !signUp || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifyStep(true);
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Sign-up failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signUpLoaded || !signUp || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActiveSignUp({ session: result.createdSessionId });
        router.replace("/(home)");
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (e: any) {
      setError(e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 32, paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.logoBox} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Feather name="film" size={34} color="#fff" />
          </LinearGradient>
          <Text style={[styles.appName, { color: colors.foreground }]}>AiVid</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Turn any topic into a 59-second AI video
          </Text>

          {/* Tab switcher */}
          <View style={[styles.tabBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            {(["signin", "signup"] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => switchTab(t)}
                style={[styles.tabBtn, tab === t && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.tabText, { color: tab === t ? "#fff" : colors.mutedForeground }]}>
                  {t === "signin" ? "Sign In" : "Sign Up"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Verify step for sign-up */}
          {verifyStep ? (
            <>
              <Text style={[styles.verifyMsg, { color: colors.mutedForeground }]}>
                We sent a 6-digit code to {email}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, textAlign: "center", letterSpacing: 8, fontSize: 22 }]}
                value={code}
                onChangeText={(v) => { setCode(v); setError(null); }}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                maxLength={6}
                autoFocus
              />
              {error && <ErrorBanner error={error} colors={colors} />}
              <PrimaryButton label="Verify & Continue" onPress={handleVerify} loading={loading} disabled={code.length < 6} colors={colors} />
              <Pressable onPress={() => signUp?.prepareEmailAddressVerification({ strategy: "email_code" })} style={styles.resendBtn}>
                <Text style={[styles.resendText, { color: colors.mutedForeground }]}>Resend code</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border }]}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(null); }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
                <View>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 52 }]}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setError(null); }}
                    placeholder={tab === "signup" ? "Min 8 characters" : "••••••••"}
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPw}
                  />
                  <Pressable style={styles.eyeBtn} onPress={() => setShowPw((v) => !v)}>
                    <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </View>

              {error && <ErrorBanner error={error} colors={colors} />}

              <PrimaryButton
                label={tab === "signin" ? "Sign In" : "Create Account"}
                onPress={tab === "signin" ? handleSignIn : handleSignUp}
                loading={loading}
                disabled={!email || !password}
                colors={colors}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ErrorBanner({ error, colors }: { error: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "55" }]}>
      <Feather name="alert-circle" size={14} color={colors.destructive} />
      <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, loading, disabled, colors }: {
  label: string; onPress: () => void; loading: boolean; disabled: boolean;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary }, (loading || disabled) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 28, alignItems: "stretch" },
  logoBox: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  appName: { fontSize: 32, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 36, lineHeight: 20 },
  tabBar: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 4, marginBottom: 28 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { position: "absolute", right: 14, top: 17 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  primaryBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 20, marginTop: 4 },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  verifyMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  resendBtn: { alignItems: "center", marginTop: -8 },
  resendText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
