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
import { Invoice, PaymentStatus } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "Invoices">;

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

function paymentColor(s: PaymentStatus): string {
  switch (s) {
    case "paid":
      return colors.green;
    case "partial":
      return colors.blue;
    case "unpaid":
    default:
      return colors.red;
  }
}

export default function InvoicesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("contractor_id", user.id)
      .order("created_at", { ascending: false });
    setInvoices((data as Invoice[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchInvoices();
    }, [fetchInvoices])
  );

  async function onRefresh() {
    setRefreshing(true);
    await fetchInvoices();
    setRefreshing(false);
  }

  const outstanding = invoices
    .filter((i) => i.payment_status !== "paid")
    .reduce((sum, i) => sum + (i.total - (i.amount_paid ?? 0)), 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Outstanding banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>Outstanding</Text>
        <Text style={styles.bannerValue}>{formatCurrency(outstanding)}</Text>
      </View>

      <FlatList
        data={invoices}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={invoices.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No invoices yet</Text>
            <Text style={styles.emptyText}>
              Accept a quote, then turn it into an invoice — or tap + to create one from scratch.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const remaining = item.total - (item.amount_paid ?? 0);
          const statusClr = paymentColor(item.payment_status);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation.navigate("InvoiceDetail", { invoiceId: item.id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customer_name}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusClr + "18" }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusClr }]} />
                  <Text style={[styles.statusText, { color: statusClr }]}>
                    {STATUS_LABEL[item.payment_status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.invoiceNo}>
                #{item.invoice_number} · {formatDate(item.created_at)}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.total}>{formatCurrency(item.total)}</Text>
                {remaining > 0 && item.payment_status !== "unpaid" ? (
                  <Text style={styles.remaining}>
                    {formatCurrency(remaining)} due
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("NewInvoice")}
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
  banner: { backgroundColor: colors.white, margin: spacing.md, marginBottom: 0, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.gray[200], flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bannerLabel: { fontSize: 12, color: colors.gray[500], fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  bannerValue: { fontSize: 20, fontWeight: "800", color: colors.black },
  list: { padding: spacing.md, paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  empty: { alignItems: "center", paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.gray[700], marginBottom: spacing.xs },
  emptyText: { fontSize: 14, color: colors.gray[400], textAlign: "center" },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 10, borderWidth: 1, borderColor: colors.gray[200] },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  customerName: { fontSize: 16, fontWeight: "700", color: colors.black, flex: 1, marginRight: spacing.sm },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: "600" },
  invoiceNo: { fontSize: 13, color: colors.gray[500], marginBottom: 8 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  total: { fontSize: 16, fontWeight: "700", color: colors.black },
  remaining: { fontSize: 12, color: colors.red, fontWeight: "600" },
  fab: { position: "absolute", bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText: { fontSize: 28, fontWeight: "600", color: colors.black, marginTop: -2 },
});
