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

type Mode = "signin" | "signup" | "forgot";

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Email verification (sign-up)
  const [verifyStep, setVerifyStep] = useState(false);
  const [code, setCode] = useState("");

  // Password reset (forgot)
  const [resetStep, setResetStep] = useState(false);
  const [resetCode, setResetCode] = useState("");

  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const bottomPad = Platform.OS === "web" ? 30 : insets.bottom;

  const reset = () => {
    setEmail(""); setPassword(""); setNewPassword("");
    setError(null); setInfo(null);
    setCode(""); setVerifyStep(false);
    setResetCode(""); setResetStep(false);
    setShowPw(false); setShowNewPw(false);
  };

  const switchMode = (m: Mode) => { setMode(m); reset(); };

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!signInLoaded || !signIn || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setError("Sign-in could not be completed. Please try again.");
      }
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        "Sign-in failed. Check your email and password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up – Step 1: create account ──────────────────────────────────────
  const handleSignUp = async () => {
    if (!signUpLoaded || !signUp || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifyStep(true);
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        "Sign-up failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up – Step 2: verify email code ───────────────────────────────────
  const handleVerify = async () => {
    if (!signUpLoaded || !signUp || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setSignUpActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        "Invalid code. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Password – Step 1: send reset code ─────────────────────────────
  const handleForgotSend = async () => {
    if (!signInLoaded || !signIn || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setInfo("A reset code has been sent to your email.");
      setResetStep(true);
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        "Could not send reset email. Check the address and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Password – Step 2: verify code + set new password ──────────────
  const handleForgotReset = async () => {
    if (!signInLoaded || !signIn || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode,
        password: newPassword,
      });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.replace("/");
      } else {
        setError("Password reset failed. Please try again.");
      }
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        "Invalid code or password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
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
            { paddingTop: topPad + 32, paddingBottom: bottomPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.logoBox}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Feather name="film" size={34} color="#fff" />
          </LinearGradient>
          <Text style={[styles.appName, { color: colors.foreground }]}>AiVid</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Turn any topic into a 59-second AI video
          </Text>

          {/* ── FORGOT PASSWORD FLOW ─────────────────────────────────────── */}
          {mode === "forgot" ? (
            <>
              <Text style={[styles.modeTitle, { color: colors.foreground }]}>
                {resetStep ? "Enter reset code" : "Reset your password"}
              </Text>
              <Text style={[styles.modeSubtitle, { color: colors.mutedForeground }]}>
                {resetStep
                  ? `We sent a 6-digit code to ${email}. Enter it below along with your new password.`
                  : "Enter your email and we'll send you a reset code."}
              </Text>

              {!resetStep ? (
                <>
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
                  {error && <ErrorBanner error={error} colors={colors} />}
                  <PrimaryButton
                    label="Send reset code"
                    onPress={handleForgotSend}
                    loading={loading}
                    disabled={!email}
                    colors={colors}
                  />
                </>
              ) : (
                <>
                  {info && (
                    <View style={[styles.infoBox, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
                      <Feather name="mail" size={14} color={colors.primary} />
                      <Text style={[styles.infoText, { color: colors.primary }]}>{info}</Text>
                    </View>
                  )}
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>Reset code</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, textAlign: "center", letterSpacing: 8, fontSize: 22 }]}
                      value={resetCode}
                      onChangeText={(v) => { setResetCode(v); setError(null); }}
                      placeholder="000000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      maxLength={6}
                      autoFocus
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.label, { color: colors.mutedForeground }]}>New password</Text>
                    <View>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 52 }]}
                        value={newPassword}
                        onChangeText={(v) => { setNewPassword(v); setError(null); }}
                        placeholder="Min 8 characters"
                        placeholderTextColor={colors.mutedForeground}
                        secureTextEntry={!showNewPw}
                      />
                      <Pressable style={styles.eyeBtn} onPress={() => setShowNewPw((v) => !v)}>
                        <Feather name={showNewPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  </View>
                  {error && <ErrorBanner error={error} colors={colors} />}
                  <PrimaryButton
                    label="Reset password"
                    onPress={handleForgotReset}
                    loading={loading}
                    disabled={resetCode.length < 6 || newPassword.length < 8}
                    colors={colors}
                  />
                </>
              )}

              <Pressable onPress={() => switchMode("signin")} style={styles.backBtn}>
                <Feather name="arrow-left" size={14} color={colors.primary} />
                <Text style={[styles.backText, { color: colors.primary }]}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* ── TAB SWITCHER ──────────────────────────────────────────── */}
              <View style={[styles.tabBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                {(["signin", "signup"] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => switchMode(t)}
                    style={[styles.tabBtn, mode === t && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.tabText, { color: mode === t ? "#fff" : colors.mutedForeground }]}>
                      {t === "signin" ? "Sign In" : "Sign Up"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* ── SIGN-UP VERIFY STEP ───────────────────────────────────── */}
              {verifyStep ? (
                <>
                  <Text style={[styles.verifyMsg, { color: colors.mutedForeground }]}>
                    We sent a 6-digit code to {email}
                  </Text>
                  <TextInput
                    style={[styles.input, {
                      backgroundColor: colors.input, color: colors.foreground,
                      borderColor: colors.border, textAlign: "center", letterSpacing: 8, fontSize: 22,
                    }]}
                    value={code}
                    onChangeText={(v) => { setCode(v); setError(null); }}
                    placeholder="000000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    maxLength={6}
                    autoFocus
                  />
                  {error && <ErrorBanner error={error} colors={colors} />}
                  <PrimaryButton
                    label="Verify & Continue"
                    onPress={handleVerify}
                    loading={loading}
                    disabled={code.length < 6}
                    colors={colors}
                  />
                  <Pressable
                    onPress={() => signUp?.prepareEmailAddressVerification({ strategy: "email_code" })}
                    style={styles.resendBtn}
                  >
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
                    <View style={styles.labelRow}>
                      <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
                      {mode === "signin" && (
                        <Pressable onPress={() => switchMode("forgot")}>
                          <Text style={[styles.forgotLink, { color: colors.primary }]}>
                            Forgot password?
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    <View>
                      <TextInput
                        style={[styles.input, {
                          backgroundColor: colors.input, color: colors.foreground,
                          borderColor: colors.border, paddingRight: 52,
                        }]}
                        value={password}
                        onChangeText={(v) => { setPassword(v); setError(null); }}
                        placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
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
                    label={mode === "signin" ? "Sign In" : "Create Account"}
                    onPress={mode === "signin" ? handleSignIn : handleSignUp}
                    loading={loading}
                    disabled={!email || !password}
                    colors={colors}
                  />

                  {/* Required by Clerk for bot protection on sign-up */}
                  {mode === "signup" && <View nativeID="clerk-captcha" />}
                </>
              )}
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
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: colors.primary },
        (loading || disabled) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading
        ? <ActivityIndicator color="#fff" />
        : <Text style={styles.btnText}>{label}</Text>
      }
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
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  forgotLink: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { position: "absolute", right: 14, top: 17 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  infoBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  primaryBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 20, marginTop: 4 },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  verifyMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  resendBtn: { alignItems: "center", marginTop: -8 },
  resendText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modeTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  modeSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 28, lineHeight: 20 },
  backBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
