# ShroudNet

ShroudNet is a confidential group chat where every group (a "Net") holds a shared secret key A that is stored on-chain in encrypted form via Zama FHEVM. Members decrypt A client-side and use it to encrypt and decrypt messages, while the blockchain keeps an auditable record of group membership and encrypted payloads.

## Introduction

ShroudNet combines on-chain membership with off-chain message confidentiality. Each Net has a human-readable name and a shared key A. The key A is encrypted with FHE and stored as an encrypted handle in the contract. Members who join the Net gain permission to decrypt the handle using the Zama relayer workflow. Messages are encrypted in the browser using AES-GCM derived from key A and stored as bytes on-chain.

## Problems ShroudNet Solves

- Public blockchains expose message content if stored in plaintext; ShroudNet keeps all message bodies encrypted.
- Classic chat systems rely on centralized servers; ShroudNet anchors group membership and message ordering on-chain.
- Key distribution is the hard part of private chat; ShroudNet uses FHEVM ACL to grant decryption access to members only.
- Auditable membership is required for trustless group coordination; ShroudNet provides it without exposing message content.

## Key Advantages

- On-chain membership with off-chain confidentiality.
- FHE-protected shared key A that never appears in plaintext on-chain.
- Client-side encryption/decryption using Web Crypto (AES-GCM).
- Minimal on-chain footprint: only encrypted payload bytes are stored.
- Permissioned decryption via Zama's relayer and FHEVM ACL.
- Transparent, deterministic Net IDs and message ordering.

## How It Works (End-to-End)

1. Create Net
   - User chooses a Net name.
   - The frontend creates a random address to serve as key A.
   - The key A is encrypted as an FHE `eaddress` using Zama relayer input registration.
   - The contract stores the encrypted handle and grants access to the creator.

2. Join Net
   - Any address can join a Net.
   - The contract grants decryption permission for the encrypted key handle.

3. Decrypt Key A
   - The frontend retrieves the encrypted handle.
   - User performs Zama user decryption (EIP-712 signature + relayer).
   - The decrypted value becomes key A in the browser only.

4. Send Message
   - The browser derives an AES-GCM key from key A (SHA-256 of the address bytes).
   - The plaintext is encrypted with a random 12-byte IV.
   - The encrypted payload is sent to the contract and stored on-chain.

5. Read and Decrypt
   - Encrypted payloads are read from the contract.
   - Members decrypt using key A in the browser.

## Smart Contract Overview

Contract: `contracts/ShroudNet.sol`

Core data:
- `NetInfo`: name, creator, createdAt, memberCount, encryptedKey (FHE `eaddress`).
- `Message`: sender, timestamp, encrypted bytes.

Core actions:
- `createNet(name, encryptedKey, inputProof)`: creates a Net and stores encrypted key A.
- `joinNet(netId)`: joins and grants decryption permission to the key handle.
- `sendMessage(netId, encryptedMessage)`: stores encrypted payload (max 4096 bytes).

Read-only queries:
- `netCount()`: total Nets.
- `isMember(netId, member)`: membership check.
- `getNetInfo(netId)`: name, creator, createdAt, memberCount.
- `getEncryptedKey(netId)`: encrypted handle for key A.
- `getMessageCount(netId)` / `getMessage(netId, index)`.
- `getMessages(netId, start, limit)`: paginated batch read.

Events:
- `NetCreated`, `NetJoined`, `MessageSent`.

## Frontend Overview

Location: `ui/`

Key behaviors:
- Reads use `viem` public client.
- Writes use `ethers` signer.
- Wallet connection is provided by RainbowKit + wagmi.
- No browser local storage is used; wagmi state is stored in memory.
- The UI is configured for Sepolia only (no localhost).

Key files:
- `ui/src/components/ShroudNetApp.tsx`: main UI flow.
- `ui/src/lib/messageCrypto.ts`: AES-GCM encryption/decryption.
- `ui/src/config/contracts.ts`: contract address + ABI (TypeScript, not JSON).
- `ui/src/config/viem.ts` and `ui/src/config/wagmi.ts`: Sepolia RPC settings.

## Technology Stack

Smart contract:
- Solidity 0.8.27
- Zama FHEVM (`@fhevm/solidity`)
- Hardhat + hardhat-deploy
- TypeScript tasks and tests

Frontend:
- React + Vite
- RainbowKit + wagmi
- viem (read) + ethers (write)
- Zama relayer SDK (`@zama-fhe/relayer-sdk`)
- Web Crypto API for AES-GCM

## Repository Layout

- `contracts/` smart contracts (`ShroudNet.sol` is the main contract)
- `deploy/` hardhat-deploy scripts
- `tasks/` custom hardhat tasks (ShroudNet helper tasks)
- `test/` automated tests
- `ui/` React frontend
- `deployments/` generated artifacts used by the UI (after deploy)

## Setup and Usage

### Prerequisites

- Node.js 20+
- npm

### Install Dependencies

At repo root:

```bash
npm install
```

For the UI:

```bash
cd ui
npm install
```

### Environment Variables (Contracts Only)

Create a `.env` file at repo root and provide:

- `INFURA_API_KEY`
- `PRIVATE_KEY`
- Optional: `ETHERSCAN_API_KEY`

The Hardhat config loads these via `dotenv` and uses the private key for Sepolia deployments.

### Compile and Test

```bash
npm run compile
npm run test
```

### Local Development Chain

```bash
npm run chain
npm run deploy:localhost
```

Note: The UI is configured for Sepolia only, so local deployments are for contract testing and scripting.

### Deploy to Sepolia

```bash
npm run deploy:sepolia
```

### Sync Contract ABI + Address to the UI

After deployment, sync the ABI/address from `deployments/sepolia` into the UI:

```bash
npx hardhat sync-ui --deployments-network sepolia
```

This regenerates `ui/src/config/contracts.ts` so the frontend uses the correct ABI and address.

### Run the UI

```bash
cd ui
npm run dev
```

Open the app, connect your wallet on Sepolia, and:
- Create a Net
- Join it
- Decrypt key A
- Send and decrypt messages

## Hardhat Tasks (ShroudNet)

Examples:

```bash
npx hardhat --network sepolia shroudnet:address
npx hardhat --network sepolia shroudnet:create-net --name "My Net" --key 0x1111111111111111111111111111111111111111
npx hardhat --network sepolia shroudnet:join --netid 0
npx hardhat --network sepolia shroudnet:send --netid 0 --data 0x1234
```

## Security and Privacy Notes

- Message bodies are encrypted; metadata (sender address, timestamps, sizes, and Net membership) is public.
- Anyone with key A can decrypt messages. Protect it as a shared secret.
- Client-side decryption uses Zama user decryption and requires a signed EIP-712 request.
- Messages are stored on-chain forever unless the chain itself is pruned.

## Limits and Design Decisions

- Max message payload size: 4096 bytes.
- The UI loads up to 50 messages per Net in a single request.
- No message edit or deletion features.
- Net IDs are sequential; there is no custom slug mapping.
- Key A is derived from a random address; AES-GCM key is derived from SHA-256 of that address.

## Future Roadmap

- Pagination controls in the UI for older messages.
- Group admin roles, metadata, and moderated membership.
- Message attachments with client-side encryption.
- Optional key rotation and re-encryption flow for long-lived Nets.
- Encrypted on-chain search indexes for messages.
- Improved UX for key management and re-joins after wallet changes.

## License

BSD-3-Clause-Clear. See `LICENSE`.
