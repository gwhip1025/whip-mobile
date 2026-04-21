import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../lib/auth";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "Signup">;

export default function SignupScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!businessName || !email || !password) {
      Alert.alert("Error", "All fields are required.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const error = await signUp(email.trim(), password, businessName.trim());
    setLoading(false);
    if (error) {
      Alert.alert("Sign up failed", error);
    } else {
      Alert.alert(
        "Check your email",
        "We sent a confirmation link. Click it to activate your account.",
        [{ text: "OK", onPress: () => navigation.navigate("Login") }]
      );
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Whip</Text>
        <Text style={styles.subtitle}>Create your account</Text>
        <Text style={styles.subtext}>3 quotes free, no card required</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Business Name"
            placeholderTextColor={colors.gray[400]}
            value={businessName}
            onChangeText={setBusinessName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.gray[400]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (8+ characters)"
            placeholderTextColor={colors.gray[400]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legal}>
            By creating an account, you agree to our Terms and Conditions and Privacy Policy. Whip sends transactional SMS messages to your customers on your behalf. Message and data rates may apply.
          </Text>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={styles.link}>
            Already have an account? <Text style={styles.linkBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  logo: { fontSize: 36, fontWeight: "800", textAlign: "center", color: colors.black, marginBottom: spacing.xs },
  subtitle: { fontSize: 18, fontWeight: "700", textAlign: "center", color: colors.black },
  subtext: { fontSize: 14, color: colors.gray[500], textAlign: "center", marginBottom: spacing.lg },
  form: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.lg, gap: 14, borderWidth: 1, borderColor: colors.gray[200], marginBottom: spacing.lg },
  input: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: colors.gray[200], color: colors.black },
  button: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: "700", color: colors.black },
  legal: { fontSize: 11, color: colors.gray[400], lineHeight: 16, textAlign: "center" },
  link: { textAlign: "center", color: colors.gray[500], fontSize: 14 },
  linkBold: { fontWeight: "600", color: colors.black },
});
