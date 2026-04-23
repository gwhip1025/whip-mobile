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
import { LineItemFormData, Invoice } from "../types";
import { calculateTotals, formatCurrency } from "../lib/utils";
import { colors, spacing } from "../lib/theme";

type Props = NativeStackScreenProps<any, "NewInvoice">;

let nextId = 1;
function makeId() {
  return `temp-${nextId++}-${Date.now()}`;
}
function emptyItem(): LineItemFormData {
  return { id: makeId(), description: "", quantity: "", unit_price: "" };
}

export default function InvoiceFormScreen({ navigation }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemFormData[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const tax = parseFloat(taxRate) || 0;
  const parsed = lineItems.map((li) => ({
    id: li.id,
    description: li.description,
    quantity: Number(li.quantity) || 0,
    unit_price: Number(li.unit_price) || 0,
  }));
  const { subtotal, taxAmount, total } = calculateTotals(parsed, tax);

  function updateItem(id: string, field: keyof LineItemFormData, value: string | number) {
    setLineItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }
  function addItem() {
    setLineItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(id: string) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleSave() {
    if (!customerName.trim() || !jobAddress.trim()) {
      return Alert.alert("Required", "Customer name and job address are required.");
    }
    const hasEmpty = lineItems.some(
      (i) =>
        i.description &&
        (!i.quantity ||
          Number(i.quantity) <= 0 ||
          i.unit_price === "" ||
          i.unit_price === null)
    );
    if (hasEmpty) {
      return Alert.alert("Fix line items", "Every line item needs a quantity > 0 and a price.");
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/invoices`, {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          customer_email: customerEmail.trim() || null,
          job_address: jobAddress.trim(),
          scope_of_work: scopeOfWork.trim() || null,
          line_items: parsed,
          tax_rate: tax,
          due_date: dueDate.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create invoice");
      }
      const inv = (await res.json()) as Invoice;
      navigation.replace("InvoiceDetail", { invoiceId: inv.id });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <TextInput style={styles.input} placeholder="Full Name *" placeholderTextColor={colors.gray[400]} value={customerName} onChangeText={setCustomerName} />
          <TextInput style={styles.input} placeholder="Job Address *" placeholderTextColor={colors.gray[400]} value={jobAddress} onChangeText={setJobAddress} />
          <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={colors.gray[400]} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.gray[400]} value={customerEmail} onChangeText={setCustomerEmail} keyboardType="email-address" autoCapitalize="none" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scope of Work</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            placeholder="What was done..."
            placeholderTextColor={colors.gray[400]}
            value={scopeOfWork}
            onChangeText={setScopeOfWork}
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Line Items</Text>
          {lineItems.map((item) => (
            <View key={item.id} style={styles.lineRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Description"
                placeholderTextColor={colors.gray[400]}
                value={item.description}
                onChangeText={(v) => updateItem(item.id, "description", v)}
              />
              <View style={styles.numbers}>
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Qty"
                  placeholderTextColor={colors.gray[400]}
                  value={item.quantity === "" ? "" : String(item.quantity)}
                  onChangeText={(v) => updateItem(item.id, "quantity", v === "" ? "" : parseFloat(v))}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.smallInput]}
                  placeholder="Price"
                  placeholderTextColor={colors.gray[400]}
                  value={item.unit_price === "" ? "" : String(item.unit_price)}
                  onChangeText={(v) => updateItem(item.id, "unit_price", v === "" ? "" : parseFloat(v))}
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
                style={[styles.input, { width: 50, textAlign: "center", marginBottom: 0, paddingVertical: 4 }]}
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <Text style={styles.label}>Due date (YYYY-MM-DD, optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="2026-05-22"
            placeholderTextColor={colors.gray[400]}
            value={dueDate}
            onChangeText={setDueDate}
          />
          <TextInput
            style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
            placeholder="Internal notes (not shown to customer)"
            placeholderTextColor={colors.gray[400]}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.black} size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Create Invoice</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 11, fontWeight: "700", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  input: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: colors.gray[200], color: colors.black, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: colors.gray[600], marginBottom: 4 },
  lineRow: { marginBottom: 8 },
  numbers: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  smallInput: { width: 70, textAlign: "center", marginBottom: 0 },
  removeBtn: { padding: 8 },
  removeBtnText: { fontSize: 14, fontWeight: "700", color: colors.red },
  addBtn: { paddingVertical: 8 },
  addBtnText: { fontSize: 14, fontWeight: "600", color: colors.blue },
  divider: { height: 1, backgroundColor: colors.gray[200], marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  taxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  totalLabel: { fontSize: 14, color: colors.gray[500] },
  totalValue: { fontSize: 14, color: colors.gray[500] },
  grandLabel: { fontSize: 16, fontWeight: "800", color: colors.black },
  grandValue: { fontSize: 16, fontWeight: "800", color: colors.black },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  btnDisabled: { opacity: 0.6 },
});
