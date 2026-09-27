import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../lib/tauri";
import { cx } from "../lib/utils";
import openai from "../assets/ai/openai.svg";
import claude from "../assets/ai/claude.svg";
import gemini from "../assets/ai/gemini.svg";
import copilot from "../assets/ai/copilot.svg";
import deepseek from "../assets/ai/deepseek.svg";
import cursor from "../assets/ai/cursor.svg";
import windsurf from "../assets/ai/windsurf.svg";
import mistral from "../assets/ai/mistral.svg";
import qwen from "../assets/ai/qwen.svg";

export const AI_PROVIDERS = [
  { id: "claude-code", label: "Claude Code", icon: claude, color: "#e4a77d" },
  { id: "codex", label: "Codex", icon: openai, color: "#74c8a7" },
  { id: "cursor", label: "Cursor", icon: cursor, color: "#d3d7df" },
  { id: "copilot", label: "GitHub Copilot", icon: copilot, color: "#8cb8ef" },
  { id: "gemini", label: "Gemini", icon: gemini, color: "#a8a7f5" },
  { id: "deepseek", label: "DeepSeek", icon: deepseek, color: "#76aaff" },
  { id: "windsurf", label: "Windsurf", icon: windsurf, color: "#6fd3c7" },
  { id: "mistral", label: "Mistral", icon: mistral, color: "#f0a24b" },
  { id: "qwen", label: "Qwen", icon: qwen, color: "#a58cf2" },
] as const;

// Ids kept for installs that picked a provider from the old chat-oriented list.
const LEGACY_IDS: Record<string, string> = {
  claude: "claude-code",
  chatgpt: "codex",
  "mistral-vibe": "mistral",
};

const INVERT_ICONS = new Set(["copilot", "cursor", "windsurf"]);

export function aiProfile(value: string) {
  const id = LEGACY_IDS[value] ?? value;
  return AI_PROVIDERS.find((p) => p.id === id) ?? {
    id: value,
    label: value,
    icon: null,
    color: "#b9a5ec",
  };
}

export function AIIcon({ provider }: { provider: string }) {
  const profile = aiProfile(provider);
  return profile.icon ? (
    <img
      className={cx("ai-mark", INVERT_ICONS.has(profile.id) && "invert")}
      src={profile.icon}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  ) : (
    <span className="ai-monogram" aria-hidden="true">{profile.label.charAt(0).toUpperCase()}</span>
  );
}

export function AIProviderPicker({ value, onSaved, setup = false }: {
  value: string | null;
  onSaved: (value: string) => void;
  setup?: boolean;
}) {
  const known = AI_PROVIDERS.some((p) => p.id === value);
  const [choice, setChoice] = useState(value ? known ? value : "other" : "");
  const [custom, setCustom] = useState(value && !known ? value : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const provider = choice === "other" ? custom.trim() : choice;
    if (!provider) {
      setError("Choose an AI or enter its name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.settings.set("ai_provider", provider);
      onSaved(provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save AI preference.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={setup ? "ai-setup" : "ai-picker"}>
      <div className="ai-picker-content">
        {setup && <div className="section-title">Contexta · setup</div>}
        <h1>Which AI do you use?</h1>
        <p className="mono-dim">Choose the assistant for this memory space. Its icon will be at the center of your graph. You can change this later in Settings.</p>
        <div className="ai-options" role="group" aria-label="AI provider">
          {AI_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={`ai-option${choice === provider.id ? " active" : ""}`}
              style={{ color: provider.color }}
              aria-pressed={choice === provider.id}
              onClick={() => { setChoice(provider.id); setError(""); }}
            >
              <AIIcon provider={provider.id} />
              <span>{provider.label}</span>
            </button>
          ))}
          <button type="button" className={`ai-option${choice === "other" ? " active" : ""}`} aria-pressed={choice === "other"} onClick={() => { setChoice("other"); setError(""); }}>
            <Sparkles aria-hidden="true" />
            <span>Other</span>
          </button>
        </div>
        {choice === "other" && (
          <input className="input ai-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="AI name" aria-label="Other AI name" maxLength={48} autoFocus />
        )}
        {error && <div className="ai-picker-error" role="alert">{error}</div>}
        <div className="ai-picker-footer">
          <span className="mono-dim">This choice does not connect an account.</span>
          <button className="btn primary" type="button" disabled={saving || !choice || (choice === "other" && !custom.trim())} onClick={save}>
            {saving ? "Saving…" : setup ? "Continue" : "Save AI"}
          </button>
        </div>
      </div>
    </div>
  );
}
