import { create } from 'zustand';
import { isConnected, requestAccess, getAddress, signTransaction as freighterSignTransaction } from '@stellar/freighter-api';
import { fetchTokenBalance } from '../api';

type WalletName = 'Freighter' | 'xBull';

interface WalletState {
  walletAddress: string | null;
  walletName: WalletName | null;
  tokenBalance: bigint | null;
  showModal: boolean;

  // Actions
  openModal: () => void;
  closeModal: () => void;
  connect: (wallet: WalletName) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  /**
   * Sign a Stellar transaction XDR string using the connected wallet.
   * Returns the signed XDR, or throws if no wallet is connected or the
   * user rejects the signing request.
   */
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  walletAddress: sessionStorage.getItem('cosmosvote-wallet-address'),
  walletName: sessionStorage.getItem('cosmosvote-wallet-name') as WalletName | null,
  tokenBalance: null,
  showModal: false,

  openModal: () => set({ showModal: true }),
  closeModal: () => set({ showModal: false }),

  connect: async (wallet) => {
    let address: string | null = null;

    if (wallet === 'Freighter') {
      const connected = await isConnected();
      if (!connected) {
        throw new Error(
          'Freighter wallet extension not found. Please install it from https://freighter.app and refresh.'
        );
      }
      await requestAccess();
      const result = await getAddress();
      if (result.error) throw new Error(result.error.message);
      address = result.address;
    } else if (wallet === 'xBull') {
      const sdk = (window as unknown as { xBullSDK?: { connect: () => Promise<{ publicKey: string }> } }).xBullSDK;
      if (!sdk) throw new Error('xBull extension not found');
      const result = await sdk.connect();
      address = result.publicKey;
    }

    if (!address) return;

    sessionStorage.setItem('cosmosvote-wallet-address', address);
    sessionStorage.setItem('cosmosvote-wallet-name', wallet);
    set({ walletAddress: address, walletName: wallet, showModal: false });

    fetchTokenBalance(address)
      .then(tokenBalance => set({ tokenBalance }))
      .catch(() => set({ tokenBalance: null }));
  },

  disconnect: () => {
    sessionStorage.removeItem('cosmosvote-wallet-address');
    sessionStorage.removeItem('cosmosvote-wallet-name');
    set({ walletAddress: null, walletName: null, tokenBalance: null });
  },

  refreshBalance: async () => {
    const { walletAddress } = get();
    if (!walletAddress) return;
    try {
      const tokenBalance = await fetchTokenBalance(walletAddress);
      set({ tokenBalance });
    } catch {
      set({ tokenBalance: null });
    }
  },

  signTransaction: async (xdr: string, networkPassphrase: string): Promise<string> => {
    const { walletName, walletAddress } = get();

    if (!walletAddress) {
      throw new Error('No wallet connected. Please connect your wallet first.');
    }

    if (walletName === 'Freighter') {
      const result = await freighterSignTransaction(xdr, { networkPassphrase });
      if ('error' in result && result.error) {
        const msg = result.error.message ?? String(result.error);
        if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) {
          throw new Error('Transaction signing rejected by user.');
        }
        throw new Error(`Freighter signing error: ${msg}`);
      }
      if ('signedTxXdr' in result) {
        return result.signedTxXdr;
      }
      throw new Error('Unexpected response from Freighter signTransaction');
    } else if (walletName === 'xBull') {
      const sdk = (window as unknown as {
        xBullSDK?: { signTransaction: (xdr: string) => Promise<{ signedXDR: string }> };
      }).xBullSDK;
      if (!sdk) throw new Error('xBull extension not found');
      const result = await sdk.signTransaction(xdr);
      return result.signedXDR;
    }

    throw new Error('No supported wallet connected');
  },
}));
