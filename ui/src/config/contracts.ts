// Placeholder config.
// After deploying to Sepolia, run:
//   npx hardhat deploy --network sepolia
//   npx hardhat sync-ui --network sepolia
// to overwrite this file with the generated address + ABI from deployments/sepolia.

export const CONTRACT_ADDRESS = '0xc275c1ea692ee0E002051C29C0D7be1Bae135Bbd';

export const CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "netCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "bytes32", "name": "encryptedKey", "type": "bytes32" },
      { "internalType": "bytes", "name": "inputProof", "type": "bytes" }
    ],
    "name": "createNet",
    "outputs": [{ "internalType": "uint256", "name": "netId", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "netId", "type": "uint256" }],
    "name": "joinNet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "netId", "type": "uint256" },
      { "internalType": "address", "name": "member", "type": "address" }
    ],
    "name": "isMember",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "netId", "type": "uint256" }],
    "name": "getNetInfo",
    "outputs": [
      { "internalType": "string", "name": "", "type": "string" },
      { "internalType": "address", "name": "", "type": "address" },
      { "internalType": "uint64", "name": "", "type": "uint64" },
      { "internalType": "uint32", "name": "", "type": "uint32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "netId", "type": "uint256" }],
    "name": "getEncryptedKey",
    "outputs": [{ "internalType": "eaddress", "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "netId", "type": "uint256" },
      { "internalType": "bytes", "name": "encryptedMessage", "type": "bytes" }
    ],
    "name": "sendMessage",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "netId", "type": "uint256" },
      { "internalType": "uint256", "name": "start", "type": "uint256" },
      { "internalType": "uint256", "name": "limit", "type": "uint256" }
    ],
    "name": "getMessages",
    "outputs": [
      { "internalType": "address[]", "name": "senders", "type": "address[]" },
      { "internalType": "uint64[]", "name": "timestamps", "type": "uint64[]" },
      { "internalType": "bytes[]", "name": "data", "type": "bytes[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

