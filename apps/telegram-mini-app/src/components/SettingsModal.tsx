import type { BlockRule } from "@temp-mail/shared-types";
import { Check, Plus, Settings, Shield, Trash2, X } from "lucide-react";
import { useState } from "react";

interface SettingsModalProps {
	blockRules: BlockRule[];
	initialForwardingTarget: string;
	initialCleanupTtl: string;
	initialWebhookUrl: string;
	onClose: () => void;
	onSaveSettings: (settings: {
		forwarding_target: string;
		auto_cleanup_ttl_hours: number;
		webhook_url: string;
	}) => Promise<void>;
	onAddBlockRule: (type: "sender" | "domain", pattern: string) => Promise<void>;
	onDeleteBlockRule: (id: string) => Promise<void>;
}

export function SettingsModal({
	blockRules,
	initialForwardingTarget,
	initialCleanupTtl,
	initialWebhookUrl,
	onClose,
	onSaveSettings,
	onAddBlockRule,
	onDeleteBlockRule,
}: SettingsModalProps) {
	const [forwardingTarget, setForwardingTarget] = useState(initialForwardingTarget);
	const [cleanupTtl, setCleanupTtl] = useState(initialCleanupTtl);
	const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
	const [saved, setSaved] = useState(false);

	const [newBlockType, setNewBlockType] = useState<"sender" | "domain">("sender");
	const [newBlockPattern, setNewBlockPattern] = useState("");

	const handleSave = async () => {
		await onSaveSettings({
			forwarding_target: forwardingTarget.trim(),
			auto_cleanup_ttl_hours: parseInt(cleanupTtl, 10) || 72,
			webhook_url: webhookUrl.trim(),
		});
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
	};

	const handleAddRule = async () => {
		if (!newBlockPattern.trim()) return;
		await onAddBlockRule(newBlockType, newBlockPattern.trim());
		setNewBlockPattern("");
	};

	return (
		<div className="modal-overlay">
			<button
				type="button"
				className="modal-backdrop-btn"
				aria-label="Close modal"
				onClick={onClose}
			/>
			<div className="modal-content" role="dialog" aria-modal="true">
				<div className="modal-header">
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Settings size={20} />
						<h3>Settings & Security</h3>
					</div>
					<button type="button" className="btn-icon" onClick={onClose}>
						<X size={20} />
					</button>
				</div>

				<div className="settings-section">
					<h4>Automation & Relays</h4>
					<div className="form-group">
						<label htmlFor="forwarding-target-input">Default Forwarding Target Address</label>
						<input
							id="forwarding-target-input"
							type="email"
							className="form-input"
							placeholder="personal@gmail.com"
							value={forwardingTarget}
							onChange={(e) => setForwardingTarget(e.target.value)}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="cleanup-ttl-input">
							Auto-Cleanup Retention (Hours, default 72h / 3 days)
						</label>
						<input
							id="cleanup-ttl-input"
							type="number"
							className="form-input"
							placeholder="72"
							value={cleanupTtl}
							onChange={(e) => setCleanupTtl(e.target.value)}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="webhook-url-input">Outbound Webhook URL (POST notifications)</label>
						<input
							id="webhook-url-input"
							type="url"
							className="form-input"
							placeholder="https://hooks.slack.com/services/..."
							value={webhookUrl}
							onChange={(e) => setWebhookUrl(e.target.value)}
						/>
					</div>

					<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
						<button type="button" className="btn btn-primary" onClick={handleSave}>
							{saved ? <Check size={16} /> : null} Save Settings
						</button>
					</div>
				</div>

				<hr style={{ borderColor: "var(--border-color)", margin: "16px 0" }} />

				<div className="settings-section">
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
						<Shield size={18} color="var(--danger)" />
						<h4>Blocklist Management</h4>
					</div>

					<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
						<select
							className="form-input"
							style={{ width: "110px" }}
							value={newBlockType}
							onChange={(e) => setNewBlockType(e.target.value as "sender" | "domain")}
						>
							<option value="sender">Sender</option>
							<option value="domain">Domain</option>
						</select>
						<input
							type="text"
							className="form-input"
							placeholder={newBlockType === "sender" ? "spammer@evil.com" : "evil.com"}
							value={newBlockPattern}
							onChange={(e) => setNewBlockPattern(e.target.value)}
						/>
						<button type="button" className="btn btn-secondary" onClick={handleAddRule}>
							<Plus size={16} /> Block
						</button>
					</div>

					{blockRules.length === 0 ? (
						<div
							style={{
								fontSize: "0.8rem",
								color: "var(--text-secondary)",
								textAlign: "center",
								padding: 12,
							}}
						>
							No block rules defined. All incoming emails accepted.
						</div>
					) : (
						<div className="block-list">
							{blockRules.map((rule) => (
								<div key={rule.id} className="block-item">
									<div>
										<span className="block-badge">{rule.type}</span>
										<span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{rule.pattern}</span>
									</div>
									<button
										type="button"
										className="btn-icon"
										style={{ color: "var(--danger)" }}
										onClick={() => onDeleteBlockRule(rule.id)}
										title="Remove rule"
									>
										<Trash2 size={15} />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
