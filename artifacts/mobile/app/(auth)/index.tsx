import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
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
import { useAppAuth } from "@/context/AuthContext";

type Mode = "signin" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAppAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const bottomPad = Platform.OS === "web" ? 30 : insets.bottom;

  const switchMode = (m: Mode) => {
    setMode(m);
    setEmail(""); setPassword(""); setError(null); setShowPw(false);
  };

  const validate = (): string | null => {
    if (!email.trim()) return "Please enter your email address.";
    if (!EMAIL_RE.test(email.trim())) return "Please enter a valid email address.";
    if (!password) return "Please enter your password.";
    if (mode === "signup" && password.length < 8) return "Password must be at least 8 characters.";
    return null;
  };

  const handleSubmit = async () => {
    if (loading) return;
    const err = validate();
    if (err) { setError(err); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      if (mode === "signin") {
        console.log("[SignIn] Attempting sign in for:", email.trim());
        console.log("[SignIn] Password length:", password.length);
        await signIn(email.trim(), password);
        console.log("[SignIn] Sign in succeeded for:", email.trim());
      } else {
        console.log("[SignUp] Attempting sign up for:", email.trim());
        console.log("[SignUp] Password length:", password.length);
        await signUp(email.trim(), password);
        console.log("[SignUp] Sign up succeeded for:", email.trim());
      }
      // Auth layout detects isSignedIn → true and navigates to home automatically
    } catch (e: any) {
      console.log("[Auth] Error during", mode, ":", e?.message);
      console.log("[Auth] Full error object:", e);
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      console.log("[Auth] Finished", mode, "attempt — loading reset");
      setLoading(false);
    }
  };

  const isDisabled = !email || !password || (mode === "signup" && password.length < 8);

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
          {/* ── Logo ───────────────────────────────────────────────────────── */}
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.logoBox}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Feather name="film" size={34} color="#fff" />
          </LinearGradient>
          <Text style={[styles.appName, { color: colors.foreground }]}>AiVid</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Turn any topic into a 59-second AI video
          </Text>

          {/* ── Tab switcher ───────────────────────────────────────────────── */}
          <View style={[styles.tabBar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            {(["signin", "signup"] as Mode[]).map((t) => (
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

          {/* ── Error banner ───────────────────────────────────────────────── */}
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "55" }]}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          {/* ── Email ──────────────────────────────────────────────────────── */}
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

          {/* ── Password ───────────────────────────────────────────────────── */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
            <View>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, color: colors.foreground, borderColor: colors.border, paddingRight: 52 }]}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(null); }}
                placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPw}
              />
              <Pressable style={styles.eyeBtn} onPress={() => setShowPw(v => !v)} hitSlop={8}>
                <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {mode === "signup" && password.length > 0 && password.length < 8 && (
              <Text style={[styles.hint, { color: colors.destructive }]}>
                {8 - password.length} more character{8 - password.length !== 1 ? "s" : ""} needed
              </Text>
            )}
            {mode === "signup" && password.length >= 8 && (
              <Text style={[styles.hint, { color: "#22c55e" }]}>✓ Password looks good</Text>
            )}
          </View>

          {/* ── Submit button ──────────────────────────────────────────────── */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (loading || isDisabled) && { opacity: 0.45 },
              pressed && !(loading || isDisabled) && { opacity: 0.85 },
            ]}
            onPress={handleSubmit}
            disabled={loading || isDisabled}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>{mode === "signin" ? "Sign In" : "Create Account"}</Text>
            }
          </Pressable>

          {/* ── Hint for sign-in: remind to sign up first ─────────────────── */}
          {mode === "signin" && (
            <Text style={[styles.switchHint, { color: colors.mutedForeground }]}>
              No account yet?{" "}
              <Text style={{ color: colors.primary }} onPress={() => switchMode("signup")}>
                Sign up here
              </Text>
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 28, alignItems: "stretch" },
  logoBox: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  appName: { fontSize: 32, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 36, lineHeight: 20 },
  tabBar: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 4, marginBottom: 24 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, fontFamily: "Inter_400Regular" },
  eyeBtn: { position: "absolute", right: 14, top: 17 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, paddingLeft: 2 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  primaryBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 16, marginTop: 4 },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  switchHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
