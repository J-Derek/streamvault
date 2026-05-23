import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, AlertTriangle } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("ErrorBoundary caught:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center p-4">
                    <div className="max-w-md text-center space-y-6">
                        <div className="w-16 h-16 rounded-full bg-[#E50914]/10 flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-8 h-8 text-[#E50914]" />
                        </div>
                        <h1 className="text-2xl font-black">Something went wrong</h1>
                        <p className="text-[#AEAEB2] text-sm">
                            {this.state.error?.message || "An unexpected error occurred"}
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => {
                                    this.setState({ hasError: false, error: null });
                                    window.location.reload();
                                }}
                                className="px-6 py-2.5 rounded-full bg-[#E50914] text-white font-bold text-sm hover:bg-[#B00610] transition-colors"
                            >
                                Reload page
                            </button>
                            <Link
                                to="/"
                                onClick={() => this.setState({ hasError: false, error: null })}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#1C1C1E] border border-[#3A3A3C] text-[#AEAEB2] hover:text-white font-bold text-sm transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Go Home
                            </Link>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
