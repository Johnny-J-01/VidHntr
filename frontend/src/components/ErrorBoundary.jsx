import React from "react";

export class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error) {
		return { hasError: true, error };
	}

	componentDidCatch(error, errorInfo) {
		console.error(
			"React Error Boundary caught an error:",
			error,
			errorInfo,
		);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<div className="flex flex-col items-center justify-center h-full p-8 text-center bg-zinc-950 text-zinc-200">
					<h2 className="text-xl font-semibold mb-4">
						Something went wrong in this section.
					</h2>
					<button
						className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors"
						onClick={() => {
							this.setState({ hasError: false, error: null });
							if (this.props.onReset) this.props.onReset();
						}}
					>
						Reset View
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
