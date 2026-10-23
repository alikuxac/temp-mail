import type { Email, EmailSummary } from "@temp-mail/shared-types";
import { CACHE } from "@temp-mail/shared-types";
import { Check, Copy, Inbox, Mail, RefreshCw, Trash2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTelegram } from "./hooks/useTelegram";
import { apiService } from "./services/api";

export function App() {
	const { user, haptic } = useTelegram();
	const [currentAddress, setCurrentAddress] = useState<string>("temp.demo@barid.site");
	const [emails, setEmails] = useState<EmailSummary[]>([]);
	const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [copied, setCopied] = useState<boolean>(false);

	const fetchEmails = useCallback(async (address: string) => {
		setLoading(true);
		try {
			const data = await apiService.getEmails(address);
			setEmails(data);
		} catch (err) {
			console.error("Failed to fetch emails:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (currentAddress) {
			fetchEmails(currentAddress);
		}
	}, [currentAddress, fetchEmails]);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(currentAddress);
			setCopied(true);
			haptic.notification("success");
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
			haptic.notification("error");
		}
	};

	const handleGenerateNew = () => {
		haptic.impact("medium");
		const randomStr = Math.random().toString(36).substring(2, 10);
		setCurrentAddress(`usr_${randomStr}@barid.site`);
	};

	const handleSelectEmail = async (id: string) => {
		haptic.selection();
		try {
			const detail = await apiService.getEmailDetail(id);
			setSelectedEmail(detail);
		} catch (err) {
			console.error("Failed to load email detail:", err);
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

	return (
		<div className="app-container">
			<header className="app-header">
				<div className="brand">
					<Mail className="brand-icon" />
					<h1 className="brand-title">Temp Mail</h1>
				</div>
				{user && <div className="user-badge">@{user.username || user.first_name}</div>}
			</header>

			<section className="address-card">
				<div className="address-label">Active Inbox Address</div>
				<div className="address-display">
					<span>{currentAddress}</span>
					<button type="button" className="btn-icon" onClick={handleCopy} title="Copy Address">
						{copied ? <Check size={18} color="#22c55e" /> : <Copy size={18} />}
					</button>
				</div>
				<div className="address-actions">
					<button type="button" className="btn btn-secondary" onClick={handleGenerateNew}>
						<Zap size={16} /> New Address
					</button>
					<button
						type="button"
						className="btn btn-secondary"
						onClick={() => fetchEmails(currentAddress)}
						disabled={loading}
					>
						<RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
					</button>
				</div>
			</section>

			<section className="inbox-section">
				<div className="inbox-header">
					<div className="inbox-title">
						<Inbox size={18} />
						Messages
						<span className="badge">{emails.length}</span>
					</div>
					<span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
						TTL: {CACHE.DOMAINS_TTL / 60}m
					</span>
				</div>

				{emails.length === 0 ? (
					<div className="empty-state">
						<Mail size={40} opacity={0.4} />
						<p>No messages received yet.</p>
						<p style={{ fontSize: "0.8rem" }}>
							Waiting for incoming emails to this temporary address.
						</p>
					</div>
				) : (
					<div className="email-list">
						{emails.map((email) => (
							<button
								type="button"
								key={email.id}
								className="email-card"
								onClick={() => handleSelectEmail(email.id)}
							>
								<div className="email-card-header">
									<span className="email-sender">{email.from_address}</span>
									<span>
										{new Date(email.received_at * 1000).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
								</div>
								<div className="email-subject">{email.subject || "(No subject)"}</div>
							</button>
						))}
					</div>
				)}
			</section>

			{selectedEmail && (
				<div className="modal-overlay">
					<button
						type="button"
						className="modal-backdrop-btn"
						aria-label="Close modal"
						onClick={() => setSelectedEmail(null)}
					/>
					<div
						className="modal-content"
						role="dialog"
						aria-modal="true"
						aria-labelledby="modal-email-title"
					>
						<div className="modal-header">
							<div>
								<h3 id="modal-email-title">{selectedEmail.subject || "(No subject)"}</h3>
								<div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
									From: {selectedEmail.from_address}
								</div>
							</div>
							<button type="button" className="btn-icon" onClick={() => setSelectedEmail(null)}>
								<X size={20} />
							</button>
						</div>

						<div className="modal-body">
							{selectedEmail.html_content ? (
								<div
									// biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted email viewer inside mini app
									dangerouslySetInnerHTML={{ __html: selectedEmail.html_content }}
								/>
							) : (
								<pre style={{ whiteSpace: "pre-wrap" }}>
									{selectedEmail.text_content || "Empty content"}
								</pre>
							)}
						</div>

						<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
							<button
								type="button"
								className="btn btn-secondary"
								style={{ color: "var(--danger)" }}
								onClick={() => handleDeleteEmail(selectedEmail.id)}
							>
								<Trash2 size={16} /> Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
export default App;
