import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiFetch, APP_URL } from "../lib/api";
import { supabase } from "../lib/supabase";
import { QuotePhoto } from "../types";
import { colors, spacing } from "../lib/theme";

interface QuotePhotoUploaderProps {
  /**
   * Quote id. Pass null when editing a brand-new quote that hasn't been
   * saved yet — the uploader will call `onRequireQuoteId` to auto-create
   * a draft the first time the user tries to attach a photo.
   */
  quoteId: string | null;
  initialPhotos?: QuotePhoto[];
  /**
   * Called when the user tries to add a photo and no quoteId exists yet.
   * Must persist a draft quote (using whatever write path the parent
   * already uses) and return the new quote id. Return null if the draft
   * couldn't be created — the uploader will surface an error.
   */
  onRequireQuoteId?: () => Promise<string | null>;
}

const MAX_PHOTOS = 10;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB (matches web)

/** Best-effort inference of mime from a file extension. */
function mimeFromUri(uri: string, fallback = "image/jpeg"): string {
  const ext = uri.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "gif":
      return "image/gif";
    default:
      return fallback;
  }
}

/**
 * Mobile photo uploader. Mirrors the capability of the web `QuotePhotoUploader`
 * but presents a native picker + horizontal thumbnail strip.
 *
 * Assumes the quote already exists (requires `quoteId`). The parent screen
 * gates rendering on that.
 */
export function QuotePhotoUploader({
  quoteId,
  initialPhotos,
  onRequireQuoteId,
}: QuotePhotoUploaderProps) {
  const [photos, setPhotos] = useState<QuotePhoto[]>(initialPhotos ?? []);
  // Skip the initial fetch when we don't have a quote id yet — nothing to load.
  const [loading, setLoading] = useState(
    quoteId !== null && initialPhotos === undefined
  );
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Track the effective quote id locally so a draft created mid-flow
  // is reused for subsequent uploads without waiting for the parent
  // re-render.
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(quoteId);

  // Keep local id in sync if the parent swaps it in (e.g. after Save Draft).
  useEffect(() => {
    setCurrentQuoteId(quoteId);
  }, [quoteId]);

  // Fetch existing photos if not passed in. Only runs when we have an id.
  useEffect(() => {
    if (initialPhotos !== undefined) return;
    if (!currentQuoteId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/quotes/${currentQuoteId}/photos`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data: QuotePhoto[] = await res.json();
        if (!cancelled) setPhotos(data);
      } catch {
        // Non-fatal; user can still try to add.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentQuoteId, initialPhotos]);

  async function handleAdd() {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert(
        "Photo limit reached",
        `You can attach up to ${MAX_PHOTOS} photos per quote.`
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access in Settings to attach photos."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    // Resolve the quote id. If none yet, ask the parent to create a draft
    // (e.g. in new-quote mode where the user snaps photos before typing
    // customer info). This mirrors the web QuoteForm ensureQuoteForPhotos
    // flow.
    let qid = currentQuoteId;
    if (!qid && onRequireQuoteId) {
      qid = await onRequireQuoteId();
      if (!qid) {
        Alert.alert(
          "Couldn't save draft",
          "We couldn't save a draft to attach this photo to. Try again in a moment."
        );
        return;
      }
      setCurrentQuoteId(qid);
    }
    if (!qid) {
      Alert.alert(
        "Save required",
        "Save this quote as a draft first, then come back to attach photos."
      );
      return;
    }

    // Enforce client-side size cap so we don't spend bandwidth uploading a
    // file the server will just reject.
    if (typeof asset.fileSize === "number" && asset.fileSize > MAX_BYTES) {
      Alert.alert(
        "Too large",
        `That photo is larger than ${MAX_BYTES / 1024 / 1024}MB. Pick a smaller one.`
      );
      return;
    }

    const mime = asset.mimeType ?? mimeFromUri(asset.uri);
    const fileName =
      asset.fileName ?? `photo-${Date.now()}.${mime.split("/")[1] ?? "jpg"}`;

    setUploading(true);
    try {
      // React Native FormData accepts this file-object shape natively,
      // even though TS's lib.dom FormData types only know about Blob.
      // The web API reads `file` from multipart/form-data.
      const fd = new FormData();
      const fileField = {
        uri: asset.uri,
        name: fileName,
        type: mime,
      } as unknown as Blob;
      fd.append("file", fileField);

      // NOTE: we can't use apiFetch for multipart because it defaults
      // Content-Type to application/json, which would clobber the multipart
      // boundary that fetch sets automatically. So we build auth headers
      // manually here.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { Accept: "application/json" };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${APP_URL}/api/quotes/${qid}/photos`, {
        method: "POST",
        headers,
        body: fd as unknown as BodyInit,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        Alert.alert("Upload failed", body?.error ?? "Please try again.");
        return;
      }
      const row: QuotePhoto = await res.json();
      setPhotos((prev) => [...prev, row]);
    } catch (err) {
      console.error("Photo upload failed:", err);
      Alert.alert("Upload failed", "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function confirmRemove(photo: QuotePhoto) {
    Alert.alert("Remove photo?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => handleRemove(photo),
      },
    ]);
  }

  async function handleRemove(photo: QuotePhoto) {
    if (!currentQuoteId) return;
    setBusyId(photo.id);
    try {
      const res = await apiFetch(
        `/api/quotes/${currentQuoteId}/photos/${photo.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        Alert.alert("Error", body?.error ?? "Failed to remove photo.");
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch {
      Alert.alert("Error", "Failed to remove photo.");
    } finally {
      setBusyId(null);
    }
  }

  const atLimit = photos.length >= MAX_PHOTOS;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        Photos {photos.length > 0 ? `(${photos.length}/${MAX_PHOTOS})` : ""}
      </Text>
      <Text style={styles.caption}>
        Attach before/after shots, site conditions, or material photos. Your
        customer will see these on the quote.
      </Text>

      <TouchableOpacity
        style={[styles.addBtn, (uploading || atLimit) && styles.btnDisabled]}
        onPress={handleAdd}
        disabled={uploading || atLimit}
      >
        {uploading ? (
          <ActivityIndicator color={colors.black} size="small" />
        ) : (
          <Text style={styles.addBtnText}>
            {atLimit ? "Max reached" : "+ Add Photo"}
          </Text>
        )}
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} />
      ) : photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
        >
          {photos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              style={styles.thumb}
              onPress={() => confirmRemove(photo)}
              disabled={busyId === photo.id}
              accessibilityLabel="Remove photo"
            >
              {photo.url ? (
                <Image source={{ uri: photo.url }} style={styles.thumbImg} />
              ) : (
                <View style={[styles.thumbImg, styles.thumbPlaceholder]} />
              )}
              {busyId === photo.id && (
                <View style={styles.thumbOverlay}>
                  <ActivityIndicator color={colors.white} />
                </View>
              )}
              <View style={styles.removeBadge}>
                <Text style={styles.removeBadgeText}>×</Text>
              </View>
            </TouchableOpacity>
          ))}
          {uploading && (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.uploadingText}>Uploading…</Text>
            </View>
          )}
        </ScrollView>
      ) : uploading ? (
        <View style={[styles.thumb, styles.thumbPlaceholder, { marginTop: 12 }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.uploadingText}>Uploading…</Text>
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Up to {MAX_PHOTOS} photos, {MAX_BYTES / 1024 / 1024}MB each. Tap a
        thumbnail to remove.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gray[400],
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  caption: {
    fontSize: 12,
    color: colors.gray[500],
    marginBottom: 10,
    lineHeight: 16,
  },
  addBtn: {
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderStyle: "dashed",
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.black,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  strip: {
    marginTop: 12,
  },
  stripContent: {
    gap: 8,
    paddingRight: 8,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    marginRight: 8,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
  },
  thumbOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBadgeText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  uploadingText: {
    fontSize: 11,
    color: colors.gray[500],
    marginTop: 4,
  },
  footnote: {
    fontSize: 11,
    color: colors.gray[400],
    marginTop: 10,
  },
});
