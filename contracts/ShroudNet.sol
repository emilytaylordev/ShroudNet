// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ShroudNet
/// @notice Confidential group chat where each Net stores an encrypted shared key (A) as an eaddress.
/// @dev Messages are encrypted/decrypted off-chain using the decrypted key A.
contract ShroudNet is ZamaEthereumConfig {
    struct NetInfo {
        string name;
        address creator;
        uint64 createdAt;
        uint32 memberCount;
        eaddress encryptedKey;
    }

    struct Message {
        address sender;
        uint64 timestamp;
        bytes data;
    }

    error NetNotFound(uint256 netId);
    error AlreadyMember(uint256 netId, address member);
    error NotMember(uint256 netId, address member);
    error EmptyName();
    error EmptyMessage();
    error MessageTooLarge(uint256 length);
    error InvalidPagination(uint256 start, uint256 limit);

    event NetCreated(uint256 indexed netId, address indexed creator, string name);
    event NetJoined(uint256 indexed netId, address indexed member);
    event MessageSent(uint256 indexed netId, uint256 indexed index, address indexed sender, uint64 timestamp);

    uint256 public netCount;

    mapping(uint256 netId => NetInfo) private _nets;
    mapping(uint256 netId => mapping(address member => bool)) private _isMember;
    mapping(uint256 netId => Message[]) private _messages;

    function _requireNetExists(uint256 netId) internal view {
        if (netId >= netCount) revert NetNotFound(netId);
    }

    /// @notice Create a new Net with a human name and an encrypted shared key A.
    /// @param name The Net name.
    /// @param encryptedKey External encrypted eaddress handle of A.
    /// @param inputProof Proof for the encrypted input.
    /// @return netId The created Net id.
    function createNet(
        string calldata name,
        externalEaddress encryptedKey,
        bytes calldata inputProof
    ) external returns (uint256 netId) {
        if (bytes(name).length == 0) revert EmptyName();

        eaddress key = FHE.fromExternal(encryptedKey, inputProof);
        netId = netCount++;

        _nets[netId] = NetInfo({
            name: name,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            memberCount: 1,
            encryptedKey: key
        });

        _isMember[netId][msg.sender] = true;

        FHE.allowThis(key);
        FHE.allow(key, msg.sender);

        emit NetCreated(netId, msg.sender, name);
        emit NetJoined(netId, msg.sender);
    }

    /// @notice Join a Net and obtain decryption permission for its encrypted shared key A.
    function joinNet(uint256 netId) external {
        _requireNetExists(netId);
        if (_isMember[netId][msg.sender]) revert AlreadyMember(netId, msg.sender);

        _isMember[netId][msg.sender] = true;
        _nets[netId].memberCount += 1;

        FHE.allow(_nets[netId].encryptedKey, msg.sender);

        emit NetJoined(netId, msg.sender);
    }

    /// @notice Returns whether an address is a member of a Net.
    /// @dev View functions must not depend on msg.sender.
    function isMember(uint256 netId, address member) external view returns (bool) {
        _requireNetExists(netId);
        return _isMember[netId][member];
    }

    /// @notice Get Net metadata (excluding encrypted key).
    function getNetInfo(uint256 netId) external view returns (string memory, address, uint64, uint32) {
        _requireNetExists(netId);
        NetInfo storage info = _nets[netId];
        return (info.name, info.creator, info.createdAt, info.memberCount);
    }

    /// @notice Get the encrypted shared key handle for a Net (requires ACL to decrypt client-side).
    function getEncryptedKey(uint256 netId) external view returns (eaddress) {
        _requireNetExists(netId);
        return _nets[netId].encryptedKey;
    }

    /// @notice Send an encrypted message to a Net.
    /// @dev Encryption is done off-chain using the decrypted key A.
    function sendMessage(uint256 netId, bytes calldata encryptedMessage) external {
        _requireNetExists(netId);
        if (!_isMember[netId][msg.sender]) revert NotMember(netId, msg.sender);
        if (encryptedMessage.length == 0) revert EmptyMessage();
        if (encryptedMessage.length > 4096) revert MessageTooLarge(encryptedMessage.length);

        uint256 index = _messages[netId].length;
        _messages[netId].push(
            Message({sender: msg.sender, timestamp: uint64(block.timestamp), data: encryptedMessage})
        );

        emit MessageSent(netId, index, msg.sender, uint64(block.timestamp));
    }

    /// @notice Get number of messages in a Net.
    function getMessageCount(uint256 netId) external view returns (uint256) {
        _requireNetExists(netId);
        return _messages[netId].length;
    }

    /// @notice Get a single message by index.
    function getMessage(uint256 netId, uint256 index) external view returns (address, uint64, bytes memory) {
        _requireNetExists(netId);
        Message storage m = _messages[netId][index];
        return (m.sender, m.timestamp, m.data);
    }

    /// @notice Paginated message retrieval.
    function getMessages(
        uint256 netId,
        uint256 start,
        uint256 limit
    ) external view returns (address[] memory senders, uint64[] memory timestamps, bytes[] memory data) {
        _requireNetExists(netId);
        uint256 total = _messages[netId].length;
        if (start > total) revert InvalidPagination(start, limit);

        uint256 end = start + limit;
        if (end > total) end = total;
        uint256 size = end - start;

        senders = new address[](size);
        timestamps = new uint64[](size);
        data = new bytes[](size);

        for (uint256 i = 0; i < size; i++) {
            Message storage m = _messages[netId][start + i];
            senders[i] = m.sender;
            timestamps[i] = m.timestamp;
            data[i] = m.data;
        }
    }
}

