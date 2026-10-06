// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/// @title AttestationRegistry
/// @notice Stores the latest control-test result per (agentId, controlId), written by a Chainlink CRE workflow.
/// @dev Report payload is abi.encode(bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts).
///      An agent is compliant when it has at least one recorded control and no control is currently failing.
contract AttestationRegistry is ReceiverTemplate {
    struct Result {
        bool pass;
        bytes32 evidenceHash;
        uint64 ts;
    }

    /// Reports may claim a time at most this far past the block time (clock skew between CRE and the chain).
    uint64 public constant MAX_FUTURE_SKEW = 300;

    /// agentId => controlId => latest result
    mapping(bytes32 => mapping(bytes32 => Result)) private s_results;
    /// agentId => list of controls with a current result
    mapping(bytes32 => bytes32[]) private s_controls;
    /// agentId => number of controls whose latest result is a fail
    mapping(bytes32 => uint256) private s_failing;
    /// controlId => accepted. Only catalog controls can be written, so junk ids can't pin an agent non-compliant.
    mapping(bytes32 => bool) private s_allowedControl;
    /// SIMULATE-ONLY STOPGAP: the Sepolia MockKeystoneForwarder is permissionless and checks no signatures,
    /// so we also require tx.origin to be the EOA that broadcasts `cre workflow simulate`.
    /// Behind the production KeystoneForwarder (signed DON reports) this check is not needed.
    address private s_reporter;

    event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts);
    event ReporterUpdated(address indexed previous, address indexed next);
    event AllowedControlUpdated(bytes32 indexed controlId, bool allowed);
    event ResultReset(bytes32 indexed controlId, bytes32 indexed agentId);

    error ZeroTimestamp();
    error FutureTimestamp(uint64 ts, uint256 blockTime);
    error StaleReport(uint64 ts, uint64 latestTs);
    error UnknownControl(bytes32 controlId);
    error InvalidReporter(address origin, address expected);
    error InvalidReporterAddress();

    constructor(address forwarderAddress) ReceiverTemplate(forwarderAddress) {
        s_reporter = msg.sender;
        emit ReporterUpdated(address(0), msg.sender);
    }

    function _processReport(bytes calldata report) internal override {
        // solhint-disable-next-line avoid-tx-origin
        if (tx.origin != s_reporter) revert InvalidReporter(tx.origin, s_reporter);

        (bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts) =
            abi.decode(report, (bytes32, bytes32, bool, bytes32, uint64));
        if (!s_allowedControl[controlId]) revert UnknownControl(controlId);
        if (ts == 0) revert ZeroTimestamp();
        if (ts > block.timestamp + MAX_FUTURE_SKEW) revert FutureTimestamp(ts, block.timestamp);

        Result storage prev = s_results[agentId][controlId];
        // Equal ts is allowed so a retried delivery of the same report is harmless.
        if (ts < prev.ts) revert StaleReport(ts, prev.ts);

        if (prev.ts == 0) {
            s_controls[agentId].push(controlId);
            if (!pass) s_failing[agentId] += 1;
        } else if (prev.pass && !pass) {
            s_failing[agentId] += 1;
        } else if (!prev.pass && pass) {
            s_failing[agentId] -= 1;
        }

        s_results[agentId][controlId] = Result({pass: pass, evidenceHash: evidenceHash, ts: ts});
        emit ControlResult(controlId, agentId, pass, evidenceHash, ts);
    }

    /// @notice True when the agent has at least one recorded control and none is failing.
    function isCompliant(bytes32 agentId) external view returns (bool) {
        return s_controls[agentId].length > 0 && s_failing[agentId] == 0;
    }

    function getResult(bytes32 agentId, bytes32 controlId) external view returns (Result memory) {
        return s_results[agentId][controlId];
    }

    function getControls(bytes32 agentId) external view returns (bytes32[] memory) {
        return s_controls[agentId];
    }

    function failingCount(bytes32 agentId) external view returns (uint256) {
        return s_failing[agentId];
    }

    function getReporter() external view returns (address) {
        return s_reporter;
    }

    function isAllowedControl(bytes32 controlId) external view returns (bool) {
        return s_allowedControl[controlId];
    }

    // ─── Admin ──────────────────────────────────────────────

    function setReporter(address reporter) external onlyOwner {
        if (reporter == address(0)) revert InvalidReporterAddress();
        emit ReporterUpdated(s_reporter, reporter);
        s_reporter = reporter;
    }

    function setAllowedControl(bytes32 controlId, bool allowed) external onlyOwner {
        s_allowedControl[controlId] = allowed;
        emit AllowedControlUpdated(controlId, allowed);
    }

    /// @notice Clears one (agent, control) result, e.g. after a bad report. The next report starts fresh.
    function resetResult(bytes32 agentId, bytes32 controlId) external onlyOwner {
        Result storage r = s_results[agentId][controlId];
        if (r.ts == 0) return;
        if (!r.pass) s_failing[agentId] -= 1;
        delete s_results[agentId][controlId];

        bytes32[] storage ids = s_controls[agentId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == controlId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }
        emit ResultReset(controlId, agentId);
    }
}
