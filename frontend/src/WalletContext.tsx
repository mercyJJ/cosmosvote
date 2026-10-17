/**
 * WalletContext — backward-compatible shim.
 *
 * State is now managed by the Zustand walletStore. This file re-exports
 * the hook and a no-op provider so that existing component imports continue
 * to work without modification.
 *
 * Issue #379: centralized state management migration with Zustand.
 * Issue #13: Removed duplicate / stale context declarations left over from
 *            the pre-Zustand implementation that caused TypeScript errors.
 */
import React from 'react';
import { useWalletStore } from './store/walletStore';

// Re-export the hook under the original name for component compatibility.
// All wallet state (walletAddress, tokenBalance, showModal, connect,
// disconnect, …) is sourced exclusively from the Zustand walletStore.
export function useWallet() {
  return useWalletStore();
}

// No-op provider kept for backward compatibility with components that wrap
// their subtree in <WalletProvider>.
export function WalletProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
