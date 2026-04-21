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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { ContractorProfile } from "../types";
import { colors, spacing } from "../lib/theme";

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from("contractor_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const p = data as ContractorProfile;
            setProfile(p);
            setBusinessName(p.business_name ?? "");
            setPhone(p.phone ?? "");
            setEmail(p.email ?? "");
            setAddress(p.address ?? "");
            setLicenseNumber(p.license_number ?? "");
            setPaymentTerms(p.default_payment_terms ?? "");
          }
          setLoading(false);
        });
    }, [user])
  );

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const updates = {
      business_name: businessName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      license_number: licenseNumber.trim() || null,
      default_payment_terms: paymentTerms.trim() || null,
    };

    const { error } = await supabase
      .from("contractor_profiles")
      .update(updates)
      .eq("user_id", user.id);

    setSaving(false);
    if (error) {
      Alert.alert("Error", "Failed to save profile.");
    } else {
      Alert.alert("Saved", "Profile updated.");
    }
  }

  function handleSignOut() {
    Alert.alert("Sign out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: signOut },
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Business Profile</Text>
        <Text style={styles.label}>Business Name</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Your business name" placeholderTextColor={colors.gray[400]} />
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" placeholderTextColor={colors.gray[400]} keyboardType="phone-pad" />
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.gray[400]} keyboardType="email-address" autoCapitalize="none" />
        <Text style={styles.label}>Business Address</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="123 Main St, City, State" placeholderTextColor={colors.gray[400]} />
        <Text style={styles.label}>License Number</Text>
        <TextInput style={styles.input} value={licenseNumber} onChangeText={setLicenseNumber} placeholder="Optional" placeholderTextColor={colors.gray[400]} />
        <Text style={styles.label}>Default Payment Terms</Text>
        <TextInput
          style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]}
          value={paymentTerms}
          onChangeText={setPaymentTerms}
          placeholder="e.g. Net 30, 50% deposit required"
          placeholderTextColor={colors.gray[400]}
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.emailText}>{user?.email}</Text>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, marginBottom: 12, borderWidth: 1, borderColor: colors.gray[200] },
  cardTitle: { fontSize: 11, fontWeight: "700", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.gray[600], marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: colors.gray[50], borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: colors.gray[200], color: colors.black },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: "center", marginTop: spacing.md },
  saveBtnText: { fontSize: 16, fontWeight: "700", color: colors.black },
  btnDisabled: { opacity: 0.6 },
  emailText: { fontSize: 15, color: colors.gray[600], marginBottom: 12 },
  signOutBtn: { backgroundColor: colors.red + "10", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.red + "30" },
  signOutBtnText: { fontSize: 15, fontWeight: "600", color: colors.red },
});
