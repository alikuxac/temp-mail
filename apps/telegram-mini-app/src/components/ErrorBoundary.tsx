import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
}

interface ErrorBoundaryState {
	error: Error | null;
}

/**
 * Catches render-time crashes and displays them instead of a blank page.
 * Needed because the Discord Activity iframe and the Telegram Mini App often
 * have no usable browser console.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("Render error:", error, info.componentStack);
	}

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;

		return (
			<div
				style={{
					padding: 16,
					font: "13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
					color: "#ff6b6b",
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
				}}
			>
				<b>Render error</b>
				{"\n\n"}
				{error.name}: {error.message}
				{error.stack ? `\n\n${error.stack.split("\n").slice(0, 6).join("\n")}` : ""}
			</div>
		);
	}
}
