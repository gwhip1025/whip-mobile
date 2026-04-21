import React, { useCallback, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Quote, LineItem } from "../types";
import { calculateTotals, formatCurrency } from "../lib/utils";
import { colors, spacing } from "../lib/theme";
import Constants from "expo-constants";

type Props = NativeStackScreenProps<any, "NewQuote" | "EditQuote">;

let nextId = 1;
function makeId() {
  return `temp-${nextId++}-${Date.now()}`;
}

export default function QuoteFormScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const quoteId = (route.params as any)?.quoteId as string | undefined;
  const appUrl = Constants.expoConfig?.extra?.appUrl ?? "https://whip1.vercel.app";

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [validDays, setValidDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: makeId(), description: "", quantity: 1, unit_price: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(!quoteId);

  useFocusEffect(
    useCallback(() => {
      if (!quoteId) return;
      supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single()
        .then(({ data }) => {
          if (!data) return;
          const q = data as Quote;
          setCustomerName(q.customer_name);
          setCustomerPhone(q.customer_phone ?? "");
          setCustomerEmail(q.customer_email ?? "");
          setJobAddress(q.job_address);
          setScopeOfWork(q.scope_of_work ?? "");
          setTaxRate(String(q.tax_rate));
          setValidDays(String(q.valid_days));
          setNotes(q.notes ?? "");
          setLineItems(q.line_items.length ? q.line_items : [{ id: makeId(), description: "", quantity: 1, unit_price: 0 }]);
          setLoaded(true);
        });
    }, [quoteId])
  );

  const tax = parseFloat(taxRate) || 0;
  const { subtotal, taxAmount, total } = calculateTotals(lineItems, tax);

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    setLineItems((prev) => [...prev, { id: makeId(), description: "", quantity: 1, unit_price: 0 }]);
  }

  function removeItem(id: string) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }

  function buildPayload() {
    return {
      contractor_id: user!.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      customer_email: customerEmail.trim() || null,
      job_address: jobAddress.trim(),
      scope_of_work: scopeOfWork.trim() || null,
      line_items: lineItems,
      tax_rate: tax,
      subtotal,
      tax_amount: taxAmount,
      total,
      valid_days: parseInt(validDays) || 30,
      notes: notes.trim() || null,
      status: "draft" as const,
    };
  }

  async function handleSave() {
    if (!customerName.trim() || !jobAddress.trim()) {
      Alert.alert("Required", "Customer name and job address are required.");
      return;
    }
    setSaving(true);
    try {
      if (quoteId) {
        const { contractor_id, status, ...updateData } = buildPayload();
        await supabase.from("quotes").update(updateData).eq("id", quoteId);
        Alert.alert("Saved", "Quote updated.");
        navigation.goBack();
      } else {
        const { data, error } = await supabase.from("quotes").insert(buildPayload()).select().single();
        if (error) throw error;
        Alert.alert("Saved", "Draft saved.");
        navigation.replace("QuoteDetail", { quoteId: data.id });
      }
    } catch {
      Alert.alert("Error", "Failed to save quote.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!customerName.trim() || !jobAddress.trim()) {
      Alert.alert("Required", "Customer name and job address are required.");
      return;
    }
    if (!customerPhone.trim() && !customerEmail.trim()) {
      Alert.alert("Required", "Add a phone number or email to send this quote.");
      return;
    }
    setSending(true);
    try {
      let id = quoteId;
      if (!id) {
        const { data, error } = await supabase.from("quotes").insert(buildPayload()).select().single();
        if (error) throw error;
        id = data.id;
      } else {
        const { contractor_id, status, ...updateData } = buildPayload();
        await supabase.from("quotes").update(updateData).eq("id", id);
      }

      const session = await supabase.auth.getSession();
      const res = await fetch(`${appUrl}/api/quotes/${id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.data.session?.access_token}` },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send");
      }

      Alert.alert("Sent!", "Your customer will receive the quote shortly.");
      navigation.replace("QuoteDetail", { quoteId: id! });
    } catch (e: any) {
      Alert.alert("Send failed", e.message || "Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Customer */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <TextInput style={styles.input} placeholder="Full Name *" placeholderTextColor={colors.gray[400]} value={customerName} onChangeText={setCustomerName} />
          <TextInput style={styles.input} placeholder="Job Address *" placeholderTextColor={colors.gray[400]} value={jobAddress} onChangeText={setJobAddress} />
          <TextInput style={styles.input} placeholder="Phone (for SMS)" placeholderTextColor={colors.gray[400]} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.gray[400]} value={customerEmail} onChangeText={setCustomerEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>

        {/* Scope */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scope of Work</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            placeholder="Describe the work..."
            placeholderTextColor={colors.gray[400]}
            value={scopeOfWork}
            onChangeText={setScopeOfWork}
            multiline
          />
        </View>

        {/* Line Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Line Items</Text>
          {lineItems.map((item, i) => (
            <View key={item.id} style={styles.lineItemRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Description"
                placeholderTextColor={colors.gray[400]}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, "description", v)}
              />
              <View style={styles.lineItemNumbers}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Qty"
                  placeholderTextColor={colors.gray[400]}
                  value={String(item.quantity)}
                  onChangeText={(v) => updateItem(item.id, "quantity", parseFloat(v) || 0)}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Price"
                  placeholderTextColor={colors.gray[400]}
                  value={item.unit_price ? String(item.unit_price) : ""}
                  onChangeText={(v) => updateItem(item.id, "unit_price", parseFloat(v) || 0)}
                  keyboardType="numeric"
                />
                {lineItems.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>X</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={addItem}>
            <Text style={styles.addBtnText}>+ Add Line Item</Text>
          </TouchableOpacity>

          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.taxRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <TextInput
                style={[styles.input, { width: 50, textAlign: "center", paddingVertical: 4 }]}
                value={taxRate}
                onChangeText={setTaxRate}
                keyboardType="numeric"
              />
              <Text style={styles.totalLabel}>%</Text>
            </View>
            <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: colors.gray[200], paddingTop: 8, marginTop: 4 }]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 14, color: colors.gray[600] }}>Valid for</Text>
            <TextInput
              style={[styles.input, { width: 60, textAlign: "center" }]}
              value={validDays}
              onChangeText={setValidDays}
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 14, color: colors.gray[600] }}>days</Text>
          </View>
          <TextInput
            style={[styles.input, { minHeight: 60, textAlignVertical: "top", marginTop: 10 }]}
            placeholder="Internal notes (not shown on quote)"
            placeholderTextColor={colors.gray[400]}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* SMS Consent */}
        {customerPhone.trim() !== "" && (
          <Text style={styles.consent}>
            By sending this quote, you confirm that your customer has consented to receive an SMS. Message and data rates may apply. Customer can reply STOP to opt out.
          </Text>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={saving || sending}
          >
            {saving ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={styles.saveBtnText}>Save Draft</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (sending || saving) && styles.btnDisabled]}
            onPress={handleSend}
            disabled={saving || sending}
          >
            {sending ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={styles.sendBtnText}>Send Quote</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 11, fontWeight: "700", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  input: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: colors.gray[200], color: colors.black, marginBottom: 8 },
  lineItemRow: { marginBottom: 8 },
  lineItemNumbers: { flexDirection: "row", gap: 8, alignItems: "center" },
  smallInput: { width: 70, textAlign: "center" },
  removeBtn: { padding: 8 },
  removeBtnText: { fontSize: 16, fontWeight: "700", color: colors.red },
  addBtn: { paddingVertical: 8 },
  addBtnText: { fontSize: 14, fontWeight: "600", color: colors.blue },
  divider: { height: 1, backgroundColor: colors.gray[200], marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  taxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  totalLabel: { fontSize: 14, color: colors.gray[500] },
  totalValue: { fontSize: 14, color: colors.gray[500] },
  grandLabel: { fontSize: 16, fontWeight: "800", color: colors.black },
  grandValue: { fontSize: 16, fontWeight: "800", color: colors.black },
  consent: { fontSize: 11, color: colors.gray[400], lineHeight: 16, textAlign: "center", marginBottom: 12, paddingHorizontal: spacing.sm },
  actions: { gap: 10 },
  saveBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  saveBtnText: { fontSize: 15, fontWeight: "600", color: colors.black },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: "center" },
  sendBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  btnDisabled: { opacity: 0.6 },
});
