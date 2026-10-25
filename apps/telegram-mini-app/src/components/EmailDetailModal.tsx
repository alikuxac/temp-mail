import type { Attachment, Email } from "@temp-mail/shared-types";
import {
	Check,
	Copy,
	Download,
	Forward,
	Key,
	Paperclip,
	Reply,
	Send,
	Sparkles,
	Star,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import type { FeatureFlags } from "../services/api";
import { apiService } from "../services/api";

interface EmailDetailModalProps {
	email: Email;
	features: FeatureFlags;
	attachments: Attachment[];
	copiedOtp: string | null;
	onClose: () => void;
	onToggleStar: (id: string, current: boolean) => void;
	onDelete: (id: string) => void;
	onCopyOtp: (code: string) => void;
	onForward: (emailId: string, target?: string) => Promise<string>;
	onReply: (payload: {
		email_id: string;
		from: string;
		to: string;
		subject: string;
		text: string;
	}) => Promise<void>;
}

export function EmailDetailModal({
	email,
	features,
	attachments,
	copiedOtp,
	onClose,
	onToggleStar,
	onDelete,
	onCopyOtp,
	onForward,
	onReply,
}: EmailDetailModalProps) {
	const [showForwardDialog, setShowForwardDialog] = useState(false);
	const [forwardTarget, setForwardTarget] = useState("");
	const [forwardStatus, setForwardStatus] = useState<string | null>(null);

	const [showReplyDialog, setShowReplyDialog] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [replyStatus, setReplyStatus] = useState<string | null>(null);

	const handleForward = async () => {
		setForwardStatus("Forwarding...");
		try {
			const msg = await onForward(email.id, forwardTarget.trim() || undefined);
			setForwardStatus(msg);
			setTimeout(() => {
				setShowForwardDialog(false);
				setForwardStatus(null);
			}, 1800);
		} catch (err) {
			setForwardStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const handleReply = async () => {
		if (!replyText.trim()) return;
		setReplyStatus("Sending reply...");
		try {
			await onReply({
				email_id: email.id,
				from: email.to_address,
				to: email.from_address,
				subject: email.subject || "Reply",
				text: replyText.trim(),
			});
			setReplyStatus("Reply sent successfully!");
			setTimeout(() => {
				setShowReplyDialog(false);
				setReplyText("");
				setReplyStatus(null);
			}, 1800);
		} catch (err) {
			setReplyStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
		}
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
					<div>
						<h3 id="modal-email-title">{email.subject || "(No subject)"}</h3>
						<div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 2 }}>
							From: <b>{email.from_address}</b>
						</div>
						<div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
							{new Date(email.received_at * 1000).toLocaleString()}
						</div>
					</div>
					<div style={{ display: "flex", gap: 4 }}>
						<button
							type="button"
							className="btn-icon"
							onClick={() => onToggleStar(email.id, email.is_starred)}
							title={email.is_starred ? "Unstar" : "Star"}
						>
							<Star
								size={20}
								fill={email.is_starred ? "#eab308" : "transparent"}
								color={email.is_starred ? "#eab308" : "var(--text-secondary)"}
							/>
						</button>
						<button type="button" className="btn-icon" onClick={onClose}>
							<X size={20} />
						</button>
					</div>
				</div>

				{email.otp_code && (
					<div className="otp-banner">
						<Key size={18} />
						<div style={{ flex: 1 }}>
							<div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Verification Code:</div>
							<div style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "1px" }}>
								{email.otp_code}
							</div>
						</div>
						<button
							type="button"
							className="btn btn-secondary btn-sm"
							onClick={() => {
								if (email.otp_code) onCopyOtp(email.otp_code);
							}}
						>
							{copiedOtp === email.otp_code ? <Check size={16} /> : <Copy size={16} />}
						</button>
					</div>
				)}

				{features.aiSummary && email.summary && (
					<div className="ai-summary-banner">
						<Sparkles size={16} color="var(--accent)" />
						<div>
							<div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)" }}>
								AI Summary ({features.aiProvider})
							</div>
							<div style={{ fontSize: "0.85rem", marginTop: 2 }}>{email.summary}</div>
						</div>
					</div>
				)}

				{attachments.length > 0 && (
					<div className="attachments-list">
						<div
							style={{
								fontSize: "0.8rem",
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							<Paperclip size={14} /> Attachments ({attachments.length})
						</div>
						{attachments.map((att) => (
							<button
								key={att.id}
								type="button"
								className="attachment-item"
								onClick={async () => {
									try {
										await apiService.downloadAttachment(att);
									} catch (err) {
										setReplyStatus(`Download failed: ${err instanceof Error ? err.message : err}`);
									}
								}}
								title={`Download ${att.file_name}`}
							>
								<div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
									<div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{att.file_name}</div>
									<div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
										{Math.round(att.file_size / 1024)} KB
									</div>
								</div>
								<Download size={16} color="var(--accent)" />
							</button>
						))}
					</div>
				)}

				<div className="modal-body">
					{email.html_content ? (
						<div
							// biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted viewer
							dangerouslySetInnerHTML={{ __html: email.html_content }}
						/>
					) : (
						<pre style={{ whiteSpace: "pre-wrap" }}>{email.text_content || "Empty content"}</pre>
					)}
				</div>

				{showForwardDialog && (
					<div className="action-subdrawer">
						<div style={{ fontSize: "0.85rem", fontWeight: 600 }}>Forward this email</div>
						<label
							htmlFor="forward-target-input"
							style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
						>
							Target email address
						</label>
						<input
							id="forward-target-input"
							type="email"
							className="form-input"
							placeholder="target@example.com (or blank for default)"
							value={forwardTarget}
							onChange={(e) => setForwardTarget(e.target.value)}
						/>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<button
								type="button"
								className="btn btn-secondary btn-sm"
								onClick={() => setShowForwardDialog(false)}
							>
								Cancel
							</button>
							<button type="button" className="btn btn-primary btn-sm" onClick={handleForward}>
								<Send size={14} /> Send Forward
							</button>
						</div>
						{forwardStatus && <div className="status-msg">{forwardStatus}</div>}
					</div>
				)}

				{showReplyDialog && (
					<div className="action-subdrawer">
						<div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
							Reply to {email.from_address}
						</div>
						<label
							htmlFor="reply-text-input"
							style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
						>
							Reply message
						</label>
						<textarea
							id="reply-text-input"
							className="form-input"
							rows={3}
							placeholder="Write your response message..."
							value={replyText}
							onChange={(e) => setReplyText(e.target.value)}
						/>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<button
								type="button"
								className="btn btn-secondary btn-sm"
								onClick={() => setShowReplyDialog(false)}
							>
								Cancel
							</button>
							<button type="button" className="btn btn-primary btn-sm" onClick={handleReply}>
								<Reply size={14} /> Send Reply
							</button>
						</div>
						{replyStatus && <div className="status-msg">{replyStatus}</div>}
					</div>
				)}

				<ModalToolbar
					features={features}
					showReplyDialog={showReplyDialog}
					showForwardDialog={showForwardDialog}
					onToggleReply={() => {
						setShowReplyDialog(!showReplyDialog);
						setShowForwardDialog(false);
					}}
					onToggleForward={() => {
						setShowForwardDialog(!showForwardDialog);
						setShowReplyDialog(false);
					}}
					onDelete={() => onDelete(email.id)}
				/>
			</div>
		</div>
	);
}

interface ModalToolbarProps {
	features: FeatureFlags;
	showReplyDialog: boolean;
	showForwardDialog: boolean;
	onToggleReply: () => void;
	onToggleForward: () => void;
	onDelete: () => void;
}

/**
 * Confirmed action bar. Reply and Forward only render when the Worker reports the
 * matching optional capability, so a deployment without Resend hides them.
 */
function ModalToolbar(props: ModalToolbarProps) {
	return (
		<div className="modal-footer-toolbar">
			<div style={{ display: "flex", gap: 6 }}>
				{props.features.outbound ? (
					<button type="button" className="btn btn-secondary btn-sm" onClick={props.onToggleReply}>
						<Reply size={15} /> Reply
					</button>
				) : null}
				{props.features.forward ? (
					<button
						type="button"
						className="btn btn-secondary btn-sm"
						onClick={props.onToggleForward}
					>
						<Forward size={15} /> Forward
					</button>
				) : null}
			</div>
			<button
				type="button"
				className="btn btn-secondary btn-sm"
				style={{ color: "var(--danger)" }}
				onClick={props.onDelete}
			>
				<Trash2 size={15} /> Delete
			</button>
		</div>
	);
}
