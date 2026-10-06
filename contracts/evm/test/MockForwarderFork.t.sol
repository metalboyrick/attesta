// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

interface IMockKeystoneForwarder {
    function report(address receiver, bytes calldata rawReport, bytes calldata, bytes[] calldata) external;
}

/// Runs against the live Sepolia MockKeystoneForwarder that `cre workflow simulate --broadcast` calls.
/// Skipped unless SEPOLIA_RPC_URL is set.
contract MockForwarderForkTest is Test {
    address constant MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function test_Fork_MockForwarderDeliversReport() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
        }
        vm.createSelectFork(rpc);

        AttestationRegistry reg = new AttestationRegistry(MOCK_FORWARDER);
        bytes32 agent = keccak256("attesta-demo-agent-1");
        bytes32 ctrl = keccak256("ATT-SPEND-01");
        bytes memory payload = abi.encode(ctrl, agent, true, keccak256("ev"), uint64(block.timestamp));

        // 109-byte header: version(1) execId(32) ts(4) donId(4) donCfg(4) cid(32) name(10) owner(20) reportId(2)
        bytes memory header = abi.encodePacked(
            uint8(1),
            bytes32(uint256(7)),
            uint32(0),
            uint32(0),
            uint32(0),
            bytes32(0),
            bytes10(0),
            address(0),
            bytes2(0)
        );
        assertEq(header.length, 109);

        IMockKeystoneForwarder(MOCK_FORWARDER).report(address(reg), bytes.concat(header, payload), "", new bytes[](0));

        assertTrue(reg.isCompliant(agent));
        assertEq(reg.getResult(agent, ctrl).ts, uint64(block.timestamp));
    }
}
