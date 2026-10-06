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

    /// agentId => controlId => latest result
    mapping(bytes32 => mapping(bytes32 => Result)) private s_results;
    /// agentId => list of controls ever reported
    mapping(bytes32 => bytes32[]) private s_controls;
    /// agentId => number of controls whose latest result is a fail
    mapping(bytes32 => uint256) private s_failing;

    event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts);
    event StaleResultIgnored(bytes32 indexed controlId, bytes32 indexed agentId, uint64 ts, uint64 latestTs);

    error ZeroTimestamp();

    constructor(address forwarderAddress) ReceiverTemplate(forwarderAddress) {}

    function _processReport(bytes calldata report) internal override {
        (bytes32 controlId, bytes32 agentId, bool pass, bytes32 evidenceHash, uint64 ts) =
            abi.decode(report, (bytes32, bytes32, bool, bytes32, uint64));
        if (ts == 0) revert ZeroTimestamp();

        Result storage prev = s_results[agentId][controlId];

        // Forwarder reports can be retried or arrive out of order; keep only the newest.
        if (ts < prev.ts) {
            emit StaleResultIgnored(controlId, agentId, ts, prev.ts);
            return;
        }

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
}
