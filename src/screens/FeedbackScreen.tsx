import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiFetch } from "../lib/api";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "Feedback">;

export default function FeedbackScreen({ navigation }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) {
      return Alert.alert("Tell us more", "Write at least a sentence or two so we know what to work on.");
    }
    setSending(true);
    try {
      const res = await apiFetch(`/api/feedback`, {
        method: "POST",
        body: JSON.stringify({
          source: "contractor",
          message: message.trim(),
          rating,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed");
      }
      Alert.alert("Thanks!", "Your feedback was sent. We read every word.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send feedback.");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How are we doing?</Text>
          <Text style={styles.sub}>Your rating (optional)</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setRating(rating === n ? null : n)}
                style={[styles.star, rating && n <= rating ? styles.starFilled : null]}
              >
                <Text style={styles.starText}>{rating && n <= rating ? "★" : "☆"}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sub}>What's on your mind?</Text>
          <TextInput
            style={styles.textarea}
            placeholder="A bug, a feature you want, something confusing, or just a high-five..."
            placeholderTextColor={colors.gray[400]}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, sending && styles.btnDisabled]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Send feedback</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.black, marginBottom: 12 },
  sub: { fontSize: 13, fontWeight: "600", color: colors.gray[600], marginBottom: 8, marginTop: 8 },
  stars: { flexDirection: "row", gap: 4, marginBottom: 8 },
  star: { paddingHorizontal: 4 },
  starFilled: {},
  starText: { fontSize: 36, color: colors.primary },
  textarea: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: colors.gray[200], color: colors.black, minHeight: 140, textAlignVertical: "top", marginBottom: 12 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  btnDisabled: { opacity: 0.6 },
});
