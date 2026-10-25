import { X } from "lucide-react";
import { useState } from "react";

interface CustomAddressModalProps {
	domain: string;
	onClose: () => void;
	onSubmit: (prefix: string) => Promise<void>;
}

export function CustomAddressModal({ domain, onClose, onSubmit }: CustomAddressModalProps) {
	const [prefix, setPrefix] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleCreate = async () => {
		if (!prefix.trim()) {
			setError("Prefix cannot be empty");
			return;
		}
		setError(null);
		try {
			await onSubmit(prefix.trim());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
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
			<div className="modal-content modal-sm" role="dialog" aria-modal="true">
				<div className="modal-header">
					<h3>Create Custom Address</h3>
					<button type="button" className="btn-icon" onClick={onClose}>
						<X size={18} />
					</button>
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 0" }}>
					<label
						htmlFor="custom-prefix-input"
						style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
					>
						Enter desired address prefix:
					</label>
					<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
						<input
							id="custom-prefix-input"
							type="text"
							className="form-input"
							placeholder="my.custom.prefix"
							value={prefix}
							onChange={(e) => setPrefix(e.target.value)}
						/>
						<span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>@{domain}</span>
					</div>
					{error && <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</div>}
					<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
						<button type="button" className="btn btn-secondary" onClick={onClose}>
							Cancel
						</button>
						<button type="button" className="btn btn-primary" onClick={handleCreate}>
							Create & Activate
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
