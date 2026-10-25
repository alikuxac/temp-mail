import type {
	Attachment,
	BlockRule,
	Email,
	EmailAddress,
	EmailSummary,
} from "@temp-mail/shared-types";
import {
	AtSign,
	Check,
	Copy,
	Inbox,
	Key,
	Mail,
	Paperclip,
	Plus,
	RefreshCw,
	Settings,
	Sparkles,
	Star,
	Trash2,
	Zap,
} from "lucide-react";
import { useState } from "react";
import type { useTelegram } from "../hooks/useTelegram";
import { apiService, type FeatureFlags } from "../services/api";
import { CustomAddressModal } from "./CustomAddressModal";
import { EmailDetailModal } from "./EmailDetailModal";
import { SettingsModal } from "./SettingsModal";

type QuotaInfo = {
	address_count: number;
	max_addresses: number;
	retry_after_seconds: number;
	exempt: boolean;
};

type TabType = "all" | "starred" | "addresses";

interface EmailCardItemProps {
	email: EmailSummary;
	copiedOtp: string | null;
	onSelect: (id: string) => void;
	onToggleStar: (id: string, current: boolean, e: React.MouseEvent) => void;
	onCopyOtp: (code: string, e: React.MouseEvent) => void;
}

function EmailCardItem({
	email,
	copiedOtp,
	onSelect,
	onToggleStar,
	onCopyOtp,
}: EmailCardItemProps) {
	const otpCode = email.otp_code;
	return (
		<button type="button" className="email-card" onClick={() => onSelect(email.id)}>
			<div className="email-card-header">
				<span className="email-sender">{email.from_address}</span>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					{email.has_attachments && (
						<span title="Attachments">
							<Paperclip size={14} color="var(--accent)" />
						</span>
					)}
					<button
						type="button"
						className="btn-star"
						onClick={(e) => onToggleStar(email.id, email.is_starred, e)}
						title={email.is_starred ? "Unstar" : "Star"}
					>
						<Star
							size={16}
							fill={email.is_starred ? "#eab308" : "transparent"}
							color={email.is_starred ? "#eab308" : "var(--text-secondary)"}
						/>
					</button>
					<span>
						{new Date(email.received_at * 1000).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				</div>
			</div>

			<div className="email-subject">{email.subject || "(No subject)"}</div>

			{otpCode && (
				<button
					type="button"
					className="otp-chip"
					onClick={(e) => onCopyOtp(otpCode, e)}
					title="Click to copy OTP"
				>
					<Key size={13} />
					<span>
						Code: <b>{otpCode}</b>
					</span>
					{copiedOtp === otpCode ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
				</button>
			)}

			{email.summary && (
				<div className="ai-summary-card">
					<Sparkles size={13} className="ai-icon" />
					<span>{email.summary}</span>
				</div>
			)}
		</button>
	);
}

export interface MailboxViewProps {
	data: {
		currentAddress: string;
		addresses: EmailAddress[];
		userAddressId: number | undefined;
		isOwner: boolean;
		quota: QuotaInfo | null;
		bootError: string | null;
		emails: EmailSummary[];
		loading: boolean;
		domain: string;
		features: FeatureFlags;
		ownUserId?: number;
	};
	session: ReturnType<typeof useTelegram>;
	view: {
		copied: boolean;
		copiedOtp: string | null;
		activeTab: TabType;
		selectedEmail: Email | null;
		emailAttachments: Attachment[];
		blockRules: BlockRule[];
		forwardingTarget: string;
		cleanupTtl: string;
		webhookUrl: string;
		showCustomModal: boolean;
		showSettingsModal: boolean;
	};
	handlers: {
		handleCopy: () => void;
		handleCopyOtp: (code: string, e?: React.MouseEvent) => void;
		handleGenerateNew: () => void;
		handleSelectEmail: (id: string) => void;
		handleToggleStar: (id: string, current: boolean, e?: React.MouseEvent) => void;
		handleDeleteEmail: (id: string) => void;
		handleOpenSettings: () => void;
		setShowCustomModal: (value: boolean) => void;
		setShowSettingsModal: (value: boolean) => void;
		setActiveTab: (value: TabType) => void;
		setSelectedEmail: (value: Email | null) => void;
		setBlockRules: React.Dispatch<React.SetStateAction<BlockRule[]>>;
		setForwardingTarget: (value: string) => void;
		setCleanupTtl: (value: string) => void;
		setWebhookUrl: (value: string) => void;
		setCopiedOtp: (value: string | null) => void;
		fetchEmails: (address: string) => void;
		selectAddress: (address: EmailAddress) => void;
		upsertAddress: (address: EmailAddress) => void;
		handleCustomAddress: (prefix: string) => Promise<void>;
		handleDeleteAddress: (address: EmailAddress) => Promise<void>;
		handleCopyAddress: (address: EmailAddress) => void;
		handleOpenAddress: (address: EmailAddress) => void;
		handleSaveSettings: (settings: {
			forwarding_target: string;
			auto_cleanup_ttl_hours: number;
			webhook_url: string;
		}) => Promise<void>;
		handleAddBlockRule: (type: "sender" | "domain", pattern: string) => Promise<void>;
		handleDeleteBlockRule: (id: string) => Promise<void>;
	};
}

function activeTabMatch(email: EmailSummary, tab: TabType) {
	return tab !== "starred" || email.is_starred;
}

interface TabsHeaderProps {
	activeTab: TabType;
	total: number;
	starred: number;
	addressCount: number;
	onChange: (tab: TabType) => void;
}

/**
 * Inbox filter tabs plus the address manager tab.
 */
function TabsHeader({ activeTab, total, starred, addressCount, onChange }: TabsHeaderProps) {
	return (
		<div className="tabs-container">
			<button
				type="button"
				className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
				onClick={() => onChange("all")}
			>
				<Inbox size={15} /> All ({total})
			</button>
			<button
				type="button"
				className={`tab-btn ${activeTab === "starred" ? "active" : ""}`}
				onClick={() => onChange("starred")}
			>
				<Star size={15} color={activeTab === "starred" ? "#eab308" : undefined} />
				Starred ({starred})
			</button>
			<button
				type="button"
				className={`tab-btn ${activeTab === "addresses" ? "active" : ""}`}
				onClick={() => onChange("addresses")}
			>
				<AtSign size={15} /> Addresses ({addressCount})
			</button>
		</div>
	);
}
interface AddressCardProps {
	currentAddress: string;
	addressCount: number;
	quota: QuotaInfo | null;
	copied: boolean;
	loading: boolean;
	onCopy: () => void;
	onManageAddresses: () => void;
	onGenerateNew: () => void;
	onCustomPrefix: () => void;
	onRefresh: () => void;
	onDeleteAddress: () => void;
}

/**
 * Active address card: copy, delete, manage, generate, custom prefix and refresh.
 */
function AddressCard(props: AddressCardProps) {
	const { currentAddress, addressCount, quota, copied, loading } = props;

	return (
		<section className="address-card">
			<div className="address-label">
				Active Temporary Inbox
				{quota && !quota.exempt && (
					<span style={{ marginLeft: 8 }}>
						({quota.address_count}/{quota.max_addresses})
					</span>
				)}
			</div>
			<div className="address-display">
				<span>{currentAddress || "—"}</span>
				<button type="button" className="btn-icon" onClick={props.onCopy} title="Copy Address">
					{copied ? <Check size={18} color="#22c55e" /> : <Copy size={18} />}
				</button>
				{currentAddress && (
					<button
						type="button"
						className="btn-icon"
						onClick={props.onDeleteAddress}
						title="Delete Address"
					>
						<Trash2 size={18} color="var(--danger)" />
					</button>
				)}
			</div>
			{addressCount > 1 && (
				<button type="button" className="btn btn-secondary" onClick={props.onManageAddresses}>
					<AtSign size={16} /> Manage addresses ({addressCount})
				</button>
			)}
			<div className="address-actions-grid">
				<button type="button" className="btn btn-secondary" onClick={props.onGenerateNew}>
					<Zap size={16} /> Random
				</button>
				<button type="button" className="btn btn-secondary" onClick={props.onCustomPrefix}>
					<Plus size={16} /> Custom Prefix
				</button>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={props.onRefresh}
					disabled={loading}
				>
					<RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
				</button>
			</div>
		</section>
	);
}

interface AddressRowProps {
	address: EmailAddress;
	isActive: boolean;
	isOwn: boolean;
	onOpen: () => void;
	onCopy: () => void;
	onDelete: () => void;
}

/**
 * One address line: open its inbox, copy it, or delete it.
 */
function AddressRow({ address, isActive, isOwn, onOpen, onCopy, onDelete }: AddressRowProps) {
	return (
		<div className={`address-row ${isActive ? "active" : ""}`}>
			<div className="address-row-main">
				<span className="address-row-value">{address.address}</span>
				<div className="address-row-badges">
					{isActive && <span className="badge badge-active">Active</span>}
					{!isOwn && <span className="badge badge-other">Other user</span>}
				</div>
			</div>
			<div className="address-row-actions">
				<button type="button" className="btn-icon" onClick={onOpen} title="View inbox">
					<Inbox size={16} />
				</button>
				<button type="button" className="btn-icon" onClick={onCopy} title="Copy address">
					<Copy size={16} />
				</button>
				<button type="button" className="btn-icon" onClick={onDelete} title="Delete address">
					<Trash2 size={16} color="var(--danger)" />
				</button>
			</div>
		</div>
	);
}

interface AddressManagerProps {
	addresses: EmailAddress[];
	currentAddress: string;
	ownUserId?: number;
	isOwner: boolean;
	onOpen: (address: EmailAddress) => void;
	onCopy: (address: EmailAddress) => void;
	onDelete: (address: EmailAddress) => void;
	onGenerateNew: () => void;
	onCustomPrefix: () => void;
}

/**
 * Address manager tab: full list with per-row actions, instead of a native
 * `<select>` (which behaves inconsistently inside Telegram / Discord webviews).
 */
function AddressManager(props: AddressManagerProps) {
	const { addresses, currentAddress, ownUserId, isOwner, onOpen, onCopy, onDelete } = props;

	if (addresses.length === 0) {
		return (
			<section className="inbox-section">
				<div className="empty-state">
					<AtSign size={28} />
					<p>No addresses yet.</p>
					<div className="address-actions-grid" style={{ width: "100%" }}>
						<button type="button" className="btn btn-secondary" onClick={props.onGenerateNew}>
							<Zap size={16} /> Random
						</button>
						<button type="button" className="btn btn-secondary" onClick={props.onCustomPrefix}>
							<Plus size={16} /> Custom Prefix
						</button>
					</div>
				</div>
			</section>
		);
	}

	return (
		<section className="inbox-section">
			<div className="address-list">
				{addresses.map((a) => (
					<AddressRow
						key={a.id}
						address={a}
						isActive={a.address === currentAddress}
						// Admins may see addresses of other users; owners see only their own.
						isOwn={isOwner || ownUserId === undefined || a.user_id === ownUserId}
						onOpen={() => onOpen(a)}
						onCopy={() => onCopy(a)}
						onDelete={() => onDelete(a)}
					/>
				))}
			</div>
		</section>
	);
}
/**
 * Notice shown when the page is not opened from Telegram or Discord.
 */
/**
 * On-screen diagnostics for environments without a usable browser console
 * (Telegram Mini App, Discord Activity iframe). Shows why bootstrapping failed.
 */
function DiagnosticsPanel(props: {
	session: ReturnType<typeof useTelegram>;
	bootError: string | null;
}) {
	const { session, bootError } = props;
	const [open, setOpen] = useState(false);

	// Only surface it when something is wrong, so a working app stays clean.
	const problem = session.discordError ?? bootError;
	if (!problem) return null;

	const apiBase = import.meta.env.VITE_API_BASE_URL || "(same origin)";
	const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || "(missing)";

	return (
		<div
			style={{
				margin: "8px 16px",
				border: "1px solid var(--danger)",
				borderRadius: 8,
				overflow: "hidden",
				fontSize: "0.8rem",
			}}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				style={{
					width: "100%",
					textAlign: "left",
					padding: "8px 10px",
					background: "transparent",
					border: "none",
					color: "var(--danger)",
					cursor: "pointer",
					fontWeight: 600,
				}}
			>
				{open ? "▾" : "▸"} Bootstrap error — tap for details
			</button>
			{open && (
				<pre
					style={{
						margin: 0,
						padding: "8px 10px",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						color: "var(--text-primary)",
						background: "rgba(0,0,0,0.25)",
					}}
				>
					{[
						`provider: ${session.provider}`,
						`discordReady: ${session.discordReady}`,
						`discordError: ${session.discordError ?? "-"}`,
						`bootError: ${bootError ?? "-"}`,
						`apiBase: ${apiBase}`,
						`discordClientId: ${clientId}`,
						`url: ${window.location.href}`,
						`telegramInitData: ${window.Telegram?.WebApp?.initData ? "present" : "absent"}`,
					].join("\n")}
				</pre>
			)}
		</div>
	);
}

function SignedOutNotice() {
	return (
		<section className="empty-state">
			<Mail size={40} opacity={0.4} />
			<p>Open this app from Telegram or from Discord.</p>
			<p style={{ fontSize: "0.8rem" }}>
				API access requires a verified Telegram session or a Discord Activity signature.
			</p>
		</section>
	);
}

interface InboxSectionProps {
	emails: EmailSummary[];
	activeTab: TabType;
	copiedOtp: string | null;
	onSelect: (id: string) => void;
	onToggleStar: (id: string, current: boolean, e: React.MouseEvent) => void;
	onCopyOtp: (code: string, e: React.MouseEvent) => void;
}

/**
 * Message list with its empty state.
 */
function InboxSection({
	emails,
	activeTab,
	copiedOtp,
	onSelect,
	onToggleStar,
	onCopyOtp,
}: InboxSectionProps) {
	if (emails.length === 0) {
		return (
			<section className="inbox-section">
				<div className="empty-state">
					<Mail size={40} opacity={0.4} />
					<p>{activeTab === "starred" ? "No starred emails yet." : "No messages received yet."}</p>
					<p style={{ fontSize: "0.8rem" }}>
						Waiting for incoming emails to this temporary address.
					</p>
				</div>
			</section>
		);
	}

	return (
		<section className="inbox-section">
			<div className="email-list">
				{emails.map((email) => (
					<EmailCardItem
						key={email.id}
						email={email}
						copiedOtp={copiedOtp}
						onSelect={onSelect}
						onToggleStar={onToggleStar}
						onCopyOtp={onCopyOtp}
					/>
				))}
			</div>
		</section>
	);
}
/**
 * Presentational mailbox tree (state and actions come from <App />).
 */
export function MailboxView(props: MailboxViewProps) {
	const { data, session, view, handlers } = props;
	const {
		currentAddress,
		addresses,
		isOwner,
		quota,
		bootError,
		emails,
		loading,
		features,
		ownUserId,
	} = data;
	const { discordReady } = session;
	const {
		copied,
		copiedOtp,
		activeTab,
		selectedEmail,
		emailAttachments,
		blockRules,
		forwardingTarget,
		cleanupTtl,
		webhookUrl,
		showCustomModal,
		showSettingsModal,
	} = view;
	const {
		handleCopy,
		handleCopyOtp,
		handleGenerateNew,
		handleSelectEmail,
		handleToggleStar,
		handleDeleteEmail,
		handleOpenSettings,
		setActiveTab,
		setSelectedEmail,
		setShowCustomModal,
		setShowSettingsModal,
		fetchEmails,
		handleCustomAddress,
		handleSaveSettings,
		handleAddBlockRule,
		handleDeleteBlockRule,
		handleDeleteAddress,
		handleCopyAddress,
		handleOpenAddress,
	} = handlers;

	const owner = session.user?.first_name ?? "Discord user";
	const filteredEmails = emails.filter((email) => activeTabMatch(email, activeTab));
	const starredCount = emails.filter((e) => e.is_starred).length;

	return (
		<div className="app-container">
			<header className="app-header">
				<div className="brand">
					<Mail className="brand-icon" />
					<h1 className="brand-title">Temp Mail</h1>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{discordReady && <div className="user-badge">Discord</div>}
					{session.user && <div className="user-badge">@{session.user.username || owner}</div>}
					{isOwner && <div className="user-badge">Owner</div>}
					<button
						type="button"
						className="btn-icon"
						onClick={handleOpenSettings}
						title="Settings & Blocklist"
					>
						<Settings size={20} />
					</button>
				</div>
			</header>

			{bootError && (
				<div className="status-msg" style={{ color: "var(--danger)", padding: "0 16px" }}>
					{bootError}
				</div>
			)}

			<DiagnosticsPanel session={session} bootError={bootError} />

			{session.provider === "browser" ? (
				<SignedOutNotice />
			) : (
				<>
					<AddressCard
						currentAddress={currentAddress}
						addressCount={addresses.length}
						quota={quota}
						copied={copied}
						loading={loading}
						onCopy={handleCopy}
						onManageAddresses={() => setActiveTab("addresses")}
						onGenerateNew={handleGenerateNew}
						onCustomPrefix={() => setShowCustomModal(true)}
						onRefresh={() => fetchEmails(currentAddress)}
						onDeleteAddress={() => {
							const active = addresses.find((a) => a.address === currentAddress);
							if (active) void handleDeleteAddress(active);
						}}
					/>

					<TabsHeader
						activeTab={activeTab}
						total={emails.length}
						starred={starredCount}
						addressCount={addresses.length}
						onChange={setActiveTab}
					/>

					{activeTab === "addresses" ? (
						<AddressManager
							addresses={addresses}
							currentAddress={currentAddress}
							ownUserId={ownUserId}
							isOwner={isOwner}
							onOpen={handleOpenAddress}
							onCopy={handleCopyAddress}
							onDelete={(a) => void handleDeleteAddress(a)}
							onGenerateNew={handleGenerateNew}
							onCustomPrefix={() => setShowCustomModal(true)}
						/>
					) : (
						<InboxSection
							emails={filteredEmails}
							activeTab={activeTab}
							copiedOtp={copiedOtp}
							onSelect={handleSelectEmail}
							onToggleStar={handleToggleStar}
							onCopyOtp={handleCopyOtp}
						/>
					)}

					{/* Email Detail Modal */}
					{selectedEmail && (
						<EmailDetailModal
							email={selectedEmail}
							features={features}
							attachments={emailAttachments}
							copiedOtp={copiedOtp}
							onClose={() => setSelectedEmail(null)}
							onToggleStar={(id, curr) => handleToggleStar(id, curr)}
							onDelete={handleDeleteEmail}
							onCopyOtp={(code) => handleCopyOtp(code)}
							onForward={(id, target) => apiService.forwardEmail(id, target).then((r) => r.message)}
							onReply={(payload) => apiService.replyEmail(payload)}
						/>
					)}

					{/* Custom Address Modal */}
					{showCustomModal && (
						<CustomAddressModal
							domain={currentAddress.split("@")[1] || data.domain}
							onClose={() => setShowCustomModal(false)}
							onSubmit={handleCustomAddress}
						/>
					)}

					{/* Settings & Blocklist Modal */}
					{showSettingsModal && (
						<SettingsModal
							blockRules={blockRules}
							initialForwardingTarget={forwardingTarget}
							initialCleanupTtl={cleanupTtl}
							initialWebhookUrl={webhookUrl}
							onClose={() => setShowSettingsModal(false)}
							onSaveSettings={handleSaveSettings}
							onAddBlockRule={handleAddBlockRule}
							onDeleteBlockRule={handleDeleteBlockRule}
						/>
					)}
				</>
			)}
		</div>
	);
}
