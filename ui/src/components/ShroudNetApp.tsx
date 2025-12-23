import { useCallback, useEffect, useMemo, useState } from 'react';
import { Contract, ethers } from 'ethers';
import { useAccount } from 'wagmi';

import { Header } from './Header';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { publicClient } from '../config/viem';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { decryptMessage, encryptMessage } from '../lib/messageCrypto';

import '../styles/ShroudNetApp.css';

type NetSummary = {
  netId: bigint;
  name: string;
  creator: string;
  createdAt: bigint;
  memberCount: bigint;
};

type EncryptedMessage = {
  index: bigint;
  sender: string;
  timestamp: bigint;
  data: `0x${string}`;
};

function toBigInt(value: bigint | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function normalizeDecryptedAddress(value: string): string {
  if (value.startsWith('0x') && value.length === 42) return ethers.getAddress(value);
  const asBigInt = BigInt(value);
  return ethers.getAddress(ethers.toBeHex(asBigInt, 20));
}

export function ShroudNetApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [contractAddressInput, setContractAddressInput] = useState<string>(CONTRACT_ADDRESS);
  const [contractAddressError, setContractAddressError] = useState<string | null>(null);

  const contractAddress = useMemo(() => {
    if (!ethers.isAddress(contractAddressInput)) return null;
    return ethers.getAddress(contractAddressInput);
  }, [contractAddressInput]);

  useEffect(() => {
    if (contractAddressInput.length === 0) {
      setContractAddressError('Contract address is required');
    } else if (!ethers.isAddress(contractAddressInput)) {
      setContractAddressError('Invalid contract address');
    } else {
      setContractAddressError(null);
    }
  }, [contractAddressInput]);

  const [nets, setNets] = useState<NetSummary[]>([]);
  const [selectedNetId, setSelectedNetId] = useState<bigint | null>(null);
  const [isMember, setIsMember] = useState<boolean>(false);

  const [createNetName, setCreateNetName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [sharedKeysByNetId, setSharedKeysByNetId] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<EncryptedMessage[]>([]);
  const [decryptedByIndex, setDecryptedByIndex] = useState<Record<string, string>>({});
  const [messageDraft, setMessageDraft] = useState('');

  const loadNets = useCallback(async () => {
    if (!contractAddress) return;

    const netCount = (await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'netCount',
    })) as bigint;

    const summaries: NetSummary[] = [];
    for (let i = 0n; i < netCount; i++) {
      const [name, creator, createdAtRaw, memberCountRaw] = (await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'getNetInfo',
        args: [i],
      })) as readonly [string, string, bigint | number, bigint | number];

      summaries.push({
        netId: i,
        name,
        creator,
        createdAt: toBigInt(createdAtRaw),
        memberCount: toBigInt(memberCountRaw),
      });
    }

    setNets(summaries);
    if (selectedNetId === null && summaries.length > 0) setSelectedNetId(summaries[0].netId);
  }, [contractAddress, selectedNetId]);

  const refreshSelectedNetMembership = useCallback(async () => {
    if (!contractAddress || selectedNetId === null || !address) {
      setIsMember(false);
      return;
    }

    const result = (await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'isMember',
      args: [selectedNetId, address],
    })) as boolean;
    setIsMember(result);
  }, [address, contractAddress, selectedNetId]);

  const loadMessages = useCallback(
    async (netId: bigint) => {
      if (!contractAddress) return;

      const [senders, timestamps, data] = (await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'getMessages',
        args: [netId, 0n, 50n],
      })) as readonly [readonly string[], readonly (bigint | number)[], readonly `0x${string}`[]];

      const next: EncryptedMessage[] = [];
      for (let i = 0; i < data.length; i++) {
        next.push({
          index: BigInt(i),
          sender: senders[i],
          timestamp: toBigInt(timestamps[i] as bigint | number),
          data: data[i],
        });
      }
      setMessages(next);
      setDecryptedByIndex({});
    },
    [contractAddress],
  );

  useEffect(() => {
    void loadNets();
  }, [loadNets]);

  useEffect(() => {
    void refreshSelectedNetMembership();
  }, [refreshSelectedNetMembership]);

  useEffect(() => {
    if (selectedNetId === null) return;
    void loadMessages(selectedNetId);
  }, [loadMessages, selectedNetId]);

  const createNet = async () => {
    if (!instance || !address || !signerPromise || !contractAddress) return;
    if (createNetName.trim().length === 0) return;

    setBusy('Creating Net...');
    setLastError(null);
    try {
      const sharedKey = ethers.Wallet.createRandom().address;
      const input = instance.createEncryptedInput(contractAddress, address);
      input.addAddress(sharedKey);
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not available');

      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.createNet(createNetName.trim(), encryptedInput.handles[0], encryptedInput.inputProof);
      await tx.wait();

      await loadNets();

      const newNetId = ((await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'netCount',
      })) as bigint) - 1n;

      setSharedKeysByNetId((prev) => ({ ...prev, [newNetId.toString()]: ethers.getAddress(sharedKey) }));
      setSelectedNetId(newNetId);
      setCreateNetName('');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
    } finally {
      setBusy(null);
    }
  };

  const joinSelectedNet = async () => {
    if (!address || !signerPromise || selectedNetId === null || !contractAddress) return;
    setBusy('Joining Net...');
    setLastError(null);
    try {
      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not available');
      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.joinNet(selectedNetId);
      await tx.wait();
      await refreshSelectedNetMembership();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
    } finally {
      setBusy(null);
    }
  };

  const decryptSelectedNetKey = async () => {
    if (!instance || !address || !signerPromise || selectedNetId === null || !contractAddress) return;
    setBusy('Decrypting shared key...');
    setLastError(null);
    try {
      const handle = (await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'getEncryptedKey',
        args: [selectedNetId],
      })) as `0x${string}`;

      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle, contractAddress }];

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not available');

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decryptedRaw = (result[handle] ?? '') as string;
      const decryptedKey = normalizeDecryptedAddress(decryptedRaw);
      setSharedKeysByNetId((prev) => ({ ...prev, [selectedNetId.toString()]: decryptedKey }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
    } finally {
      setBusy(null);
    }
  };

  const sendMessage = async () => {
    if (!address || !signerPromise || selectedNetId === null || !contractAddress) return;
    const sharedKey = sharedKeysByNetId[selectedNetId.toString()];
    if (!sharedKey) return;
    if (messageDraft.trim().length === 0) return;

    setBusy('Sending message...');
    setLastError(null);
    try {
      const encryptedPayload = await encryptMessage(sharedKey, messageDraft.trim());
      const signer = await signerPromise;
      if (!signer) throw new Error('Signer not available');
      const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.sendMessage(selectedNetId, encryptedPayload);
      await tx.wait();

      setMessageDraft('');
      await loadMessages(selectedNetId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
    } finally {
      setBusy(null);
    }
  };

  const decryptAtIndex = async (m: EncryptedMessage) => {
    const sharedKey = selectedNetId === null ? null : sharedKeysByNetId[selectedNetId.toString()];
    if (!sharedKey) return;

    setBusy('Decrypting message...');
    setLastError(null);
    try {
      const plaintext = await decryptMessage(sharedKey, m.data);
      setDecryptedByIndex((prev) => ({ ...prev, [m.index.toString()]: plaintext }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setLastError(message);
    } finally {
      setBusy(null);
    }
  };

  const selectedNet = selectedNetId === null ? null : nets.find((n) => n.netId === selectedNetId) ?? null;
  const selectedKey = selectedNetId === null ? null : sharedKeysByNetId[selectedNetId.toString()] ?? null;

  return (
    <div className="app-shell">
      <Header />
      <main className="main">
        <div className="layout">
          <section className="card sidebar">
            <h2 className="card-title">Contract</h2>
            <div className="field">
              <label className="label">Address</label>
              <input
                value={contractAddressInput}
                onChange={(e) => setContractAddressInput(e.target.value)}
                className="input"
                placeholder="0x..."
              />
              {contractAddressError && <div className="hint error">{contractAddressError}</div>}
              {!contractAddressError && <div className="hint">Sepolia only (no localhost)</div>}
            </div>

            <div className="divider" />

            <h2 className="card-title">Nets</h2>
            <div className="net-list">
              {nets.length === 0 && <div className="hint">No Nets found. Create one.</div>}
              {nets.map((n) => (
                <button
                  key={n.netId.toString()}
                  className={`net-item ${selectedNetId === n.netId ? 'selected' : ''}`}
                  onClick={() => setSelectedNetId(n.netId)}
                >
                  <div className="net-name">{n.name}</div>
                  <div className="net-meta">
                    <span>#{n.netId.toString()}</span>
                    <span>•</span>
                    <span>{n.memberCount.toString()} members</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="divider" />

            <h2 className="card-title">Create Net</h2>
            <div className="field">
              <label className="label">Name</label>
              <input value={createNetName} onChange={(e) => setCreateNetName(e.target.value)} className="input" />
            </div>
            <button
              className="button primary"
              onClick={() => void createNet()}
              disabled={!address || !instance || zamaLoading || !!zamaError || !contractAddress || createNetName.trim().length === 0 || !!busy}
            >
              Create (encrypts random key A)
            </button>

            <button className="button" onClick={() => void loadNets()} disabled={!contractAddress || !!busy}>
              Refresh Nets
            </button>
          </section>

          <section className="card content">
            <div className="content-header">
              <div>
                <h2 className="card-title">{selectedNet ? selectedNet.name : 'Select a Net'}</h2>
                {selectedNet && (
                  <div className="hint">
                    Net #{selectedNet.netId.toString()} • Created by {selectedNet.creator.slice(0, 6)}…
                    {selectedNet.creator.slice(-4)}
                  </div>
                )}
              </div>
              <div className="content-actions">
                <button className="button" onClick={() => selectedNetId !== null && void loadMessages(selectedNetId)} disabled={!selectedNetId || !!busy}>
                  Refresh Messages
                </button>
              </div>
            </div>

            {!address && <div className="hint">Connect your wallet to create/join/decrypt/send.</div>}
            {zamaError && <div className="hint error">{zamaError}</div>}
            {lastError && <div className="hint error">{lastError}</div>}

            {selectedNet && (
              <div className="status-row">
                <div className="status-pill">{isMember ? 'Member' : 'Not a member'}</div>
                <div className="status-pill">{selectedKey ? `Key A ready: ${selectedKey.slice(0, 8)}…` : 'Key A not decrypted'}</div>
                <div className="status-actions">
                  <button className="button" onClick={() => void joinSelectedNet()} disabled={!address || !contractAddress || !!busy || isMember}>
                    Join
                  </button>
                  <button
                    className="button primary"
                    onClick={() => void decryptSelectedNetKey()}
                    disabled={!address || !contractAddress || !!busy || !isMember || !instance || zamaLoading}
                  >
                    Decrypt Key A
                  </button>
                </div>
              </div>
            )}

            <div className="divider" />

            <div className="chat">
              <div className="messages">
                {messages.length === 0 && <div className="hint">No messages yet.</div>}
                {messages.map((m) => (
                  <div key={m.index.toString()} className="message">
                    <div className="message-meta">
                      <span className="mono">{m.sender.slice(0, 6)}…{m.sender.slice(-4)}</span>
                      <span>•</span>
                      <span>{new Date(Number(m.timestamp) * 1000).toLocaleString()}</span>
                      <span>•</span>
                      <span className="mono">#{m.index.toString()}</span>
                    </div>
                    <div className="message-body">
                      <div className="mono message-encrypted">{m.data}</div>
                      {selectedKey && (
                        <button className="button small" onClick={() => void decryptAtIndex(m)} disabled={!!busy}>
                          Decrypt
                        </button>
                      )}
                    </div>
                    {decryptedByIndex[m.index.toString()] && (
                      <div className="message-plain">{decryptedByIndex[m.index.toString()]}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="composer">
                <input
                  className="input"
                  placeholder={selectedKey ? 'Write a message...' : 'Decrypt Key A to send messages'}
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  disabled={!selectedKey || !isMember || !!busy}
                />
                <button className="button primary" onClick={() => void sendMessage()} disabled={!selectedKey || !isMember || !!busy || messageDraft.trim().length === 0}>
                  Send
                </button>
              </div>
              {busy && <div className="hint">{busy}</div>}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
