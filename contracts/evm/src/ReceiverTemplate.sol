// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @title ReceiverTemplate
/// @notice Trimmed copy of the Chainlink CRE docs ReceiverTemplate.
///         Only the forwarder check and the optional workflow-owner check are kept.
///         The simulator's MockKeystoneForwarder does not pass full metadata, so the
///         owner check must stay disabled (address(0)) while we only run `cre workflow simulate`.
abstract contract ReceiverTemplate is IReceiver, Ownable {
    address private s_forwarderAddress;
    address private s_expectedAuthor;

    error InvalidForwarderAddress();
    error InvalidSender(address sender, address expected);
    error InvalidAuthor(address received, address expected);

    event ForwarderAddressUpdated(address indexed previousForwarder, address indexed newForwarder);
    event ExpectedAuthorUpdated(address indexed previousAuthor, address indexed newAuthor);

    constructor(address forwarderAddress) Ownable(msg.sender) {
        if (forwarderAddress == address(0)) revert InvalidForwarderAddress();
        s_forwarderAddress = forwarderAddress;
        emit ForwarderAddressUpdated(address(0), forwarderAddress);
    }

    function getForwarderAddress() external view returns (address) {
        return s_forwarderAddress;
    }

    function getExpectedAuthor() external view returns (address) {
        return s_expectedAuthor;
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != s_forwarderAddress) revert InvalidSender(msg.sender, s_forwarderAddress);

        if (s_expectedAuthor != address(0)) {
            address workflowOwner = _decodeOwner(metadata);
            if (workflowOwner != s_expectedAuthor) revert InvalidAuthor(workflowOwner, s_expectedAuthor);
        }

        _processReport(report);
    }

    /// @notice Point the receiver at a different forwarder (e.g. the production KeystoneForwarder after deploy access).
    function setForwarderAddress(address forwarder) external onlyOwner {
        if (forwarder == address(0)) revert InvalidForwarderAddress();
        emit ForwarderAddressUpdated(s_forwarderAddress, forwarder);
        s_forwarderAddress = forwarder;
    }

    /// @notice Pin the workflow owner. Leave at address(0) while using the simulator.
    function setExpectedAuthor(address author) external onlyOwner {
        emit ExpectedAuthorUpdated(s_expectedAuthor, author);
        s_expectedAuthor = author;
    }

    /// @dev Metadata is abi.encodePacked(workflowId bytes32, workflowName bytes10, workflowOwner address, ...).
    function _decodeOwner(bytes memory metadata) internal pure returns (address workflowOwner) {
        assembly {
            workflowOwner := shr(96, mload(add(metadata, 74)))
        }
    }

    function _processReport(bytes calldata report) internal virtual;

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
