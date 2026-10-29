// src/services/auth.service.ts

import { supabase } from "../supabase/client";
import {
    activeChain,
    config,
    getBridgeKeyOrInjectedProvider,
    getPreferredConnector,
    switchOrAddChain,
} from "../blockchain/wagmi";
import {
    connect,
    disconnect,
    getAccount,
    getWalletClient,
} from "wagmi/actions";
import type { Address } from "viem";

export type AuthStage =
    | "connecting_wallet"
    | "verifying_network"
    | "awaiting_signature"
    | "verifying_session"
    | "setting_up_profile";

type WalletError = Error & { code?: number };

function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timer);
    });
}

export class AuthService {
    /**
     * Authenticates with Supabase while synchronizing Wagmi's active connection
     * to the exact same BridgeKey/injected account, verifying network compatibility.
     */
    async signInWithWallet(
        accountType: "freelancer" | "company",
        onStageChange?: (stage: AuthStage) => void
    ) {
        console.log(`[AuthService] Starting wallet sign-in for role: ${accountType}`);
        const provider = getBridgeKeyOrInjectedProvider();

        if (!provider) {
            throw new Error(
                "No EVM wallet detected. Please install BridgeKey (or an EVM wallet extension) to connect."
            );
        }

        // 1. Ensure Wagmi connects to the preferred wallet (BridgeKey prioritized)
        onStageChange?.("connecting_wallet");
        const connector = getPreferredConnector();
        if (!connector) {
            throw new Error("No wallet connector available in Wagmi configuration.");
        }

        console.log(`[AuthService] Connecting via connector: ${connector.name} (${connector.id})`);

        let wagmiAddress: Address;
        try {
            const existingAccount = getAccount(config);
            if (existingAccount.isConnected && existingAccount.address) {
                wagmiAddress = existingAccount.address;
                console.log(`[AuthService] Using existing Wagmi connection: ${wagmiAddress.slice(0, 6)}...${wagmiAddress.slice(-4)}`);
            } else {
                const connectResult = await connect(config, { connector });
                wagmiAddress = connectResult.accounts[0];
                console.log(`[AuthService] Wagmi connected: ${wagmiAddress.slice(0, 6)}...${wagmiAddress.slice(-4)}`);
            }
        } catch (connectErr: unknown) {
            const connectError = connectErr as WalletError;
            if (
                connectError?.code === 4001 ||
                connectError?.message?.toLowerCase().includes("reject") ||
                connectError?.message?.toLowerCase().includes("denied")
            ) {
                throw new Error("Connection request was rejected in your wallet.", {
                    cause: connectErr,
                });
            }
            throw new Error(`Failed to connect wallet: ${connectError?.message || String(connectErr)}`, {
                cause: connectErr,
            });
        }

        // 2. Ensure the connected wallet is on MST Testnet (or target activeChain)
        onStageChange?.("verifying_network");
        console.log(`[AuthService] Verifying network (target: ${activeChain.name}, ID: ${activeChain.id})`);
        try {
            const walletClient = await getWalletClient(config);
            if (walletClient) {
                await switchOrAddChain(walletClient);
            } else {
                await switchOrAddChain(provider);
            }
        } catch (chainError: unknown) {
            const err = chainError as WalletError;
            if (err?.message?.toLowerCase().includes("reject")) {
                await disconnect(config).catch(() => {});
                throw chainError;
            }
            console.warn("[AuthService] Chain switch warning during sign in:", chainError);
        }

        type SupabaseEthereumWallet = NonNullable<
            Exclude<
                Extract<
                    Parameters<typeof supabase.auth.signInWithWeb3>[0],
                    { chain: "ethereum" }
                >,
                { signature: unknown }
            >["wallet"]
        >;

        // 3. Authenticate with Supabase Auth using the EXACT same provider
        // Wrapped with a 60-second timeout so closing the BridgeKey popup window does not hang the UI indefinitely
        onStageChange?.("awaiting_signature");
        console.log("[AuthService] Requesting SIWE signature via BridgeKey. Approval popup opened.");

        let data: { user: import("@supabase/supabase-js").User | null; session: import("@supabase/supabase-js").Session | null };
        try {
            const authResult = await withTimeout(
                supabase.auth.signInWithWeb3({
                    chain: "ethereum",
                    statement:
                        "Sign in to TrustLance. By signing this message, you agree to the TrustLance Terms of Service.",
                    wallet: provider as unknown as SupabaseEthereumWallet,
                    options: {
                        signInWithEthereum: {
                            chainId: activeChain.id,
                        },
                    },
                }),
                60_000,
                "BridgeKey signature request timed out. If the BridgeKey approval window was closed or dismissed, please click Connect to try again."
            );

            if (authResult.error) {
                await disconnect(config).catch(() => {});
                const err = authResult.error as unknown as WalletError;
                if (
                    authResult.error.message?.toLowerCase().includes("reject") ||
                    authResult.error.message?.toLowerCase().includes("denied") ||
                    err?.code === 4001
                ) {
                    throw new Error("Signature request was rejected in your wallet.", {
                        cause: authResult.error,
                    });
                }
                throw authResult.error;
            }

            data = authResult.data;
        } catch (signErr: unknown) {
            await disconnect(config).catch(() => {});
            throw signErr;
        }

        onStageChange?.("verifying_session");
        console.log("[AuthService] Signature verified by Supabase. Validating session user...");

        const user = data.user;
        if (!user) {
            await disconnect(config).catch(() => {});
            throw new Error(
                "Wallet authentication succeeded but no user session was returned."
            );
        }

        const authAddress = (
            user.user_metadata?.custom_claims?.address as string | undefined
        )?.toLowerCase();

        // 4. Verify that Supabase Auth and Wagmi addresses strictly match
        if (
            authAddress &&
            wagmiAddress &&
            authAddress !== wagmiAddress.toLowerCase()
        ) {
            await disconnect(config).catch(() => {});
            await supabase.auth.signOut().catch(() => {});
            throw new Error(
                `Wallet address mismatch: Supabase signed with ${authAddress} but Wagmi is connected to ${wagmiAddress}. Please ensure the active account in BridgeKey is selected.`
            );
        }

        const targetAddress = (authAddress || wagmiAddress) as Address;

        // 5. Create or update the base profile in Supabase
        onStageChange?.("setting_up_profile");
        console.log(`[AuthService] Upserting user profile for: ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`);
        const { error: profileError } = await supabase
            .from("profiles")
            .upsert(
                {
                    id: user.id,
                    wallet_address: targetAddress,
                    account_type: accountType,
                },
                {
                    onConflict: "id",
                }
            );

        if (profileError) {
            console.error("[AuthService] Profile upsert error:", profileError.message);
            throw new Error(`Profile setup failed: ${profileError.message}`);
        }

        console.log("[AuthService] Wallet authentication completed successfully.");

        return {
            data,
            accountType,
            address: targetAddress,
        };
    }

    /**
     * Signs out of Supabase and disconnects Wagmi in tandem.
     */
    async signOut() {
        await Promise.allSettled([
            supabase.auth.signOut(),
            disconnect(config),
        ]);
    }

    async getSession() {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            throw error;
        }

        return data.session;
    }

    async getUser() {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            throw error;
        }

        return data.user;
    }

    onAuthStateChange(
        callback: Parameters<typeof supabase.auth.onAuthStateChange>[0],
    ) {
        return supabase.auth.onAuthStateChange(callback);
    }
}

export const authService = new AuthService();
