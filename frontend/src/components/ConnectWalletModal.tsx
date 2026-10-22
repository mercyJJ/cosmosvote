import { useState } from 'react';
import { useWallet } from '../WalletContext';

const WALLET_INFO: Record<'Freighter' | 'xBull', { icon: string; installUrl: string }> = {
  Freighter: {
    icon: '🚀',
    installUrl: 'https://freighter.app',
  },
  xBull: {
    icon: '🐂',
    installUrl: 'https://xbull.app',
  },
};

function isFreighterInstallError(message: string): boolean {
  return (
    message.toLowerCase().includes('freighter wallet extension not found') ||
    message.toLowerCase().includes('freighter') && message.toLowerCase().includes('not found')
  );
}

export function ConnectWalletModal() {
  const { connect, closeModal } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleConnect = async (wallet: 'Freighter' | 'xBull') => {
    setError(null);
    setLoading(wallet);
    try {
      await connect(wallet);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(null);
    }
  };

  const isInstallError = !!error && isFreighterInstallError(error);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={closeModal}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: '2rem', minWidth: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="wallet-modal-title" style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', color: '#1e293b' }}>Connect Wallet</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(['Freighter', 'xBull'] as const).map(wallet => (
            <button
              key={wallet}
              onClick={() => handleConnect(wallet)}
              disabled={!!loading}
              aria-busy={loading === wallet}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', border: '1px solid #e5e7eb', borderRadius: 8,
                background: loading === wallet ? '#f1f5f9' : '#fff',
                cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 500,
              }}
            >
              {loading === wallet ? '⏳' : WALLET_INFO[wallet].icon} {wallet}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" style={{ marginTop: '1rem' }}>
            <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>{error}</p>
            {isInstallError && (
              <a
                href={WALLET_INFO['Freighter'].installUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: '0.5rem', color: '#2563eb', fontSize: '0.875rem' }}
              >
                Install Freighter →
              </a>
            )}
          </div>
        )}

        <button
          onClick={closeModal}
          aria-label="Close wallet modal"
          style={{ marginTop: '1.25rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
