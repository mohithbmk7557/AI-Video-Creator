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

// ── Validation helpers ────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSignIn(email: string, password: string): string | null {
  if (!email.trim()) return "Please enter your email address.";
  if (!EMAIL_RE.test(email.trim())) return "Please enter a valid email address.";
  if (!password) return "Please enter your password.";
  return null;
}

function validateSignUp(email: string, password: string): string | null {
  if (!email.trim()) return "Please enter your email address.";
  if (!EMAIL_RE.test(email.trim())) return "Please enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
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

  const [verifyStep, setVerifyStep] = useState(false);
  const [code, setCode] = useState("");
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

  const clerkMsg = (e: any) =>
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    "Something went wrong. Please try again.";

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (loading) return;

    const validationError = validateSignIn(email, password);
    if (validationError) { setError(validationError); return; }

    if (!signInLoaded || !signIn) {
      setError("Auth is still loading — wait a moment then try again.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.replace("/(home)" as any);
      } else {
        setError(`Sign-in incomplete (status: ${result.status}). Please try again.`);
      }
    } catch (e: any) {
      setError(clerkMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up – Step 1 ───────────────────────────────────────────────────────
  const handleSignUp = async () => {
    if (loading) return;

    const validationError = validateSignUp(email, password);
    if (validationError) { setError(validationError); return; }

    if (!signUpLoaded || !signUp) {
      setError("Auth is still loading — wait a moment then try again.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifyStep(true);
    } catch (e: any) {
      setError(clerkMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up – Step 2: verify ───────────────────────────────────────────────
  const handleVerify = async () => {
    if (loading) return;
    if (!signUpLoaded || !signUp) { setError("Auth is still loading."); return; }
    setLoading(true); setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setSignUpActive({ session: result.createdSessionId });
        router.replace("/(home)" as any);
      } else {
        setError(`Verification incomplete (status: ${result.status}). Please try again.`);
      }
    } catch (e: any) {
      setError(clerkMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!signUp) return;
    setError(null); setInfo(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setInfo("New code sent — check your inbox.");
    } catch (e: any) {
      setError(clerkMsg(e));
    }
  };

  // ── Forgot – Step 1 ────────────────────────────────────────────────────────
  const handleForgotSend = async () => {
    if (loading) return;
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!EMAIL_RE.test(email.trim())) { setError("Please enter a valid email address."); return; }
    if (!signInLoaded || !signIn) { setError("Auth is still loading."); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      setInfo("Reset code sent — check your inbox.");
      setResetStep(true);
    } catch (e: any) {
      setError(clerkMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot – Step 2 ────────────────────────────────────────────────────────
  const handleForgotReset = async () => {
    if (loading) return;
    if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (!signInLoaded || !signIn) { setError("Auth is still loading."); return; }

    setLoading(true); setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode,
        password: newPassword,
      });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.replace("/(home)" as any);
      } else {
        setError(`Reset incomplete (status: ${result.status}). Please try again.`);
      }
    } catch (e: any) {
      setError(clerkMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // ── Clerk loading state ────────────────────────────────────────────────────
  const clerkReady = mode === "signup" ? signUpLoaded : signInLoaded;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Turn any topic into a 59-second AI video</Text>

          {/* ── FORGOT PASSWORD ─────────────────────────────────────────────── */}
          {mode === "forgot" ? (
            <>
              <Text style={[styles.modeTitle, { color: colors.foreground }]}>
                {resetStep ? "Set new password" : "Reset password"}
              </Text>
              <Text style={[styles.modeSubtitle, { color: colors.mutedForeground }]}>
                {resetStep
                  ? `We sent a 6-digit code to ${email.trim()}. Enter it and choose a new password.`
                  : "Enter your email and we'll send a reset code."}
              </Text>

              {/* Status / Error at top so it's always visible */}
              {info && <InfoBanner info={info} colors={colors} />}
              {error && <ErrorBanner error={error} colors={colors} />}

              {!resetStep ? (
                <>
                  <Field label="Email" colors={colors}>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: error ? colors.destructive + "77" : colors.border }]}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>
                  <PrimaryButton label="Send reset code" onPress={handleForgotSend} loading={loading} disabled={!email.trim()} colors={colors} />
                </>
              ) : (
                <>
                  <Field label="6-digit reset code" colors={colors}>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, textAlign: "center", letterSpacing: 8, fontSize: 22 }]}
                      value={resetCode}
                      onChangeText={setResetCode}
                      placeholder="000000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                      maxLength={6}
                      autoFocus
                    />
                  </Field>
                  <Field label="New password" colors={colors}>
                    <View>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 52 }]}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="Min 8 characters"
                        placeholderTextColor={colors.mutedForeground}
                        secureTextEntry={!showNewPw}
                      />
                      <Pressable style={styles.eyeBtn} onPress={() => setShowNewPw(v => !v)}>
                        <Feather name={showNewPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                    {newPassword.length > 0 && newPassword.length < 8 && (
                      <Text style={[styles.hint, { color: colors.destructive }]}>
                        {8 - newPassword.length} more character{8 - newPassword.length !== 1 ? "s" : ""} needed
                      </Text>
                    )}
                  </Field>
                  <PrimaryButton
                    label="Reset & sign in"
                    onPress={handleForgotReset}
                    loading={loading}
                    disabled={resetCode.length < 6 || newPassword.length < 8}
                    colors={colors}
                  />
                </>
              )}

              <Pressable onPress={() => switchMode("signin")} style={styles.backBtn} hitSlop={12}>
                <Feather name="arrow-left" size={14} color={colors.primary} />
                <Text style={[styles.backText, { color: colors.primary }]}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* ── TABS ─────────────────────────────────────────────────── */}
              <View style={[styles.tabBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                {(["signin", "signup"] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => switchMode(t)}
                    style={[styles.tabBtn, mode === t && { backgroundColor: colors.primary }]}
                    hitSlop={4}
                  >
                    <Text style={[styles.tabText, { color: mode === t ? "#fff" : colors.mutedForeground }]}>
                      {t === "signin" ? "Sign In" : "Sign Up"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Clerk not ready warning */}
              {!clerkReady && (
                <View style={[styles.infoBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Loading authentication…</Text>
                </View>
              )}

              {/* ── SIGN-UP VERIFY STEP ──────────────────────────────────── */}
              {verifyStep ? (
                <>
                  {info && <InfoBanner info={info} colors={colors} />}
                  {error && <ErrorBanner error={error} colors={colors} />}

                  <Text style={[styles.verifyMsg, { color: colors.mutedForeground }]}>
                    We sent a 6-digit code to {email.trim()}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, textAlign: "center", letterSpacing: 8, fontSize: 22, marginBottom: 16 }]}
                    value={code}
                    onChangeText={setCode}
                    placeholder="000000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    maxLength={6}
                    autoFocus
                  />
                  <PrimaryButton label="Verify & continue" onPress={handleVerify} loading={loading} disabled={code.length < 6} colors={colors} />
                  <Pressable onPress={handleResend} style={styles.resendBtn} hitSlop={10}>
                    <Text style={[styles.resendText, { color: colors.mutedForeground }]}>Didn't get it? Resend code</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {/* Status / Error ABOVE fields so always visible */}
                  {info && <InfoBanner info={info} colors={colors} />}
                  {error && <ErrorBanner error={error} colors={colors} />}

                  {/* Email */}
                  <Field label="Email" colors={colors}>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: error && !EMAIL_RE.test(email) ? colors.destructive + "77" : colors.border }]}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>

                  {/* Password */}
                  <Field
                    label="Password"
                    colors={colors}
                    right={mode === "signin" ? (
                      <Pressable onPress={() => switchMode("forgot")} hitSlop={8}>
                        <Text style={[styles.forgotLink, { color: colors.primary }]}>Forgot password?</Text>
                      </Pressable>
                    ) : undefined}
                  >
                    <View>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 52 }]}
                        value={password}
                        onChangeText={setPassword}
                        placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
                        placeholderTextColor={colors.mutedForeground}
                        secureTextEntry={!showPw}
                      />
                      <Pressable style={styles.eyeBtn} onPress={() => setShowPw(v => !v)} hitSlop={8}>
                        <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                    {/* Password strength hint (sign-up only) */}
                    {mode === "signup" && password.length > 0 && password.length < 8 && (
                      <Text style={[styles.hint, { color: colors.destructive }]}>
                        {8 - password.length} more character{8 - password.length !== 1 ? "s" : ""} needed
                      </Text>
                    )}
                    {mode === "signup" && password.length >= 8 && (
                      <Text style={[styles.hint, { color: "#22c55e" }]}>✓ Password looks good</Text>
                    )}
                  </Field>

                  <PrimaryButton
                    label={mode === "signin" ? "Sign In" : "Create Account"}
                    onPress={mode === "signin" ? handleSignIn : handleSignUp}
                    loading={loading}
                    disabled={!clerkReady || !email || !password || (mode === "signup" && password.length < 8)}
                    colors={colors}
                  />

                  {/* Clerk bot-protection anchor — must be in DOM for sign-up */}
                  {mode === "signup" && (
                    <View nativeID="clerk-captcha" style={styles.captchaAnchor} />
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
type Colors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function Field({ label, right, children, colors }: { label: string; right?: React.ReactNode; children: React.ReactNode; colors: Colors }) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function ErrorBanner({ error, colors }: { error: string; colors: Colors }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "55" }]}>
      <Feather name="alert-circle" size={15} color={colors.destructive} />
      <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
    </View>
  );
}

function InfoBanner({ info, colors }: { info: string; colors: Colors }) {
  return (
    <View style={[styles.infoBox, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
      <Feather name="check-circle" size={15} color={colors.primary} />
      <Text style={[styles.infoText, { color: colors.primary }]}>{info}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, loading, disabled, colors }: {
  label: string; onPress: () => void; loading: boolean; disabled: boolean; colors: Colors;
}) {
  const inactive = loading || disabled;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: colors.primary },
        inactive && { opacity: 0.45 },
        pressed && !inactive && { opacity: 0.85 },
      ]}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
    >
      {loading
        ? <ActivityIndicator color="#fff" />
        : <Text style={styles.btnText}>{label}</Text>
      }
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 28, alignItems: "stretch" },
  logoBox: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  appName: { fontSize: 32, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 36, lineHeight: 20 },
  tabBar: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fieldGroup: { marginBottom: 16 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  forgotLink: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { position: "absolute", right: 14, top: 17 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, paddingLeft: 2 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  infoBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  primaryBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 20, marginTop: 4 },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  verifyMsg: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  resendBtn: { alignItems: "center", marginTop: -8, marginBottom: 8 },
  resendText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modeTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  modeSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  backBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, paddingVertical: 8 },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  captchaAnchor: { height: 1, overflow: "hidden" },
});
