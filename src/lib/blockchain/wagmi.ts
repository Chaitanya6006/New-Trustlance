// src/lib/blockchain/wagmi.ts

import {
    createConfig,
    http,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { getConnectors } from "wagmi/actions";

import {
    createPublicClient,
    defineChain,
    type EIP1193Provider,
} from "viem";

export const mstTestnet = defineChain({
    id: 91562037,
    name: "MST Testnet",
    nativeCurrency: {
        name: "Testnet MST Coin",
        symbol: "tMSTC",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: [
                (import.meta.env.VITE_RPC_URL as string | undefined) ||
                (import.meta.env.NEXT_PUBLIC_RPC_URL as string | undefined) ||
                "https://testnetrpc.mstblockchain.com",
            ],
        },
    },
    blockExplorers: {
        default: {
            name: "MSTScan",
            url: "https://testnet.mstscan.com",
        },
    },
});

export const hardhatLocal = defineChain({
    id: 31337,
    name: "Hardhat Local",
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: ["http://127.0.0.1:8545"],
        },
    },
});

const targetChainId = Number(
    import.meta.env.VITE_CHAIN_ID ||
    import.meta.env.NEXT_PUBLIC_CHAIN_ID ||
    91562037
);

export const activeChain =
    targetChainId === hardhatLocal.id ? hardhatLocal : mstTestnet;

export type CustomEthereumProvider = EIP1193Provider & {
    isBridgeKey?: boolean;
    isMetaMask?: boolean;
    providers?: CustomEthereumProvider[];
};

interface WindowWithEthereum {
    bridgekey?: CustomEthereumProvider;
    ethereum?: CustomEthereumProvider & {
        providers?: CustomEthereumProvider[];
    };
}

type WalletError = Error & { code?: number };

/**
 * Detects and returns the preferred injected EVM provider.
 * Specifically checks for BridgeKey (via window.bridgekey, window.ethereum.isBridgeKey,
 * or within window.ethereum.providers multi-wallet array), falling back to window.ethereum.
 */
export function getBridgeKeyOrInjectedProvider(): CustomEthereumProvider | undefined {
    if (typeof window === "undefined") return undefined;
    const win = window as unknown as WindowWithEthereum;

    // 1. Direct window.bridgekey object if exposed by BridgeKey
    if (win.bridgekey && typeof win.bridgekey.request === "function") {
        return win.bridgekey;
    }

    // 2. Multi-wallet providers array (EIP-5749 / EIP-1193 multi-provider)
    if (Array.isArray(win.ethereum?.providers)) {
        const bk = win.ethereum.providers.find((p) => p.isBridgeKey);
        if (bk && typeof bk.request === "function") {
            return bk;
        }
    }

    // 3. window.ethereum with isBridgeKey flag
    if (win.ethereum?.isBridgeKey && typeof win.ethereum.request === "function") {
        return win.ethereum;
    }

    // 4. Default window.ethereum
    if (win.ethereum && typeof win.ethereum.request === "function") {
        return win.ethereum;
    }

    return undefined;
}

export const config = createConfig({
    chains: [mstTestnet, hardhatLocal],
    connectors: [
        injected({
            target() {
                const provider = getBridgeKeyOrInjectedProvider();
                if (!provider) return undefined;
                return {
                    id: provider.isBridgeKey ? "bridgekey" : "injected",
                    name: provider.isBridgeKey ? "BridgeKey" : "Injected Wallet",
                    provider: provider as unknown as Extract<
                        NonNullable<NonNullable<Parameters<typeof injected>[0]>["target"]>,
                        { id: string }
                    >["provider"],
                };
            },
        }),
    ],
    // Enables EIP-6963 provider discovery so BridgeKey and other installed wallets
    // are automatically detected without silent collision.
    multiInjectedProviderDiscovery: true,
    transports: {
        [mstTestnet.id]: http(
            (import.meta.env.VITE_RPC_URL as string | undefined) ||
            (import.meta.env.NEXT_PUBLIC_RPC_URL as string | undefined) ||
            "https://testnetrpc.mstblockchain.com"
        ),
        [hardhatLocal.id]: http("http://127.0.0.1:8545"),
    },
});

/**
 * Returns the preferred Wagmi connector, giving precedence to BridgeKey
 * (detected via EIP-6963 or custom target) before falling back to generic injected.
 */
export function getPreferredConnector() {
    const connectors = getConnectors(config);
    const bridgeKey = connectors.find(
        (c) =>
            c.name.toLowerCase().includes("bridgekey") ||
            c.id.toLowerCase().includes("bridgekey")
    );
    if (bridgeKey) return bridgeKey;

    const injectedConnector = connectors.find((c) => c.id === "injected");
    if (injectedConnector) return injectedConnector;

    return connectors[0];
}

/**
 * Returns user-facing details on the detected wallet extension.
 */
export function getDetectedWalletInfo(): {
    name: string;
    isBridgeKey: boolean;
    hasInjected: boolean;
} {
    const provider = getBridgeKeyOrInjectedProvider();
    if (!provider) {
        return { name: "None", isBridgeKey: false, hasInjected: false };
    }
    const win = typeof window !== "undefined" ? (window as unknown as WindowWithEthereum) : undefined;
    const isBK = Boolean(provider.isBridgeKey || win?.bridgekey);
    return {
        name: isBK ? "BridgeKey" : (provider.isMetaMask ? "MetaMask" : "Injected EVM Wallet"),
        isBridgeKey: isBK,
        hasInjected: true,
    };
}

interface SwitchableWalletClient {
    switchChain?: (args: { id: number }) => Promise<unknown>;
    addChain?: (args: { chain: typeof activeChain }) => Promise<unknown>;
}

/**
 * Safely switches the connected wallet or provider to the target chain (default: MST Testnet).
 * If the chain is not registered in the wallet (code 4902), invokes wallet_addEthereumChain.
 */
export async function switchOrAddChain(walletClientOrProvider?: unknown): Promise<void> {
    const targetChain = activeChain;

    const provider = (walletClientOrProvider as CustomEthereumProvider | undefined) || getBridgeKeyOrInjectedProvider();

    // 0. Pre-flight check: if already on target chain, skip redundant network switch
    if (provider && typeof provider.request === "function") {
        try {
            const currentChainHex = (await provider.request({
                method: "eth_chainId",
            })) as string;
            const currentChainId =
                typeof currentChainHex === "string"
                    ? parseInt(currentChainHex, 16)
                    : Number(currentChainHex);

            if (currentChainId === targetChain.id) {
                console.log(
                    `[Wagmi] Already on ${targetChain.name} (${targetChain.id}). Skipping network switch.`
                );
                return;
            }
        } catch {
            // Fall through to switch logic
        }
    }

    // 1. Viem WalletClient pathway
    const walletClient = walletClientOrProvider as SwitchableWalletClient | undefined;
    if (walletClient && typeof walletClient.switchChain === "function") {
        try {
            await walletClient.switchChain({ id: targetChain.id });
            return;
        } catch (err: unknown) {
            const switchError = err as WalletError;
            if (switchError?.code === 4001) {
                throw new Error("Network switch to MST Testnet was rejected in your wallet.", {
                    cause: err,
                });
            }

            const isMissingChain =
                switchError?.code === 4902 ||
                switchError?.message?.includes("4902") ||
                switchError?.message?.toLowerCase().includes("unrecognized") ||
                switchError?.message?.toLowerCase().includes("not added");

            if (isMissingChain && typeof walletClient.addChain === "function") {
                try {
                    await walletClient.addChain({ chain: targetChain });
                    await walletClient.switchChain({ id: targetChain.id });
                    return;
                } catch (addErr: unknown) {
                    const addError = addErr as WalletError;
                    if (addError?.code === 4001) {
                        throw new Error("Adding MST Testnet network was rejected in your wallet.", {
                            cause: addErr,
                        });
                    }
                    throw new Error(`Failed to add MST Testnet to your wallet: ${addError?.message || String(addErr)}`, {
                        cause: addErr,
                    });
                }
            }
            throw err;
        }
    }

    // 2. Direct EIP-1193 Provider pathway
    if (!provider || typeof provider.request !== "function") {
        return;
    }

    const hexChainId = `0x${targetChain.id.toString(16)}`;

    try {
        await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: hexChainId }],
        });
    } catch (err: unknown) {
        const switchError = err as WalletError;
        if (switchError?.code === 4001) {
            throw new Error("Network switch to MST Testnet was rejected in your wallet.", {
                cause: err,
            });
        }

        const isMissingChain =
            switchError?.code === 4902 ||
            switchError?.message?.includes("4902") ||
            switchError?.message?.toLowerCase().includes("unrecognized") ||
            switchError?.message?.toLowerCase().includes("not added");

        if (isMissingChain) {
            try {
                await provider.request({
                    method: "wallet_addEthereumChain",
                    params: [
                        {
                            chainId: hexChainId,
                            chainName: targetChain.name,
                            nativeCurrency: targetChain.nativeCurrency,
                            rpcUrls: targetChain.rpcUrls.default.http,
                            blockExplorerUrls: targetChain.blockExplorers?.default
                                ? [targetChain.blockExplorers.default.url]
                                : [],
                        },
                    ],
                });
            } catch (addErr: unknown) {
                const addError = addErr as WalletError;
                if (addError?.code === 4001) {
                    throw new Error("Adding MST Testnet was rejected in your wallet.", {
                        cause: addErr,
                    });
                }
                throw new Error(`Failed to add MST Testnet to wallet: ${addError?.message || String(addErr)}`, {
                    cause: addErr,
                });
            }
        } else {
            throw err;
        }
    }
}

export const publicClient = createPublicClient({
    chain: activeChain,
    transport: http(
        activeChain.id === hardhatLocal.id
            ? "http://127.0.0.1:8545"
            : (import.meta.env.VITE_RPC_URL as string | undefined) ||
              (import.meta.env.NEXT_PUBLIC_RPC_URL as string | undefined) ||
              "https://testnetrpc.mstblockchain.com"
    ),
});