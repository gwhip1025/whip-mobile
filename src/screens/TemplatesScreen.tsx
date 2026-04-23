import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";
import { QuoteTemplate } from "../types";
import { formatCurrency } from "../lib/utils";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "Templates">;

export default function TemplatesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("quote_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTemplates((data as QuoteTemplate[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  }

  function confirmDelete(t: QuoteTemplate) {
    Alert.alert("Delete template?", `Delete "${t.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await apiFetch(`/api/templates/${t.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            fetch();
          } catch {
            Alert.alert("Error", "Failed to delete template.");
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={templates.length === 0 ? styles.emptyContainer : styles.list}
        ListHeaderComponent={
          templates.length > 0 ? (
            <Text style={styles.hint}>
              Tap to create a quote from this template. Save templates from any quote's detail screen.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No templates yet</Text>
            <Text style={styles.emptyText}>
              Build a quote, open it, and tap "Save as Template" to reuse it later.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const subtotal = (item.line_items ?? []).reduce(
            (sum, li) => sum + li.quantity * li.unit_price,
            0
          );
          const tax = subtotal * ((item.tax_rate ?? 0) / 100);
          const total = subtotal + tax;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() =>
                // Jump into the Quotes tab so post-save nav to QuoteDetail
                // works. SettingsStack doesn't register QuoteDetail and
                // replacing into a missing route throws.
                navigation
                  .getParent()
                  ?.navigate("QuotesTab", {
                    screen: "NewQuote",
                    params: { templateId: item.id },
                  })
              }
              onLongPress={() => confirmDelete(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.total}>{formatCurrency(total)}</Text>
              </View>
              {item.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.items}>
                {(item.line_items ?? []).length} item
                {(item.line_items ?? []).length === 1 ? "" : "s"} · valid {item.valid_days} days
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      {templates.length > 0 ? (
        <Text style={styles.footer}>Long-press a template to delete it.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  list: { padding: spacing.md, paddingBottom: 60 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  empty: { alignItems: "center", paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.gray[700], marginBottom: spacing.xs },
  emptyText: { fontSize: 14, color: colors.gray[400], textAlign: "center" },
  hint: { fontSize: 13, color: colors.gray[500], marginBottom: spacing.md, paddingHorizontal: 4 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 10, borderWidth: 1, borderColor: colors.gray[200] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  name: { fontSize: 16, fontWeight: "700", color: colors.black, flex: 1, marginRight: spacing.sm },
  total: { fontSize: 15, fontWeight: "700", color: colors.black },
  description: { fontSize: 13, color: colors.gray[500], marginBottom: 6 },
  items: { fontSize: 12, color: colors.gray[400] },
  footer: { textAlign: "center", color: colors.gray[400], fontSize: 12, paddingVertical: 8 },
});
