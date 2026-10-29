import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import type { Session, User } from "@supabase/supabase-js";
import { authService, type AuthStage } from "../../lib/services/auth.service";
import { config } from "../../lib/blockchain/wagmi";
import { reconnect, disconnect } from "wagmi/actions";

interface AuthContextValue {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signIn: (
        accountType: "freelancer" | "company",
        onStageChange?: (stage: AuthStage) => void
    ) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(
    undefined,
);

export function AuthProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        // Automatically restore Wagmi wallet session in tandem with Supabase
        reconnect(config).catch(() => {});

        authService
            .getSession()
            .then((session) => {
                if (mounted) {
                    setSession(session);
                }
            })
            .finally(() => {
                if (mounted) {
                    setLoading(false);
                }
            });

        const {
            data: { subscription },
        } = authService.onAuthStateChange(
            async (event, session) => {
                setSession(session);
                if (event === "SIGNED_OUT") {
                    disconnect(config).catch(() => {});
                }
            },
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signIn = async (
        accountType: "freelancer" | "company",
        onStageChange?: (stage: AuthStage) => void
    ) => {
        await authService.signInWithWallet(accountType, onStageChange);
    };

    const signOut = async () => {
        await authService.signOut();
        setSession(null);
    };

    return (
        <AuthContext.Provider
            value={{
                session,
                user: session?.user ?? null,
                loading,
                signIn,

                signOut,
            }
            }
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error(
            "useAuth must be used inside AuthProvider",
        );
    }

    return context;
}