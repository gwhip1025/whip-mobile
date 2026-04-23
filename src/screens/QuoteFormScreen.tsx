import React, { useCallback, useEffect, useState } from "react";
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
  Switch,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { apiFetch, APP_URL } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Quote,
  QuoteOption,
  LineItemFormData,
  SavedLineItem,
  QuoteTemplate,
} from "../types";
import { calculateTotals, formatCurrency } from "../lib/utils";
import { colors, spacing } from "../lib/theme";
import { QuotePhotoUploader } from "../components/QuotePhotoUploader";

type Props = NativeStackScreenProps<any, "NewQuote" | "EditQuote">;

let nextId = 1;
function makeId() {
  return `temp-${nextId++}-${Date.now()}`;
}

function emptyItem(): LineItemFormData {
  return { id: makeId(), description: "", quantity: "", unit_price: "" };
}

interface OptionDraft {
  id: string;
  name: string;
  description: string;
  line_items: LineItemFormData[];
}

function emptyOption(name: string): OptionDraft {
  return { id: makeId(), name, description: "", line_items: [emptyItem()] };
}

function parseItems(items: LineItemFormData[]) {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.unit_price) || 0,
  }));
}

export default function QuoteFormScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const quoteId = (route.params as any)?.quoteId as string | undefined;
  const templateIdParam = (route.params as any)?.templateId as string | undefined;

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [notes, setNotes] = useState("");

  // Single-option line items
  const [lineItems, setLineItems] = useState<LineItemFormData[]>([emptyItem()]);

  // Multi-option — seeds a single "Good" option; user adds Better/Best/Custom via dropdown.
  const [isMultiOption, setIsMultiOption] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([emptyOption("Good")]);
  const [addOptionMenuOpen, setAddOptionMenuOpen] = useState(false);

  // Saved items
  const [savedItems, setSavedItems] = useState<SavedLineItem[]>([]);
  const [pickerTarget, setPickerTarget] = useState<
    | { kind: "main"; itemId: string }
    | { kind: "option"; optionId: string; itemId: string }
    | null
  >(null);

  // Templates
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(!quoteId);
  // Tracks an auto-created draft id when a new-quote user attaches a photo
  // before typing customer info. Mirrors the web draftQuoteId pattern in
  // components/QuoteForm.tsx.
  const [draftQuoteId, setDraftQuoteId] = useState<string | null>(quoteId ?? null);

  useFocusEffect(
    useCallback(() => {
      if (!quoteId) return;
      (async () => {
        const { data } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", quoteId)
          .single();
        if (!data) return;
        const q = data as Quote;
        setCustomerName(q.customer_name);
        setCustomerPhone(q.customer_phone ?? "");
        setCustomerEmail(q.customer_email ?? "");
        setJobAddress(q.job_address);
        setScopeOfWork(q.scope_of_work ?? "");
        setTaxRate(q.tax_rate ? String(q.tax_rate) : "");
        setValidDays(String(q.valid_days));
        setNotes(q.notes ?? "");
        setLineItems(
          q.line_items.length
            ? q.line_items.map((li) => ({
                id: li.id ?? makeId(),
                description: li.description,
                quantity: li.quantity,
                unit_price: li.unit_price,
              }))
            : [emptyItem()]
        );
        setIsMultiOption(q.is_multi_option === true);

        if (q.is_multi_option) {
          const { data: optData } = await supabase
            .from("quote_options")
            .select("*")
            .eq("quote_id", q.id)
            .order("sort_order", { ascending: true });
          const opts = (optData ?? []) as QuoteOption[];
          if (opts.length) {
            setOptions(
              opts.map((o) => ({
                id: o.id,
                name: o.name,
                description: o.description ?? "",
                line_items: (o.line_items ?? []).map((li) => ({
                  id: li.id ?? makeId(),
                  description: li.description,
                  quantity: li.quantity,
                  unit_price: li.unit_price,
                })),
              }))
            );
          }
        }
        setLoaded(true);
      })();
    }, [quoteId])
  );

  // Load saved items + templates once
  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_line_items")
      .select("*")
      .eq("user_id", user.id)
      .order("description", { ascending: true })
      .then(({ data }) => setSavedItems((data as SavedLineItem[]) ?? []));
    supabase
      .from("quote_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const all = (data as QuoteTemplate[]) ?? [];
        setTemplates(all);
        // If nav passed a templateId (from Templates tab), auto-apply.
        if (templateIdParam && !quoteId) {
          const picked = all.find((t) => t.id === templateIdParam);
          if (picked) applyTemplate(picked);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, templateIdParam]);

  const tax = parseFloat(taxRate) || 0;

  // Single-option totals
  const singleParsed = parseItems(lineItems);
  const { subtotal, taxAmount, total } = calculateTotals(singleParsed, tax);

  // Multi-option totals (per option)
  const optionTotals = options.map((o) => {
    const parsed = parseItems(o.line_items);
    return calculateTotals(parsed, tax);
  });

  // ---- handlers for single ----
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

  // ---- handlers for options ----
  function updateOption(optionId: string, field: "name" | "description", value: string) {
    setOptions((prev) => prev.map((o) => (o.id === optionId ? { ...o, [field]: value } : o)));
  }
  function updateOptionItem(
    optionId: string,
    itemId: string,
    field: keyof LineItemFormData,
    value: string | number
  ) {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? {
              ...o,
              line_items: o.line_items.map((li) => (li.id === itemId ? { ...li, [field]: value } : li)),
            }
          : o
      )
    );
  }
  function addOptionItem(optionId: string) {
    setOptions((prev) =>
      prev.map((o) => (o.id === optionId ? { ...o, line_items: [...o.line_items, emptyItem()] } : o))
    );
  }
  function removeOptionItem(optionId: string, itemId: string) {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId && o.line_items.length > 1
          ? { ...o, line_items: o.line_items.filter((li) => li.id !== itemId) }
          : o
      )
    );
  }
  function addOption(name: string) {
    if (options.length >= 5) return;
    setOptions((prev) => [...prev, emptyOption(name)]);
    setAddOptionMenuOpen(false);
  }
  function removeOptionAt(index: number) {
    if (index <= 0) return; // index 0 ("Good") is locked
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- saved item picker ----
  function openSavedPicker(target: typeof pickerTarget) {
    if (savedItems.length === 0) {
      Alert.alert(
        "No saved items",
        "Save an item by tapping \"Save\" in the quote detail, or edit this to add it later."
      );
      return;
    }
    setPickerTarget(target);
  }
  function applySavedItem(saved: SavedLineItem) {
    if (!pickerTarget) return;
    if (pickerTarget.kind === "main") {
      updateItem(pickerTarget.itemId, "description", saved.description);
      updateItem(pickerTarget.itemId, "unit_price", saved.unit_price);
      setLineItems((prev) =>
        prev.map((i) =>
          i.id === pickerTarget.itemId && !Number(i.quantity)
            ? { ...i, quantity: 1 }
            : i
        )
      );
    } else {
      updateOptionItem(pickerTarget.optionId, pickerTarget.itemId, "description", saved.description);
      updateOptionItem(pickerTarget.optionId, pickerTarget.itemId, "unit_price", saved.unit_price);
      setOptions((prev) =>
        prev.map((o) =>
          o.id === pickerTarget.optionId
            ? {
                ...o,
                line_items: o.line_items.map((li) =>
                  li.id === pickerTarget.itemId && !Number(li.quantity)
                    ? { ...li, quantity: 1 }
                    : li
                ),
              }
            : o
        )
      );
    }
    setPickerTarget(null);
  }

  // ---- template apply ----
  function applyTemplate(tpl: QuoteTemplate) {
    setScopeOfWork(tpl.scope_of_work ?? "");
    setTaxRate(tpl.tax_rate ? String(tpl.tax_rate) : "");
    setValidDays(String(tpl.valid_days));
    setLineItems(
      (tpl.line_items ?? []).map((li) => ({
        id: makeId(),
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
      })) as LineItemFormData[]
    );
    if (!lineItems.length) setLineItems([emptyItem()]);
    setShowTemplatePicker(false);
  }

  // ---- save current form as template ----
  // Multi-option templates aren't supported by the web API; button is disabled in that mode.
  const canSaveAsTemplate =
    !isMultiOption && lineItems.some((i) => i.description.trim().length > 0);

  async function handleSaveAsTemplate() {
    if (!canSaveAsTemplate) return;
    const defaultName = `Template from ${customerName.trim() || "quote"}`;

    const save = async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        Alert.alert("Error", "Template name is required.");
        return;
      }
      try {
        const res = await apiFetch(`/api/templates`, {
          method: "POST",
          body: JSON.stringify({
            name: trimmed,
            line_items: parseItems(lineItems),
            tax_rate: tax,
            scope_of_work: scopeOfWork.trim() || null,
            valid_days: parseInt(validDays) || 30,
          }),
        });
        if (!res.ok) throw new Error();
        // Refresh the list so the new template shows up in the picker immediately.
        const newTpl = await res.json().catch(() => null);
        if (newTpl && newTpl.id) {
          setTemplates((prev) => [newTpl as QuoteTemplate, ...prev]);
        }
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

  // ---- validation helpers ----
  function validateRequired(): string | null {
    if (!customerName.trim() || !jobAddress.trim()) {
      return "Customer name and job address are required.";
    }
    return null;
  }

  function validateItems(items: LineItemFormData[]): string | null {
    const emptyQty = items.some((i) => i.description && (!i.quantity || Number(i.quantity) <= 0));
    if (emptyQty) return "Every line item needs a quantity greater than 0.";
    const emptyPrice = items.some(
      (i) => i.description && (i.unit_price === "" || i.unit_price === null || i.unit_price === undefined)
    );
    if (emptyPrice) return "Every line item needs a price.";
    return null;
  }

  function buildPayload() {
    const baseLineItems = isMultiOption ? [] : parseItems(lineItems);
    const base: any = {
      contractor_id: user!.id,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      customer_email: customerEmail.trim() || null,
      job_address: jobAddress.trim(),
      scope_of_work: scopeOfWork.trim() || null,
      line_items: baseLineItems,
      tax_rate: tax,
      valid_days: parseInt(validDays) || 30,
      notes: notes.trim() || null,
      status: "draft" as const,
      is_multi_option: isMultiOption,
    };
    if (isMultiOption) {
      base.subtotal = 0;
      base.tax_amount = 0;
      base.total = 0;
    } else {
      base.subtotal = subtotal;
      base.tax_amount = taxAmount;
      base.total = total;
    }
    return base;
  }

  async function persistOptions(quoteDbId: string) {
    // Delete existing then insert fresh
    await supabase.from("quote_options").delete().eq("quote_id", quoteDbId);
    const rows = options.map((opt, idx) => {
      const parsed = parseItems(opt.line_items);
      const totals = calculateTotals(parsed, tax);
      return {
        quote_id: quoteDbId,
        name: opt.name.trim() || `Option ${idx + 1}`,
        description: opt.description.trim() || null,
        line_items: parsed,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        total: totals.total,
        sort_order: idx,
      };
    });
    if (rows.length) {
      await supabase.from("quote_options").insert(rows);
    }
  }

  /**
   * Called by QuotePhotoUploader when the user tries to attach a photo
   * before saving the quote. Persists a draft using whatever values the
   * form has so far, filling placeholder text for required fields that
   * are still empty. The user can overwrite the placeholders later by
   * filling in real customer name / address and saving again.
   *
   * Returns the new quote id (or null on failure).
   */
  async function ensureQuoteForPhotos(): Promise<string | null> {
    if (draftQuoteId) return draftQuoteId;
    try {
      const payload = buildPayload();
      if (!payload.customer_name) {
        payload.customer_name = "(draft — customer TBD)";
      }
      if (!payload.job_address) {
        payload.job_address = "(address pending)";
      }
      const { data, error } = await supabase
        .from("quotes")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        console.error("Failed to create draft for photos:", error);
        return null;
      }
      // Persist option rows if the user had multi-option turned on.
      if (isMultiOption) {
        await persistOptions(data.id);
      }
      setDraftQuoteId(data.id);
      return data.id as string;
    } catch (err) {
      console.error("Failed to create draft for photos:", err);
      return null;
    }
  }

  async function handleSave() {
    const reqErr = validateRequired();
    if (reqErr) return Alert.alert("Required", reqErr);

    setSaving(true);
    try {
      // Prefer an id from route params; fall back to a draft created by
      // the photo uploader so we update that row instead of inserting a
      // duplicate.
      let id = quoteId ?? draftQuoteId;
      if (id) {
        const { contractor_id, status, ...updateData } = buildPayload();
        await supabase.from("quotes").update(updateData).eq("id", id);
      } else {
        const { data, error } = await supabase
          .from("quotes")
          .insert(buildPayload())
          .select()
          .single();
        if (error) throw error;
        id = data.id;
        setDraftQuoteId(data.id);
      }
      if (isMultiOption && id) {
        await persistOptions(id);
      } else if (id) {
        await supabase.from("quote_options").delete().eq("quote_id", id);
      }
      Alert.alert("Saved", "Draft saved.");
      if (quoteId) {
        navigation.goBack();
      } else {
        navigation.replace("QuoteDetail", { quoteId: id! });
      }
    } catch {
      Alert.alert("Error", "Failed to save quote.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    const reqErr = validateRequired();
    if (reqErr) return Alert.alert("Required", reqErr);
    if (!customerPhone.trim() && !customerEmail.trim()) {
      return Alert.alert("Required", "Add a phone number or email to send this quote.");
    }

    if (isMultiOption) {
      for (const o of options) {
        const err = validateItems(o.line_items);
        if (err) return Alert.alert(`Fix ${o.name || "option"}`, err);
      }
    } else {
      const err = validateItems(lineItems);
      if (err) return Alert.alert("Fix quote", err);
    }

    setSending(true);
    try {
      // Reuse a draft created by the photo uploader so Send updates that
      // row instead of inserting a duplicate quote.
      let id = quoteId ?? draftQuoteId;
      if (!id) {
        const { data, error } = await supabase.from("quotes").insert(buildPayload()).select().single();
        if (error) throw error;
        id = data.id;
        setDraftQuoteId(data.id);
      } else {
        const { contractor_id, status, ...updateData } = buildPayload();
        await supabase.from("quotes").update(updateData).eq("id", id);
      }
      if (isMultiOption && id) {
        await persistOptions(id);
      } else if (id) {
        await supabase.from("quote_options").delete().eq("quote_id", id);
      }

      const res = await apiFetch(`/api/quotes/${id}/send`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send");
      }

      // Detect partial delivery — e.g. SMS sent but email bounced because
      // the Resend sender domain isn't verified. Surface it instead of
      // silently claiming success.
      const body = (await res.json().catch(() => ({}))) as {
        deliveryErrors?: string[];
      };
      if (body.deliveryErrors && body.deliveryErrors.length > 0) {
        Alert.alert(
          "Partial delivery",
          `${body.deliveryErrors.join(", ")}.\n\nCheck your Resend sender domain.`
        );
        navigation.replace("QuoteDetail", { quoteId: id! });
        return;
      }

      Alert.alert("Quote Sent!", "Your customer will receive it shortly.");
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Template picker — always visible on new quotes so it's discoverable. */}
        {!quoteId && (
          <TouchableOpacity
            style={styles.templateBtn}
            onPress={() => setShowTemplatePicker((s) => !s)}
          >
            <Text style={styles.templateBtnText}>
              {showTemplatePicker
                ? "Hide templates"
                : templates.length > 0
                ? `Pick Template (${templates.length})`
                : "Pick Template"}
            </Text>
          </TouchableOpacity>
        )}

        {showTemplatePicker && !quoteId && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pick a template</Text>
            {templates.length === 0 ? (
              <Text style={styles.emptyTemplates}>
                No templates yet. Save one from any quote's detail screen by tapping
                "Save as Template".
              </Text>
            ) : (
              templates.map((t) => (
                <TouchableOpacity key={t.id} style={styles.pickerRow} onPress={() => applyTemplate(t)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerRowTitle}>{t.name}</Text>
                    {t.description ? <Text style={styles.pickerRowSub}>{t.description}</Text> : null}
                  </View>
                  <Text style={styles.pickerChev}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

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

        {/* Photos — rendered in both new-quote and edit-quote modes.
            When new (no quoteId), the uploader calls ensureQuoteForPhotos
            on first attach to auto-save a draft with placeholder customer
            fields, so contractors can snap before typing. */}
        <QuotePhotoUploader
          quoteId={quoteId ?? draftQuoteId}
          onRequireQuoteId={ensureQuoteForPhotos}
        />

        {/* Multi-option toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Multiple options</Text>
              <Text style={styles.toggleSub}>Offer Good / Better / Best so customers can pick their price.</Text>
            </View>
            <Switch
              value={isMultiOption}
              onValueChange={setIsMultiOption}
              trackColor={{ false: colors.gray[300], true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* Single-option line items */}
        {!isMultiOption && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Line Items</Text>
            {lineItems.map((item) => (
              <LineItemEditor
                key={item.id}
                item={item}
                canRemove={lineItems.length > 1}
                onChange={(field, value) => updateItem(item.id, field, value)}
                onRemove={() => removeItem(item.id)}
                onPickSaved={() => openSavedPicker({ kind: "main", itemId: item.id })}
                savedCount={savedItems.length}
              />
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
                  placeholder="0"
                />
                <Text style={styles.totalLabel}>%</Text>
              </View>
              <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
            </View>
            <View
              style={[
                styles.totalRow,
                { borderTopWidth: 1, borderTopColor: colors.gray[200], paddingTop: 8, marginTop: 4 },
              ]}
            >
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{formatCurrency(total)}</Text>
            </View>
          </View>
        )}

        {/* Multi-option editor */}
        {isMultiOption && (
          <>
            {/* Shared tax row */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tax Rate</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TextInput
                  style={[styles.input, { width: 70, textAlign: "center" }]}
                  value={taxRate}
                  onChangeText={setTaxRate}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <Text style={styles.totalLabel}>%</Text>
                <Text style={[styles.toggleSub, { marginLeft: 8 }]}>Applied to every option.</Text>
              </View>
            </View>

            {options.map((opt, idx) => {
              const totals = optionTotals[idx];
              return (
                <View key={opt.id} style={styles.card}>
                  <View style={styles.optionHeaderRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0, fontWeight: "700" }]}
                      placeholder={`Option ${idx + 1} name`}
                      placeholderTextColor={colors.gray[400]}
                      value={opt.name}
                      onChangeText={(v) => updateOption(opt.id, "name", v)}
                    />
                    {idx > 0 && (
                      <TouchableOpacity onPress={() => removeOptionAt(idx)} style={styles.removeOptBtn}>
                        <Text style={styles.removeBtnText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    placeholder="Short description (optional)"
                    placeholderTextColor={colors.gray[400]}
                    value={opt.description}
                    onChangeText={(v) => updateOption(opt.id, "description", v)}
                  />

                  <View style={{ height: 10 }} />
                  {opt.line_items.map((li) => (
                    <LineItemEditor
                      key={li.id}
                      item={li}
                      canRemove={opt.line_items.length > 1}
                      onChange={(field, value) => updateOptionItem(opt.id, li.id, field, value)}
                      onRemove={() => removeOptionItem(opt.id, li.id)}
                      onPickSaved={() =>
                        openSavedPicker({ kind: "option", optionId: opt.id, itemId: li.id })
                      }
                      savedCount={savedItems.length}
                    />
                  ))}
                  <TouchableOpacity style={styles.addBtn} onPress={() => addOptionItem(opt.id)}>
                    <Text style={styles.addBtnText}>+ Add Line Item</Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.totalValue}>{formatCurrency(totals.subtotal)}</Text>
                  </View>
                  {tax > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Tax ({tax}%)</Text>
                      <Text style={styles.totalValue}>{formatCurrency(totals.taxAmount)}</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.totalRow,
                      { borderTopWidth: 1, borderTopColor: colors.gray[200], paddingTop: 8, marginTop: 4 },
                    ]}
                  >
                    <Text style={styles.grandLabel}>Total</Text>
                    <Text style={styles.grandValue}>{formatCurrency(totals.total)}</Text>
                  </View>
                </View>
              );
            })}

            {options.length < 5 && (() => {
              const presetNames = ["Good", "Better", "Best"];
              const usedNames = options.map((o) => o.name);
              const available = presetNames.filter((n) => !usedNames.includes(n));
              return (
                <View>
                  <TouchableOpacity
                    style={styles.addOptionBtn}
                    onPress={() => setAddOptionMenuOpen((o) => !o)}
                  >
                    <Text style={styles.addOptionBtnText}>
                      {addOptionMenuOpen ? "Cancel" : "+ Add Option"}
                    </Text>
                  </TouchableOpacity>
                  {addOptionMenuOpen && (
                    <View style={styles.addOptionMenu}>
                      {available.map((name) => (
                        <TouchableOpacity
                          key={name}
                          style={styles.addOptionMenuItem}
                          onPress={() => addOption(name)}
                        >
                          <Text style={styles.addOptionMenuText}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.addOptionMenuItem}
                        onPress={() => addOption(`Option ${options.length + 1}`)}
                      >
                        <Text style={[styles.addOptionMenuText, { color: colors.gray[500] }]}>
                          Custom option…
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })()}
          </>
        )}

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 14, color: colors.gray[600] }}>Valid for</Text>
            <TextInput
              style={[styles.input, { width: 60, textAlign: "center", marginBottom: 0 }]}
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

        {customerPhone.trim() !== "" && (
          <Text style={styles.consent}>
            By sending this quote, you confirm that your customer has consented to receive an SMS. Message and data rates may apply. Customer can reply STOP to opt out.
          </Text>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.templateSaveBtn, !canSaveAsTemplate && styles.btnDisabled]}
            onPress={handleSaveAsTemplate}
            disabled={!canSaveAsTemplate || saving || sending}
          >
            <Text style={styles.templateSaveBtnText}>
              {isMultiOption
                ? "Save as Template (single-option only)"
                : "Save as Template"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={saving || sending}
          >
            {saving ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Draft</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (sending || saving) && styles.btnDisabled]}
            onPress={handleSend}
            disabled={saving || sending}
          >
            {sending ? (
              <ActivityIndicator color={colors.black} size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send Quote</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Saved-item picker overlay */}
      {pickerTarget && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <View style={styles.overlayHeader}>
              <Text style={styles.overlayTitle}>Saved items</Text>
              <TouchableOpacity onPress={() => setPickerTarget(null)}>
                <Text style={styles.overlayClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {savedItems.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.pickerRow}
                  onPress={() => applySavedItem(s)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerRowTitle}>{s.description}</Text>
                    <Text style={styles.pickerRowSub}>{formatCurrency(s.unit_price)}</Text>
                  </View>
                  <Text style={styles.pickerChev}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Reusable line-item row used by single and multi-option editors. */
function LineItemEditor({
  item,
  canRemove,
  onChange,
  onRemove,
  onPickSaved,
  savedCount,
}: {
  item: LineItemFormData;
  canRemove: boolean;
  onChange: (field: keyof LineItemFormData, value: string | number) => void;
  onRemove: () => void;
  onPickSaved: () => void;
  savedCount: number;
}) {
  return (
    <View style={styles.lineItemRow}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Description"
          placeholderTextColor={colors.gray[400]}
          value={item.description}
          onChangeText={(v) => onChange("description", v)}
        />
        {savedCount > 0 && (
          <TouchableOpacity onPress={onPickSaved} style={styles.pickSavedBtn}>
            <Text style={styles.pickSavedBtnText}>Pick</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.lineItemNumbers}>
        <TextInput
          style={[styles.input, styles.smallInput]}
          placeholder="Qty"
          placeholderTextColor={colors.gray[400]}
          value={item.quantity === "" ? "" : String(item.quantity)}
          onChangeText={(v) => onChange("quantity", v === "" ? "" : parseFloat(v))}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, styles.smallInput]}
          placeholder="Price"
          placeholderTextColor={colors.gray[400]}
          value={item.unit_price === "" ? "" : String(item.unit_price)}
          onChangeText={(v) => onChange("unit_price", v === "" ? "" : parseFloat(v))}
          keyboardType="numeric"
        />
        {canRemove && (
          <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
            <Text style={styles.removeBtnText}>X</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 11, fontWeight: "700", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  input: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: colors.gray[200], color: colors.black, marginBottom: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleTitle: { fontSize: 15, fontWeight: "700", color: colors.black },
  toggleSub: { fontSize: 12, color: colors.gray[500], marginTop: 2 },
  optionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  removeOptBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  lineItemRow: { marginBottom: 8 },
  lineItemNumbers: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  smallInput: { width: 70, textAlign: "center", marginBottom: 0 },
  removeBtn: { padding: 8 },
  removeBtnText: { fontSize: 14, fontWeight: "700", color: colors.red },
  addBtn: { paddingVertical: 8 },
  addBtnText: { fontSize: 14, fontWeight: "600", color: colors.blue },
  addOptionBtn: { paddingVertical: 14, alignItems: "center", marginBottom: 12, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.gray[200], borderStyle: "dashed" },
  addOptionBtnText: { fontSize: 14, fontWeight: "600", color: colors.blue },
  addOptionMenu: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.gray[200], marginTop: -8, marginBottom: 12, overflow: "hidden" },
  addOptionMenuItem: { paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  addOptionMenuText: { fontSize: 15, fontWeight: "600", color: colors.black },
  divider: { height: 1, backgroundColor: colors.gray[200], marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  taxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  totalLabel: { fontSize: 14, color: colors.gray[500] },
  totalValue: { fontSize: 14, color: colors.gray[500] },
  grandLabel: { fontSize: 16, fontWeight: "800", color: colors.black },
  grandValue: { fontSize: 16, fontWeight: "800", color: colors.black },
  consent: { fontSize: 11, color: colors.gray[400], lineHeight: 16, textAlign: "center", marginBottom: 12, paddingHorizontal: spacing.sm },
  actions: { gap: 10 },
  saveBtn: { backgroundColor: colors.white, borderRadius: 10, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.gray[200] },
  saveBtnText: { fontSize: 15, fontWeight: "600", color: colors.black },
  templateSaveBtn: { backgroundColor: "transparent", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.gray[300], borderStyle: "dashed" },
  templateSaveBtnText: { fontSize: 14, fontWeight: "600", color: colors.black },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, alignItems: "center" },
  sendBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  btnDisabled: { opacity: 0.6 },
  templateBtn: { backgroundColor: colors.white, borderRadius: 12, padding: 12, alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  templateBtnText: { fontSize: 14, fontWeight: "600", color: colors.black },
  emptyTemplates: { fontSize: 13, color: colors.gray[500], lineHeight: 18 },
  photoHint: { fontSize: 13, color: colors.gray[500], lineHeight: 18 },
  pickSavedBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.gray[100], borderRadius: 8 },
  pickSavedBtnText: { fontSize: 13, fontWeight: "600", color: colors.black },
  pickerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  pickerRowTitle: { fontSize: 15, fontWeight: "600", color: colors.black },
  pickerRowSub: { fontSize: 13, color: colors.gray[500], marginTop: 2 },
  pickerChev: { fontSize: 20, color: colors.gray[400], paddingHorizontal: 8 },
  overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: spacing.md },
  overlayCard: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.md },
  overlayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  overlayTitle: { fontSize: 17, fontWeight: "700", color: colors.black },
  overlayClose: { fontSize: 15, fontWeight: "600", color: colors.blue },
});
