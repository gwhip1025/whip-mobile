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
  TextInput,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { apiFetch, APP_URL } from "../lib/api";
import { Invoice, PaymentStatus } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "InvoiceDetail">;

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

export default function InvoiceDetailScreen({ route }: Props) {
  const { invoiceId } = route.params as { invoiceId: string };
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchInvoice = useCallback(async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    setInvoice(data as Invoice | null);
    setLoading(false);
  }, [invoiceId]);

  useFocusEffect(
    useCallback(() => {
      fetchInvoice();
    }, [fetchInvoice])
  );

  async function updateInvoice(updates: Partial<Invoice>) {
    if (!invoice) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update");
      }
      await fetchInvoice();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid() {
    if (!invoice) return;
    await updateInvoice({ payment_status: "paid", amount_paid: invoice.total });
  }

  async function handleMarkUnpaid() {
    await updateInvoice({ payment_status: "unpaid", amount_paid: 0 });
  }

  function openPartialPayment() {
    if (!invoice) return;
    setPaymentAmount(String(invoice.amount_paid ?? 0));
    setPaymentModalOpen(true);
  }

  async function submitPartialPayment() {
    if (!invoice) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt < 0) {
      return Alert.alert("Invalid amount", "Enter the total amount received so far.");
    }
    const clamped = Math.min(amt, invoice.total);
    const status: PaymentStatus =
      clamped >= invoice.total ? "paid" : clamped > 0 ? "partial" : "unpaid";
    setPaymentModalOpen(false);
    await updateInvoice({ payment_status: status, amount_paid: clamped });
  }

  async function handleShare() {
    if (!invoice) return;
    const url = `${APP_URL}/i/${invoice.public_token}`;
    await Share.share({ message: `Invoice #${invoice.invoice_number}: ${url}`, url });
  }

  async function handleSharePdf() {
    if (!invoice) return;
    const pdfUrl = `${APP_URL}/api/invoices/${invoice.id}/pdf`;
    await Share.share({
      message: `Download invoice PDF: ${pdfUrl}`,
      url: pdfUrl,
    });
  }

  if (loading || !invoice) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusClr = paymentColor(invoice.payment_status);
  const remaining = invoice.total - (invoice.amount_paid ?? 0);

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.statusBar, { backgroundColor: statusClr + "18" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusClr }]} />
          <Text style={[styles.statusLabel, { color: statusClr }]}>
            {invoice.payment_status === "paid"
              ? "Paid in full"
              : invoice.payment_status === "partial"
                ? `Partially paid — ${formatCurrency(remaining)} left`
                : "Unpaid"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <Text style={styles.customerName}>{invoice.customer_name}</Text>
          <Text style={styles.detail}>{invoice.job_address}</Text>
          {invoice.customer_phone ? <Text style={styles.detail}>{invoice.customer_phone}</Text> : null}
          {invoice.customer_email ? <Text style={styles.detail}>{invoice.customer_email}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invoice</Text>
          <View style={styles.kv}><Text style={styles.kvLabel}>Number</Text><Text style={styles.kvValue}>#{invoice.invoice_number}</Text></View>
          <View style={styles.kv}><Text style={styles.kvLabel}>Issued</Text><Text style={styles.kvValue}>{formatDate(invoice.created_at)}</Text></View>
          {invoice.due_date ? (
            <View style={styles.kv}><Text style={styles.kvLabel}>Due</Text><Text style={styles.kvValue}>{formatDate(invoice.due_date)}</Text></View>
          ) : null}
        </View>

        {invoice.scope_of_work ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Scope of Work</Text>
            <Text style={styles.scopeText}>{invoice.scope_of_work}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Line Items</Text>
          {invoice.line_items.map((li, i) => (
            <View key={i} style={styles.lineItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineDesc}>{li.description}</Text>
                <Text style={styles.lineQty}>
                  {li.quantity} x {formatCurrency(li.unit_price)}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatCurrency(li.quantity * li.unit_price)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
          </View>
          {invoice.tax_rate > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({invoice.tax_rate}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.tax_amount)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(invoice.total)}</Text>
          </View>
          {invoice.amount_paid > 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Paid</Text>
                <Text style={[styles.totalValue, { color: colors.green }]}>
                  {formatCurrency(invoice.amount_paid)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Remaining</Text>
                <Text style={styles.totalValue}>{formatCurrency(remaining)}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.actions}>
          {invoice.payment_status !== "paid" ? (
            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.btnDisabled]}
              onPress={handleMarkPaid}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>Mark Paid in Full</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.outlineBtn} onPress={handleMarkUnpaid} disabled={saving}>
              <Text style={styles.outlineBtnText}>Mark Unpaid</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={openPartialPayment}
            disabled={saving}
          >
            <Text style={styles.outlineBtnText}>Record Partial Payment</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.outlineBtn} onPress={handleShare}>
            <Text style={styles.outlineBtnText}>Share Link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleSharePdf}>
            <Text style={styles.outlineBtnText}>Share PDF</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Partial payment modal */}
      <Modal
        visible={paymentModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentModalOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitle}>Record payment</Text>
            <Text style={styles.overlaySub}>
              Total received so far (max {formatCurrency(invoice.total)}).
            </Text>
            <TextInput
              style={styles.overlayInput}
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              placeholder="0.00"
              placeholderTextColor={colors.gray[400]}
              keyboardType="decimal-pad"
            />
            <View style={styles.overlayBtnRow}>
              <TouchableOpacity
                style={[styles.outlineBtn, { flex: 1 }]}
                onPress={() => setPaymentModalOpen(false)}
              >
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={submitPartialPayment}
              >
                <Text style={styles.primaryBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  statusBar: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, marginBottom: spacing.md, gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 15, fontWeight: "700" },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 11, fontWeight: "700", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  customerName: { fontSize: 18, fontWeight: "700", color: colors.black, marginBottom: 4 },
  detail: { fontSize: 14, color: colors.gray[500], marginBottom: 2 },
  kv: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  kvLabel: { fontSize: 14, color: colors.gray[500] },
  kvValue: { fontSize: 14, color: colors.gray[700], fontWeight: "600" },
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
  actions: { gap: 10 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  outlineBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  outlineBtnText: { fontSize: 15, fontWeight: "600", color: colors.gray[700] },
  btnDisabled: { opacity: 0.6 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  overlayCard: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.lg },
  overlayTitle: { fontSize: 18, fontWeight: "700", color: colors.black, marginBottom: 4 },
  overlaySub: { fontSize: 13, color: colors.gray[500], marginBottom: 16 },
  overlayInput: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 14, fontSize: 18, borderWidth: 1, borderColor: colors.gray[200], color: colors.black, marginBottom: 16, textAlign: "center", fontWeight: "700" },
  overlayBtnRow: { flexDirection: "row", gap: 10 },
});
