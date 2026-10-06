// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {ReceiverTemplate} from "../src/ReceiverTemplate.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";

contract AttestationRegistryTest is Test {
    // Ethereum Sepolia MockKeystoneForwarder used by `cre workflow simulate`.
    address constant MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    bytes32 constant AGENT = keccak256("agent-1");
    bytes32 constant CTRL_A = keccak256("CC6.1");
    bytes32 constant CTRL_B = keccak256("CC7.2");
    bytes32 constant EVIDENCE = keccak256("evidence");

    AttestationRegistry reg;

    event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts);

    function setUp() public {
        reg = new AttestationRegistry(MOCK_FORWARDER);
    }

    function _report(bytes32 ctrl, bool pass, uint64 ts) internal {
        vm.prank(MOCK_FORWARDER);
        reg.onReport("", abi.encode(ctrl, AGENT, pass, EVIDENCE, ts));
    }

    function test_RejectsNonForwarder() public {
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), MOCK_FORWARDER));
        reg.onReport("", abi.encode(CTRL_A, AGENT, true, EVIDENCE, uint64(1)));
    }

    function test_ConstructorRejectsZeroForwarder() public {
        vm.expectRevert(ReceiverTemplate.InvalidForwarderAddress.selector);
        new AttestationRegistry(address(0));
    }

    function test_StoresAndEmits() public {
        vm.expectEmit(true, true, false, true, address(reg));
        emit ControlResult(CTRL_A, AGENT, true, EVIDENCE, 100);
        _report(CTRL_A, true, 100);

        AttestationRegistry.Result memory r = reg.getResult(AGENT, CTRL_A);
        assertTrue(r.pass);
        assertEq(r.evidenceHash, EVIDENCE);
        assertEq(r.ts, 100);
        assertEq(reg.getControls(AGENT).length, 1);
    }

    function test_UnknownAgentNotCompliant() public view {
        assertFalse(reg.isCompliant(AGENT));
    }

    function test_ComplianceFollowsLatestResults() public {
        _report(CTRL_A, true, 100);
        assertTrue(reg.isCompliant(AGENT));

        _report(CTRL_B, false, 101);
        assertFalse(reg.isCompliant(AGENT));
        assertEq(reg.failingCount(AGENT), 1);

        _report(CTRL_B, true, 102);
        assertTrue(reg.isCompliant(AGENT));

        _report(CTRL_A, false, 103);
        _report(CTRL_A, false, 104); // repeated fail does not double count
        assertEq(reg.failingCount(AGENT), 1);
        assertFalse(reg.isCompliant(AGENT));
        assertEq(reg.getControls(AGENT).length, 2);
    }

    function test_StaleResultIgnored() public {
        _report(CTRL_A, false, 200);
        _report(CTRL_A, true, 150);
        assertFalse(reg.getResult(AGENT, CTRL_A).pass);
        assertEq(reg.getResult(AGENT, CTRL_A).ts, 200);
        assertFalse(reg.isCompliant(AGENT));
    }

    function test_ZeroTimestampReverts() public {
        vm.prank(MOCK_FORWARDER);
        vm.expectRevert(AttestationRegistry.ZeroTimestamp.selector);
        reg.onReport("", abi.encode(CTRL_A, AGENT, true, EVIDENCE, uint64(0)));
    }

    function test_ExpectedAuthorChecked() public {
        address author = makeAddr("author");
        reg.setExpectedAuthor(author);
        bytes memory goodMeta = abi.encodePacked(bytes32(uint256(1)), bytes10("wf"), author);
        bytes memory badMeta = abi.encodePacked(bytes32(uint256(1)), bytes10("wf"), address(0xBEEF));
        bytes memory report = abi.encode(CTRL_A, AGENT, true, EVIDENCE, uint64(1));

        vm.prank(MOCK_FORWARDER);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidAuthor.selector, address(0xBEEF), author));
        reg.onReport(badMeta, report);

        vm.prank(MOCK_FORWARDER);
        reg.onReport(goodMeta, report);
        assertTrue(reg.isCompliant(AGENT));
    }

    function test_OnlyOwnerSetsForwarder() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        reg.setForwarderAddress(address(1));

        reg.setForwarderAddress(address(1));
        assertEq(reg.getForwarderAddress(), address(1));
    }

    function test_SupportsInterface() public view {
        assertTrue(reg.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(reg.supportsInterface(type(IERC165).interfaceId));
        assertFalse(reg.supportsInterface(0xdeadbeef));
    }

    function testFuzz_FailingCountMatchesState(bool[8] memory passes) public {
        bytes32[4] memory ctrls = [CTRL_A, CTRL_B, keccak256("c3"), keccak256("c4")];
        for (uint64 i = 0; i < 8; i++) {
            _report(ctrls[i % 4], passes[i], i + 1);
        }
        uint256 failing;
        for (uint256 j = 0; j < 4; j++) {
            if (!reg.getResult(AGENT, ctrls[j]).pass) failing++;
        }
        assertEq(reg.failingCount(AGENT), failing);
        assertEq(reg.isCompliant(AGENT), failing == 0);
    }
}
