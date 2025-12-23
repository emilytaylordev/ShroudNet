import { createConfig, createStorage, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { sepolia } from 'wagmi/chains';

const memory = new Map<string, string>();

const memoryStorage = {
  getItem(key: string) {
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
  },
  removeItem(key: string) {
    memory.delete(key);
  },
};

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [sepolia.id]: http(),
  },
  storage: createStorage({ storage: memoryStorage }),
  ssr: false,
});
