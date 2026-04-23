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
import { apiFetch, APP_URL } from "../lib/api";
import {
  Quote,
  QuoteOption,
  QuoteReminder,
  LineItem,
  Invoice,
} from "../types";
import { formatCurrency, formatDate, statusColor } from "../lib/utils";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "QuoteDetail">;

export default function QuoteDetailScreen({ route, navigation }: Props) {
  const { quoteId } = route.params as { quoteId: string };
  const { user } = useAuth();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [reminders, setReminders] = useState<QuoteReminder[]>([]);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [{ data: qData }, { data: optData }, { data: remData }, { data: invData }] =
      await Promise.all([
        supabase.from("quotes").select("*").eq("id", quoteId).single(),
        supabase
          .from("quote_options")
          .select("*")
          .eq("quote_id", quoteId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("quote_reminders")
          .select("*")
          .eq("quote_id", quoteId)
          .order("scheduled_for", { ascending: true }),
        supabase.from("invoices").select("id").eq("quote_id", quoteId).maybeSingle(),
      ]);
    setQuote(qData as Quote | null);
    setOptions((optData as QuoteOption[]) ?? []);
    setReminders((remData as QuoteReminder[]) ?? []);
    setExistingInvoiceId((invData as any)?.id ?? null);
    setLoading(false);
  }, [quoteId, user]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  async function handleSend() {
    if (!quote) return;
    Alert.alert("Send Quote", `Send this quote to ${quote.customer_name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setSending(true);
          const res = await apiFetch(`/api/quotes/${quote.id}/send`, { method: "POST" });
          setSending(false);
          if (res.ok) {
            Alert.alert("Sent!", "Your customer will receive the quote shortly.");
            fetchAll();
          } else {
            const err = await res.json().catch(() => ({}));
            Alert.alert("Send failed", err.error ?? "Please try again.");
          }
        },
      },
    ]);
  }

  async function handleShare() {
    if (!quote) return;
    const publicUrl = `${APP_URL}/q/${quote.public_token}`;
    await Share.share({ message: `Check out this quote: ${publicUrl}`, url: publicUrl });
  }

  async function handleSharePdf() {
    if (!quote) return;
    const pdfUrl = `${APP_URL}/api/quotes/${quote.id}/pdf`;
    await Share.share({
      message: `Download quote PDF: ${pdfUrl}`,
      url: pdfUrl,
    });
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
        is_multi_option: quote.is_multi_option,
        status: "draft",
      })
      .select()
      .single();

    if (error || !data) {
      Alert.alert("Error", "Failed to duplicate quote.");
      return;
    }

    // Duplicate options if any
    if (quote.is_multi_option && options.length > 0) {
      const rows = options.map((o) => ({
        quote_id: data.id,
        name: o.name,
        description: o.description,
        line_items: o.line_items,
        subtotal: o.subtotal,
        tax_amount: o.tax_amount,
        total: o.total,
        sort_order: o.sort_order,
      }));
      await supabase.from("quote_options").insert(rows);
    }

    navigation.replace("QuoteDetail", { quoteId: data.id });
  }

  async function handleDecline() {
    if (!quote) return;
    Alert.alert(
      "Cancel Quote",
      "Cancel this quote? The customer will no longer be able to accept it.",
      [
        { text: "Keep Quote", style: "cancel" },
        {
          text: "Cancel Quote",
          style: "destructive",
          onPress: async () => {
            await supabase.from("quotes").update({ status: "declined" }).eq("id", quote.id);
            fetchAll();
          },
        },
      ]
    );
  }

  async function handleSaveTemplate() {
    if (!quote) return;
    const defaultName = `Template from ${quote.customer_name || "quote"}`;

    const save = async (name: string) => {
      try {
        const res = await apiFetch(`/api/templates`, {
          method: "POST",
          body: JSON.stringify({
            name,
            line_items: quote.line_items,
            tax_rate: quote.tax_rate,
            scope_of_work: quote.scope_of_work,
            valid_days: quote.valid_days,
          }),
        });
        if (!res.ok) throw new Error();
        Alert.alert("Saved", "Template saved. Pick it on your next quote.");
      } catch {
        Alert.alert("Error", "Failed to save template.");
      }
    };

    // iOS supports Alert.prompt for a text input; Android doesn't — fall back to a default name.
    const promptFn = (Alert as { prompt?: typeof Alert.prompt }).prompt;
    if (typeof promptFn === "function") {
      promptFn(
        "Save as template",
        "Name this template so you can reuse it later.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (value?: string) => {
              const name = (value ?? "").trim() || defaultName;
              save(name);
            },
          },
        ],
        "plain-text",
        defaultName
      );
    } else {
      save(defaultName);
    }
  }

  async function handleSaveLineItems() {
    if (!quote) return;
    const items = collectAllLineItems(quote, options);
    if (items.length === 0) {
      Alert.alert("Nothing to save", "Add line items to the quote first.");
      return;
    }
    try {
      await Promise.all(
        items.map((li) =>
          apiFetch(`/api/saved-items`, {
            method: "POST",
            body: JSON.stringify({
              description: li.description,
              unit_price: li.unit_price,
            }),
          })
        )
      );
      Alert.alert("Saved", `${items.length} item${items.length === 1 ? "" : "s"} saved for reuse.`);
    } catch {
      Alert.alert("Error", "Failed to save items.");
    }
  }

  async function handleConvertToInvoice() {
    if (!quote) return;
    if (existingInvoiceId) {
      navigation.navigate("InvoiceDetail", { invoiceId: existingInvoiceId });
      return;
    }
    Alert.alert(
      "Create Invoice",
      "Turn this accepted quote into an invoice? Due date defaults to 30 days.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create",
          onPress: async () => {
            setConverting(true);
            try {
              const res = await apiFetch(`/api/quotes/${quote.id}/convert`, { method: "POST" });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                if (res.status === 409 && body.invoice_id) {
                  setExistingInvoiceId(body.invoice_id);
                  navigation.navigate("InvoiceDetail", { invoiceId: body.invoice_id });
                  return;
                }
                throw new Error(body.error || "Failed to create invoice");
              }
              const inv = body as Invoice;
              setExistingInvoiceId(inv.id);
              navigation.navigate("InvoiceDetail", { invoiceId: inv.id });
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to create invoice.");
            } finally {
              setConverting(false);
            }
          },
        },
      ]
    );
  }

  async function handleCancelReminder(reminderId: string) {
    try {
      const res = await apiFetch(`/api/reminders/${reminderId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed");
      }
      fetchAll();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to cancel reminder.");
    }
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
  const pendingReminders = reminders.filter((r) => r.status === "pending");

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
        {quote.customer_phone ? <Text style={styles.detail}>{quote.customer_phone}</Text> : null}
        {quote.customer_email ? <Text style={styles.detail}>{quote.customer_email}</Text> : null}
      </View>

      {quote.scope_of_work ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scope of Work</Text>
          <Text style={styles.scopeText}>{quote.scope_of_work}</Text>
        </View>
      ) : null}

      {/* Multi-option block */}
      {quote.is_multi_option && options.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Options</Text>
          {options.map((opt) => {
            const isSelected = quote.selected_option_id === opt.id;
            return (
              <View
                key={opt.id}
                style={[styles.optionBlock, isSelected && styles.optionBlockSelected]}
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionName}>{opt.name}</Text>
                  {isSelected ? (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>Chosen</Text>
                    </View>
                  ) : null}
                </View>
                {opt.description ? (
                  <Text style={styles.optionDesc}>{opt.description}</Text>
                ) : null}
                {opt.line_items.map((li, i) => (
                  <View key={i} style={styles.lineItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineDesc}>{li.description}</Text>
                      <Text style={styles.lineQty}>
                        {li.quantity} x {formatCurrency(li.unit_price)}
                      </Text>
                    </View>
                    <Text style={styles.lineTotal}>
                      {formatCurrency(li.quantity * li.unit_price)}
                    </Text>
                  </View>
                ))}
                <View style={styles.divider} />
                <View style={styles.totalRow}>
                  <Text style={styles.grandTotalLabel}>Option Total</Text>
                  <Text style={styles.grandTotalValue}>{formatCurrency(opt.total)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        /* Standard line items */
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
          {quote.tax_rate > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({quote.tax_rate}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(quote.tax_amount)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(quote.total)}</Text>
          </View>
        </View>
      )}

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
          <View
            style={[
              styles.timelineDot,
              { backgroundColor: isExpired && quote.status !== "accepted" ? colors.red : colors.gray[200] },
            ]}
          />
          <Text style={styles.timelineLabel}>Valid until</Text>
          <Text
            style={[
              styles.timelineDate,
              isExpired && quote.status !== "accepted" && { color: colors.red },
            ]}
          >
            {formatDate(validUntil.toISOString())}
          </Text>
        </View>
      </View>

      {/* Reminders */}
      {pendingReminders.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scheduled Reminders</Text>
          {pendingReminders.map((r) => (
            <View key={r.id} style={styles.reminderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderLabel}>
                  {r.reminder_type === "auto_followup" ? "Auto follow-up" : "Reminder"}
                </Text>
                <Text style={styles.reminderDate}>{formatDate(r.scheduled_for)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleCancelReminder(r.id)}
                style={styles.reminderCancelBtn}
              >
                <Text style={styles.reminderCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        {quote.status === "draft" ? (
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
        ) : null}

        {quote.status === "accepted" ? (
          <TouchableOpacity
            style={[styles.sendBtn, converting && styles.btnDisabled]}
            onPress={handleConvertToInvoice}
            disabled={converting}
          >
            {converting ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.sendBtnText}>
                {existingInvoiceId ? "View Invoice" : "Create Invoice"}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        {(quote.status === "sent" || quote.status === "viewed") && (
          <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
            <Text style={styles.declineBtnText}>Cancel Quote</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.outlineBtn} onPress={handleShare}>
          <Text style={styles.outlineBtnText}>Share Link</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={handleSharePdf}>
          <Text style={styles.outlineBtnText}>Share PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={handleSaveTemplate}>
          <Text style={styles.outlineBtnText}>Save as Template</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={handleSaveLineItems}>
          <Text style={styles.outlineBtnText}>Save Line Items</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineBtn} onPress={handleDuplicate}>
          <Text style={styles.outlineBtnText}>Duplicate</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function collectAllLineItems(quote: Quote, options: QuoteOption[]): LineItem[] {
  const seen = new Set<string>();
  const out: LineItem[] = [];
  const push = (li: LineItem) => {
    const key = `${li.description.trim().toLowerCase()}|${li.unit_price}`;
    if (li.description.trim() && !seen.has(key)) {
      seen.add(key);
      out.push(li);
    }
  };
  (quote.line_items ?? []).forEach(push);
  options.forEach((o) => (o.line_items ?? []).forEach(push));
  return out;
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
  optionBlock: { borderWidth: 1, borderColor: colors.gray[200], borderRadius: 10, padding: 12, marginBottom: 10 },
  optionBlockSelected: { borderColor: colors.green, backgroundColor: colors.green + "08" },
  optionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  optionName: { fontSize: 16, fontWeight: "700", color: colors.black, flex: 1 },
  optionDesc: { fontSize: 13, color: colors.gray[500], marginBottom: 8 },
  selectedBadge: { backgroundColor: colors.green, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  selectedBadgeText: { color: colors.white, fontSize: 11, fontWeight: "700" },
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
  reminderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  reminderLabel: { fontSize: 14, fontWeight: "600", color: colors.gray[700] },
  reminderDate: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  reminderCancelBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.red + "10", borderRadius: 8 },
  reminderCancelText: { fontSize: 13, fontWeight: "600", color: colors.red },
  actions: { gap: 10, marginTop: 4 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, alignItems: "center" },
  sendBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  editBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  editBtnText: { fontSize: 15, fontWeight: "600", color: colors.black },
  declineBtn: { backgroundColor: colors.red + "10", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.red + "30" },
  declineBtnText: { fontSize: 15, fontWeight: "600", color: colors.red },
  outlineBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  outlineBtnText: { fontSize: 15, fontWeight: "600", color: colors.gray[700] },
  btnDisabled: { opacity: 0.6 },
});
