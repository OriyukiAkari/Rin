import {
  type ConfigWrapper,
  normalizeFeedCardVariant,
  normalizeFeedLayout,
} from "@rin/config";
import type { TFunction } from "i18next";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { client } from "../../app/runtime";
import { applyThemeColor, normalizeThemeColor } from "../../utils/theme-color";
import {
  areSettingsDraftsEqual,
  buildAIConfigDraftValue,
  createSettingsConfigWrappers,
  importWordPressFile,
  loadSettingsConfigState,
  mergeSessionConfig,
  saveSettingsConfigState,
  type SettingsDraft,
  updateDraftConfig,
  uploadFavicon,
} from "../../page/settings-helpers";

type ShowAlert = (message: string, callback?: () => void) => void;

export interface SettingsController {
  aiValue: ReturnType<typeof buildAIConfigDraftValue>;
  clientConfig: ConfigWrapper;
  feedCardVariantValue: ReturnType<typeof normalizeFeedCardVariant>;
  feedLayoutValue: ReturnType<typeof normalizeFeedLayout>;
  handleFaviconChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleReset: () => void;
  handleSave: () => Promise<void>;
  handleTestWebhook: () => Promise<void>;
  hasUnsavedChanges: boolean;
  isOpen: boolean;
  loading: boolean;
  msg: string;
  msgList: Array<{ title: string; reason: string }>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  previewSiteAvatar: string;
  previewSiteName: string;
  saving: boolean;
  serverConfig: ConfigWrapper;
  setConfigValue: (type: "client" | "server", key: string, value: unknown) => void;
  setIsOpen: (open: boolean) => void;
  setWebhookTestMessage: (message: string) => void;
  testingWebhook: boolean;
  themeColorValue: string;
  webhookTestMessage: string;
}

function getDraftThemeColor(draft: SettingsDraft) {
  const color = draft.clientConfig["theme.color"];
  return typeof color === "string" ? color : undefined;
}

export function useSettingsController(t: TFunction, showAlert: ShowAlert): SettingsController {
  const [isOpen, setIsOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgList, setMsgList] = useState<Array<{ title: string; reason: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestMessage, setWebhookTestMessage] = useState("");
  const [draft, setDraft] = useState<SettingsDraft>({ clientConfig: {}, serverConfig: {} });
  const [initialDraft, setInitialDraft] = useState<SettingsDraft>({ clientConfig: {}, serverConfig: {} });
  const [hasStoredAiApiKey, setHasStoredAiApiKey] = useState(false);
  const loaded = useRef(false);
  const initialDraftRef = useRef<SettingsDraft>({ clientConfig: {}, serverConfig: {} });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void loadSettingsConfigState()
      .then((state) => {
        setDraft(state.draft);
        setInitialDraft(state.draft);
        initialDraftRef.current = state.draft;
        setHasStoredAiApiKey(state.hasStoredAiApiKey);
        mergeSessionConfig(state.draft.clientConfig);
        applyThemeColor(getDraftThemeColor(state.draft));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        showAlert(t("settings.get_config_failed$message", { message }));
      })
      .finally(() => setLoading(false));

    return () => applyThemeColor(getDraftThemeColor(initialDraftRef.current));
  }, [showAlert, t]);

  const { clientConfig, serverConfig } = useMemo(() => createSettingsConfigWrappers(draft), [draft]);
  const aiValue = useMemo(() => buildAIConfigDraftValue(draft, hasStoredAiApiKey), [draft, hasStoredAiApiKey]);
  const themeColorValue = normalizeThemeColor(String(clientConfig.get("theme.color") ?? "#fc466b"));

  function setConfigValue(type: "client" | "server", key: string, value: unknown) {
    setDraft((current) => updateDraftConfig(current, type, key, value));
  }

  function handleReset() {
    setDraft(initialDraft);
    applyThemeColor(getDraftThemeColor(initialDraft));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const state = await saveSettingsConfigState(draft);
      setDraft(state.draft);
      setInitialDraft(state.draft);
      initialDraftRef.current = state.draft;
      setHasStoredAiApiKey(state.hasStoredAiApiKey || aiValue.apiKey.trim().length > 0);
      mergeSessionConfig(state.draft.clientConfig);
      window.dispatchEvent(new Event("storage"));
      showAlert(t("settings.ai_summary.save_success"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showAlert(t("settings.update_failed$message", { message }));
    } finally {
      setSaving(false);
    }
  }

  async function handleFaviconChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await uploadFavicon(file, t, showAlert);
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const { data, error } = await importWordPressFile(file);
    if (data) {
      setMsg(t("settings.import_success$success$skipped", { success: data.success, skipped: data.skipped }));
      setMsgList(data.skippedList);
      setIsOpen(true);
    } else if (error) {
      showAlert(t("settings.import_failed$message", { message: error.value }));
    }
  }

  async function handleTestWebhook() {
    setTestingWebhook(true);
    try {
      const { data, error } = await client.config.testWebhook({
        webhook_url: String(serverConfig.get("webhook_url") ?? ""),
        "webhook.method": String(serverConfig.get("webhook.method") ?? ""),
        "webhook.content_type": String(serverConfig.get("webhook.content_type") ?? ""),
        "webhook.headers": String(serverConfig.get("webhook.headers") ?? ""),
        "webhook.body_template": String(serverConfig.get("webhook.body_template") ?? ""),
        test_message: webhookTestMessage,
      });
      if (error || !data?.success) {
        const message = error?.value || data?.error || t("settings.webhook.test.failed");
        showAlert(`${message}${data?.details ? `\n${data.details}` : ""}`);
      } else {
        showAlert(t("settings.webhook.test.success"));
      }
    } finally {
      setTestingWebhook(false);
    }
  }

  return {
    aiValue,
    clientConfig,
    feedCardVariantValue: normalizeFeedCardVariant(String(clientConfig.get("feed.card_variant") ?? "default")),
    feedLayoutValue: normalizeFeedLayout(String(clientConfig.get("feed.layout") ?? "list")),
    handleFaviconChange,
    handleReset,
    handleSave,
    handleTestWebhook,
    hasUnsavedChanges: !areSettingsDraftsEqual(draft, initialDraft),
    isOpen,
    loading,
    msg,
    msgList,
    onFileChange,
    previewSiteAvatar: String(clientConfig.get("site.avatar") ?? clientConfig.default("site.avatar") ?? ""),
    previewSiteName: String(clientConfig.get("site.name") ?? clientConfig.default("site.name") ?? "Rin"),
    saving,
    serverConfig,
    setConfigValue,
    setIsOpen,
    setWebhookTestMessage,
    testingWebhook,
    themeColorValue,
    webhookTestMessage,
  };
}
