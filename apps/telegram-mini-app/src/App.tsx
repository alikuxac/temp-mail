import type {
	Attachment,
	BlockRule,
	Email,
	EmailAddress,
	EmailSummary,
} from "@temp-mail/shared-types";
import { useCallback, useEffect, useState } from "react";
import { MailboxView } from "./components/MailboxView";
import { useTelegram } from "./hooks/useTelegram";
import { apiService, type FeatureFlags, type SessionInfo } from "./services/api";

type TabType = "all" | "starred" | "addresses";

type QuotaInfo = {
	address_count: number;
	max_addresses: number;
	retry_after_seconds: number;
	exempt: boolean;
};

/**
 * Apply a Discord Activity session to the mailbox state.
 */
function applySession(
	session: SessionInfo,
	state: {
		setIsOwner: (value: boolean) => void;
		setAddresses: (value: EmailAddress[]) => void;
		setQuota: (value: QuotaInfo | null) => void;
		setFeatures: (value: FeatureFlags) => void;
		setOwnUserId: (value: number | undefined) => void;
		selectAddress: (address: EmailAddress) => void;
	},
) {
	state.setIsOwner(session.user.is_admin);
	if (session.features) state.setFeatures(session.features);
	state.setAddresses(session.addresses);
	state.setQuota(session.quota ?? null);
	state.setOwnUserId(session.user.user_id);
	const first = session.addresses[0];
	if (first) state.selectAddress(first);
}

/**
 * Create the first random address of a newly authenticated user.
 */
async function createFirstAddress(state: {
	upsertAddress: (address: EmailAddress) => void;
	selectAddress: (address: EmailAddress) => void;
}) {
	const generated = await apiService.createRandomAddress();
	const address: EmailAddress = {
		id: generated.id ?? generated.address,
		user_id: generated.user_id ?? 0,
		address: generated.address,
		created_at: generated.created_at ?? Math.floor(Date.now() / 1000),
	};
	state.upsertAddress(address);
	state.selectAddress(address);
}

/**
 * App state and data access.
 * The composer below is split into small components to keep the render tree readable.
 */
function useMailbox(provider: string) {
	const [currentAddress, setCurrentAddress] = useState<string>("");
	const [addresses, setAddresses] = useState<EmailAddress[]>([]);
	const [userAddressId, setUserAddressId] = useState<number | undefined>(undefined);
	const [isOwner, setIsOwner] = useState<boolean>(false);
	const [quota, setQuota] = useState<QuotaInfo | null>(null);
	const [bootError, setBootError] = useState<string | null>(null);
	const [emails, setEmails] = useState<EmailSummary[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [domain, setDomain] = useState<string>("");
	const [ownUserId, setOwnUserId] = useState<number | undefined>(undefined);
	const [features, setFeatures] = useState<FeatureFlags>({
		outbound: false,
		forward: false,
		aiSummary: false,
		aiProvider: "workers-ai",
	});

	const fetchEmails = useCallback(async (address: string) => {
		if (!address) {
			setEmails([]);
			return;
		}
		setLoading(true);
		try {
			setEmails(await apiService.getEmails(address));
		} catch (err) {
			console.error("Failed to fetch emails:", err);
			setEmails([]);
		} finally {
			setLoading(false);
		}
	}, []);

	const selectAddress = useCallback((address: EmailAddress) => {
		setCurrentAddress(address.address);
		setUserAddressId(address.user_id);
	}, []);

	const upsertAddress = useCallback((address: EmailAddress) => {
		setAddresses((prev) => [address, ...prev.filter((a) => a.address !== address.address)]);
		setQuota((prev) => (prev ? { ...prev, address_count: prev.address_count + 1 } : prev));
	}, []);

	// Admins may inspect every inbox: fetch the full address list so the selector
	// offers it, keeping their own addresses first. Access to foreign addresses is
	// enforced server side (`isOwnerSession`).
	const loadAdminAddresses = useCallback(async (session: SessionInfo) => {
		if (!session.user.is_admin) return;
		try {
			const all = await apiService.getAdminAddresses();
			const mine = new Set(session.addresses.map((a) => a.address));
			setAddresses([...session.addresses, ...all.filter((a) => !mine.has(a.address))]);
		} catch (err) {
			console.error("Failed to load admin address list:", err);
		}
	}, []);

	// Bootstrap: authenticated session (Telegram initData or Discord Activity), else create
	// the first address of a brand new user.
	const bootstrap = useCallback(async () => {
		try {
			const session = await apiService.getSession();
			if (session) {
				applySession(session, {
					setIsOwner,
					setAddresses,
					setQuota,
					setFeatures,
					setOwnUserId,
					selectAddress,
				});
				if (session.domain) setDomain(session.domain);
				setBootError(null);
			}

			// New accounts have no address yet: create one so the inbox is usable immediately.
			if (!session || session.addresses.length === 0) {
				await createFirstAddress({ upsertAddress, selectAddress });
				setBootError(null);
			} else {
				await loadAdminAddresses(session);
			}
		} catch (err) {
			console.error("Failed to bootstrap session:", err);
			setBootError(err instanceof Error ? err.message : String(err));
		}
	}, [selectAddress, upsertAddress, loadAdminAddresses]);

	useEffect(() => {
		if (provider !== "browser") {
			void bootstrap();
		}
	}, [provider, bootstrap]);

	useEffect(() => {
		if (currentAddress) {
			void fetchEmails(currentAddress);
		}
	}, [currentAddress, fetchEmails]);

	return {
		currentAddress,
		addresses,
		userAddressId,
		isOwner,
		quota,
		bootError,
		emails,
		loading,
		domain,
		features,
		ownUserId,
		fetchEmails,
		selectAddress,
		upsertAddress,
		setBootError,
		setEmails,
		setCurrentAddress,
		setUserAddressId,
		setQuota,
		setAddresses,
	};
}

export function App() {
	// Modals
	const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
	const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
	const [blockRules, setBlockRules] = useState<BlockRule[]>([]);
	const [forwardingTarget, setForwardingTarget] = useState<string>("");
	const [cleanupTtl, setCleanupTtl] = useState<string>("72");
	const [webhookUrl, setWebhookUrl] = useState<string>("");

	const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
	const [emailAttachments, setEmailAttachments] = useState<Attachment[]>([]);
	const [copied, setCopied] = useState<boolean>(false);
	const [copiedOtp, setCopiedOtp] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TabType>("all");
	const session = useTelegram();
	const { haptic, provider } = session;
	const {
		currentAddress,
		addresses,
		userAddressId,
		isOwner,
		quota,
		bootError,
		emails,
		loading,
		domain,
		features,
		ownUserId,
		fetchEmails,
		selectAddress,
		upsertAddress,
		setBootError,
		setEmails,
		setAddresses,
		setCurrentAddress,
		setUserAddressId,
		setQuota,
	} = useMailbox(provider);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(currentAddress);
			setCopied(true);
			haptic.notification("success");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy address:", err);
			haptic.notification("error");
		}
	};

	/** Copy any address from the list (not only the active one). */
	const handleCopyAddress = async (address: EmailAddress) => {
		try {
			await navigator.clipboard.writeText(address.address);
			haptic.notification("success");
		} catch (err) {
			console.error("Failed to copy address:", err);
			haptic.notification("error");
		}
	};

	/** Make an address active and jump back to its inbox. */
	const handleOpenAddress = (address: EmailAddress) => {
		haptic.selection();
		selectAddress(address);
		setActiveTab("all");
	};

	const handleCopyOtp = async (code: string, e?: React.MouseEvent) => {
		if (e) e.stopPropagation();
		try {
			await navigator.clipboard.writeText(code);
			setCopiedOtp(code);
			haptic.notification("success");
			setTimeout(() => setCopiedOtp(null), 2000);
		} catch (err) {
			console.error("Failed to copy OTP:", err);
			haptic.notification("error");
		}
	};

	const handleGenerateNew = async () => {
		haptic.impact("medium");
		try {
			const generated = await apiService.createRandomAddress();
			const address: EmailAddress = {
				id: generated.id ?? generated.address,
				user_id: generated.user_id ?? 0,
				address: generated.address,
				created_at: generated.created_at ?? Math.floor(Date.now() / 1000),
			};
			upsertAddress(address);
			selectAddress(address);
			haptic.notification("success");
		} catch (err) {
			console.error("Failed to generate address:", err);
			haptic.notification("error");
			setBootError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleSelectEmail = async (id: string) => {
		haptic.selection();
		try {
			const detail = await apiService.getEmailDetail(id);
			setSelectedEmail(detail);
			if (detail.has_attachments) {
				const atts = await apiService.getAttachments(id);
				setEmailAttachments(atts);
			} else {
				setEmailAttachments([]);
			}
		} catch (err) {
			console.error("Failed to load email detail:", err);
			haptic.notification("error");
		}
	};

	const handleToggleStar = async (
		emailId: string,
		currentStatus: boolean,
		e?: React.MouseEvent,
	) => {
		if (e) e.stopPropagation();
		const nextStatus = !currentStatus;
		haptic.impact("light");

		setEmails((prev) => prev.map((m) => (m.id === emailId ? { ...m, is_starred: nextStatus } : m)));
		if (selectedEmail && selectedEmail.id === emailId) {
			setSelectedEmail({ ...selectedEmail, is_starred: nextStatus });
		}

		try {
			await apiService.toggleStar(emailId, nextStatus);
		} catch (err) {
			console.error("Failed to toggle star:", err);
			setEmails((prev) =>
				prev.map((m) => (m.id === emailId ? { ...m, is_starred: currentStatus } : m)),
			);
			if (selectedEmail && selectedEmail.id === emailId) {
				setSelectedEmail({ ...selectedEmail, is_starred: currentStatus });
			}
			haptic.notification("error");
		}
	};

	const handleDeleteEmail = async (id: string) => {
		haptic.impact("heavy");
		try {
			await apiService.deleteEmail(id);
			setEmails((prev) => prev.filter((e) => e.id !== id));
			setSelectedEmail(null);
			haptic.notification("success");
		} catch (err) {
			console.error("Failed to delete email:", err);
			haptic.notification("error");
		}
	};

	const handleOpenSettings = async () => {
		haptic.selection();
		setShowSettingsModal(true);
		try {
			const [rules, conf] = await Promise.all([
				apiService.getBlocklist(),
				apiService.getSettings(),
			]);
			setBlockRules(rules);
			if (conf.forwarding_target) setForwardingTarget(conf.forwarding_target);
			if (conf.auto_cleanup_ttl_hours) setCleanupTtl(conf.auto_cleanup_ttl_hours);
			if (conf.webhook_url) setWebhookUrl(conf.webhook_url);
		} catch (err) {
			console.error("Failed to load settings:", err);
		}
	};

	const handleCustomAddress = async (prefix: string) => {
		const activeDomain = currentAddress.split("@")[1] || domain;
		// A new address always belongs to the caller, even when an admin is
		// currently inspecting someone else's inbox.
		const newAddr = await apiService.createCustomAddress(prefix, activeDomain);
		upsertAddress(newAddr);
		selectAddress(newAddr);
		setShowCustomModal(false);
		haptic.notification("success");
	};

	const handleSaveSettings = async (conf: {
		forwarding_target: string;
		auto_cleanup_ttl_hours: number;
		webhook_url: string;
	}) => {
		await apiService.updateSettings(conf);
		setForwardingTarget(conf.forwarding_target);
		setCleanupTtl(String(conf.auto_cleanup_ttl_hours));
		setWebhookUrl(conf.webhook_url);
		haptic.notification("success");
	};

	const handleDeleteAddress = async (target: EmailAddress) => {
		if (!window.confirm(`Delete ${target.address} and all its emails?`)) return;
		haptic.impact("heavy");
		try {
			await apiService.deleteAddress(target.address);
			const remaining = addresses.filter((a) => a.address !== target.address);
			setAddresses(remaining);

			// Always reconcile the active address with the new list: the removed
			// address must never stay selected (a controlled <select> whose value
			// is missing from its options stops responding to changes).
			const stillSelected = remaining.some((a) => a.address === currentAddress);
			if (!stillSelected) {
				const next = remaining[0];
				if (next) {
					selectAddress(next);
				} else {
					setCurrentAddress("");
					setUserAddressId(undefined);
					setEmails([]);
				}
			}

			// Drop any email detail opened from the deleted address.
			setSelectedEmail(null);
			setEmailAttachments([]);

			setQuota((prev) =>
				prev && !prev.exempt
					? { ...prev, address_count: Math.max(0, prev.address_count - 1) }
					: prev,
			);
			haptic.notification("success");
		} catch (err) {
			console.error("Failed to delete address:", err);
			setBootError(err instanceof Error ? err.message : String(err));
			haptic.notification("error");
		}
	};

	const handleAddBlockRule = async (type: "sender" | "domain", pattern: string) => {
		const rule = await apiService.addBlockRule(type, pattern);
		setBlockRules((prev) => [rule, ...prev]);
		haptic.notification("success");
	};

	const handleDeleteBlockRule = async (id: string) => {
		await apiService.deleteBlockRule(id);
		setBlockRules((prev) => prev.filter((r) => r.id !== id));
		haptic.notification("success");
	};

	return (
		<MailboxView
			data={{
				currentAddress,
				addresses,
				userAddressId,
				isOwner,
				quota,
				bootError,
				emails,
				loading,
				domain,
				features,
				ownUserId,
			}}
			session={session}
			view={{
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
			}}
			handlers={{
				handleCopy,
				handleCopyOtp,
				handleGenerateNew,
				handleSelectEmail,
				handleToggleStar,
				handleDeleteEmail,
				handleOpenSettings,
				setShowCustomModal,
				setShowSettingsModal,
				setActiveTab,
				setSelectedEmail,
				setBlockRules,
				setForwardingTarget,
				setCleanupTtl,
				setWebhookUrl,
				setCopiedOtp,
				fetchEmails,
				selectAddress,
				upsertAddress,
				handleCustomAddress,
				handleSaveSettings,
				handleAddBlockRule,
				handleDeleteBlockRule,
				handleDeleteAddress,
				handleCopyAddress,
				handleOpenAddress,
			}}
		/>
	);
}

export default App;
