import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Quote, QuoteStatus } from "../types";
import { formatCurrency, formatDate, statusColor } from "../lib/utils";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "Dashboard">;

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Drafts",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
};

export default function DashboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuotes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("quotes")
      .select("*")
      .eq("contractor_id", user.id)
      .order("created_at", { ascending: false });
    setQuotes((data as Quote[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchQuotes();
    }, [fetchQuotes])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchQuotes();
    setRefreshing(false);
  }

  const counts = quotes.reduce(
    (acc, q) => {
      acc[q.status] = (acc[q.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        {(["draft", "sent", "viewed", "accepted", "declined"] as QuoteStatus[]).map((s) => (
          <View key={s} style={styles.statCard}>
            <Text style={[styles.statCount, { color: statusColor(s) }]}>
              {counts[s] || 0}
            </Text>
            <Text style={styles.statLabel}>{STATUS_LABELS[s]}</Text>
          </View>
        ))}
      </View>

      {/* Quote List */}
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={quotes.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No quotes yet</Text>
            <Text style={styles.emptyText}>Tap + to create your first quote</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.quoteCard}
            onPress={() => navigation.navigate("QuoteDetail", { quoteId: item.id })}
            activeOpacity={0.7}
          >
            <View style={styles.quoteHeader}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customer_name}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + "18" }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={styles.jobAddress} numberOfLines={1}>{item.job_address}</Text>
            <View style={styles.quoteFooter}>
              <Text style={styles.total}>{formatCurrency(item.total)}</Text>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("NewQuote")}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  statsRow: { flexDirection: "row", paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 6 },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  statCount: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 10, color: colors.gray[500], marginTop: 2, textTransform: "uppercase", fontWeight: "600" },
  list: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.gray[700], marginBottom: spacing.xs },
  emptyText: { fontSize: 14, color: colors.gray[400] },
  quoteCard: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 10, borderWidth: 1, borderColor: colors.gray[200] },
  quoteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  customerName: { fontSize: 16, fontWeight: "700", color: colors.black, flex: 1, marginRight: spacing.sm },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "600" },
  jobAddress: { fontSize: 13, color: colors.gray[500], marginBottom: 8 },
  quoteFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  total: { fontSize: 16, fontWeight: "700", color: colors.black },
  date: { fontSize: 12, color: colors.gray[400] },
  fab: { position: "absolute", bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText: { fontSize: 28, fontWeight: "600", color: colors.black, marginTop: -2 },
});
