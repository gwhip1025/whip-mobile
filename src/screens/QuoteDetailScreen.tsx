import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Quote, ContractorProfile } from "../types";
import { formatCurrency, formatDate, statusColor } from "../lib/utils";
import { colors, spacing } from "../lib/theme";
import Constants from "expo-constants";

type Props = NativeStackScreenProps<any, "QuoteDetail">;

export default function QuoteDetailScreen({ route, navigation }: Props) {
  const { quoteId } = route.params as { quoteId: string };
  const { user } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const appUrl = Constants.expoConfig?.extra?.appUrl ?? "https://whip1.vercel.app";

  const fetchQuote = useCallback(async () => {
    const { data } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();
    setQuote(data as Quote | null);
    setLoading(false);
  }, [quoteId]);

  useFocusEffect(
    useCallback(() => {
      fetchQuote();
    }, [fetchQuote])
  );

  async function handleSend() {
    if (!quote) return;
    Alert.alert("Send Quote", `Send this quote to ${quote.customer_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setSending(true);
          const res = await fetch(`${appUrl}/api/quotes/${quote.id}/send`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          });
          setSending(false);
          if (res.ok) {
            Alert.alert("Sent!", "Your customer will receive the quote shortly.");
            fetchQuote();
          } else {
            const err = await res.json();
            Alert.alert("Send failed", err.error ?? "Please try again.");
          }
        },
      },
    ]);
  }

  async function handleShare() {
    if (!quote) return;
    const publicUrl = `${appUrl}/q/${quote.public_token}`;
    await Share.share({ message: `Check out this quote: ${publicUrl}`, url: publicUrl });
  }

  async function handleDuplicate() {
    if (!quote || !user) return;
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        contractor_id: user.id,
        customer_name: quote.customer_name,
        customer_phone: quote.customer_phone,
        customer_email: quote.customer_email,
        job_address: quote.job_address,
        scope_of_work: quote.scope_of_work,
        line_items: quote.line_items,
        tax_rate: quote.tax_rate,
        subtotal: quote.subtotal,
        tax_amount: quote.tax_amount,
        total: quote.total,
        valid_days: quote.valid_days,
        notes: quote.notes,
        status: "draft",
      })
      .select()
      .single();

    if (data) {
      navigation.replace("QuoteDetail", { quoteId: data.id });
    } else {
      Alert.alert("Error", "Failed to duplicate quote.");
    }
  }

  async function handleDecline() {
    if (!quote) return;
    Alert.alert("Cancel Quote", "Cancel this quote? The customer will no longer be able to accept it.", [
      { text: "Keep Quote", style: "cancel" },
      {
        text: "Cancel Quote",
        style: "destructive",
        onPress: async () => {
          await supabase.from("quotes").update({ status: "declined" }).eq("id", quote.id);
          fetchQuote();
        },
      },
    ]);
  }

  if (loading || !quote) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const validUntil = new Date(
    new Date(quote.created_at).getTime() + quote.valid_days * 24 * 60 * 60 * 1000
  );
  const isExpired = new Date() > validUntil;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status */}
      <View style={[styles.statusBar, { backgroundColor: statusColor(quote.status) + "18" }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor(quote.status) }]} />
        <Text style={[styles.statusLabel, { color: statusColor(quote.status) }]}>
          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
        </Text>
        {isExpired && quote.status !== "accepted" && (
          <Text style={styles.expiredTag}>Expired</Text>
        )}
      </View>

      {/* Customer Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.customerName}>{quote.customer_name}</Text>
        <Text style={styles.detail}>{quote.job_address}</Text>
        {quote.customer_phone && <Text style={styles.detail}>{quote.customer_phone}</Text>}
        {quote.customer_email && <Text style={styles.detail}>{quote.customer_email}</Text>}
      </View>

      {/* Scope */}
      {quote.scope_of_work && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scope of Work</Text>
          <Text style={styles.scopeText}>{quote.scope_of_work}</Text>
        </View>
      )}

      {/* Line Items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Line Items</Text>
        {quote.line_items.map((item, i) => (
          <View key={i} style={styles.lineItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineDesc}>{item.description}</Text>
              <Text style={styles.lineQty}>
                {item.quantity} x {formatCurrency(item.unit_price)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>
              {formatCurrency(item.quantity * item.unit_price)}
            </Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCurrency(quote.subtotal)}</Text>
        </View>
        {quote.tax_rate > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax ({quote.tax_rate}%)</Text>
            <Text style={styles.totalValue}>{formatCurrency(quote.tax_amount)}</Text>
          </View>
        )}
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(quote.total)}</Text>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Timeline</Text>
        {[
          { label: "Created", time: quote.created_at },
          { label: "Sent", time: quote.sent_at },
          { label: "Viewed", time: quote.viewed_at },
          { label: "Accepted", time: quote.accepted_at },
        ].map(({ label, time }) => (
          <View key={label} style={styles.timelineRow}>
            <View style={[styles.timelineDot, { backgroundColor: time ? colors.green : colors.gray[200] }]} />
            <Text style={[styles.timelineLabel, !time && styles.timelineMuted]}>{label}</Text>
            <Text style={styles.timelineDate}>{time ? formatDate(time) : "-"}</Text>
          </View>
        ))}
        <View style={styles.timelineRow}>
          <View style={[styles.timelineDot, { backgroundColor: isExpired && quote.status !== "accepted" ? colors.red : colors.gray[200] }]} />
          <Text style={styles.timelineLabel}>Valid until</Text>
          <Text style={[styles.timelineDate, isExpired && quote.status !== "accepted" && { color: colors.red }]}>
            {formatDate(validUntil.toISOString())}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {quote.status === "draft" && (
          <>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate("EditQuote", { quoteId: quote.id })}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.btnDisabled]}
              onPress={handleSend}
              disabled={sending || (!quote.customer_phone && !quote.customer_email)}
            >
              {sending ? (
                <ActivityIndicator color={colors.black} size="small" />
              ) : (
                <Text style={styles.sendBtnText}>Send Quote</Text>
              )}
            </TouchableOpacity>
          </>
        )}
        {(quote.status === "sent" || quote.status === "viewed") && (
          <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
            <Text style={styles.declineBtnText}>Cancel Quote</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.outlineBtn} onPress={handleShare}>
          <Text style={styles.outlineBtnText}>Share Link</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={handleDuplicate}>
          <Text style={styles.outlineBtnText}>Duplicate</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  statusBar: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: spacing.md, gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 15, fontWeight: "700" },
  expiredTag: { marginLeft: "auto", fontSize: 12, fontWeight: "600", color: colors.red, backgroundColor: colors.red + "18", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 11, fontWeight: "700", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  customerName: { fontSize: 18, fontWeight: "700", color: colors.black, marginBottom: 4 },
  detail: { fontSize: 14, color: colors.gray[500], marginBottom: 2 },
  scopeText: { fontSize: 14, color: colors.gray[700], lineHeight: 20 },
  lineItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  lineDesc: { fontSize: 14, fontWeight: "600", color: colors.gray[700] },
  lineQty: { fontSize: 12, color: colors.gray[400], marginTop: 2 },
  lineTotal: { fontSize: 14, fontWeight: "600", color: colors.black },
  divider: { height: 1, backgroundColor: colors.gray[200], marginVertical: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  totalLabel: { fontSize: 14, color: colors.gray[500] },
  totalValue: { fontSize: 14, color: colors.gray[500] },
  grandTotal: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.gray[200] },
  grandTotalLabel: { fontSize: 16, fontWeight: "800", color: colors.black },
  grandTotalValue: { fontSize: 16, fontWeight: "800", color: colors.black },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLabel: { flex: 1, fontSize: 14, color: colors.gray[700] },
  timelineMuted: { color: colors.gray[400] },
  timelineDate: { fontSize: 13, color: colors.gray[500] },
  actions: { gap: 10, marginTop: 4 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: "center" },
  sendBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  editBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  editBtnText: { fontSize: 15, fontWeight: "600", color: colors.black },
  declineBtn: { backgroundColor: colors.red + "10", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.red + "30" },
  declineBtnText: { fontSize: 15, fontWeight: "600", color: colors.red },
  outlineBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  outlineBtnText: { fontSize: 15, fontWeight: "600", color: colors.gray[700] },
  btnDisabled: { opacity: 0.6 },
});
