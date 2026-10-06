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
    bytes32 constant CTRL_C = keccak256("c3");
    bytes32 constant CTRL_D = keccak256("c4");
    // EOA that broadcasts `cre workflow simulate` (tx.origin of every forwarder call).
    address constant REPORTER = address(0xC0FFEE);
    uint64 constant NOW = 1_000_000;

    AttestationRegistry reg;

    event ControlResult(bytes32 indexed controlId, bytes32 indexed agentId, bool pass, bytes32 evidenceHash, uint64 ts);

    function setUp() public {
        vm.warp(NOW);
        reg = new AttestationRegistry(MOCK_FORWARDER);
        reg.setReporter(REPORTER);
        bytes32[4] memory ids = [CTRL_A, CTRL_B, CTRL_C, CTRL_D];
        for (uint256 i = 0; i < ids.length; i++) {
            reg.setAllowedControl(ids[i], true);
        }
    }

    function _report(bytes32 ctrl, bool pass, uint64 ts) internal {
        vm.prank(MOCK_FORWARDER, REPORTER);
        reg.onReport("", abi.encode(ctrl, AGENT, pass, EVIDENCE, ts));
    }

    function _expectReportRevert(bytes memory err, bytes32 ctrl, uint64 ts) internal {
        vm.prank(MOCK_FORWARDER, REPORTER);
        vm.expectRevert(err);
        reg.onReport("", abi.encode(ctrl, AGENT, true, EVIDENCE, ts));
    }

    // ─── C1: only the configured broadcast EOA may originate reports (simulate-only stopgap) ───

    function test_C1_RejectsWrongOrigin() public {
        address attacker = address(0xBAD);
        vm.prank(MOCK_FORWARDER, attacker);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.InvalidReporter.selector, attacker, REPORTER));
        reg.onReport("", abi.encode(CTRL_A, AGENT, true, EVIDENCE, uint64(NOW)));
    }

    function test_C1_ConstructorSetsDeployerAsReporter() public {
        vm.prank(address(0xD3), address(0xD3));
        AttestationRegistry r = new AttestationRegistry(MOCK_FORWARDER);
        assertEq(r.getReporter(), address(0xD3));
    }

    function test_C1_OnlyOwnerSetsReporter_NoZero() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        reg.setReporter(address(1));
        vm.expectRevert(AttestationRegistry.InvalidReporterAddress.selector);
        reg.setReporter(address(0));
    }

    // ─── C2: timestamp bounds + owner reset ───

    function test_C2_FutureTimestampReverts() public {
        uint64 ts = NOW + 301;
        _expectReportRevert(abi.encodeWithSelector(AttestationRegistry.FutureTimestamp.selector, ts, NOW), CTRL_A, ts);
        _report(CTRL_A, true, NOW + 300); // inside the skew window
    }

    function test_C2_MaxUintTimestampCannotPinResult() public {
        _expectReportRevert(
            abi.encodeWithSelector(AttestationRegistry.FutureTimestamp.selector, type(uint64).max, NOW),
            CTRL_A,
            type(uint64).max
        );
    }

    function test_C2_StaleReportReverts() public {
        _report(CTRL_A, false, 200);
        _expectReportRevert(abi.encodeWithSelector(AttestationRegistry.StaleReport.selector, 150, 200), CTRL_A, 150);
        assertFalse(reg.getResult(AGENT, CTRL_A).pass);
        assertEq(reg.getResult(AGENT, CTRL_A).ts, 200);
    }

    function test_C2_ResetResult() public {
        _report(CTRL_A, true, 100);
        _report(CTRL_B, false, 101);
        assertEq(reg.failingCount(AGENT), 1);

        reg.resetResult(AGENT, CTRL_B);
        assertEq(reg.failingCount(AGENT), 0);
        assertEq(reg.getControls(AGENT).length, 1);
        assertEq(reg.getResult(AGENT, CTRL_B).ts, 0);
        assertTrue(reg.isCompliant(AGENT));

        // slot is reusable after reset, with an older ts than before
        _report(CTRL_B, false, 50);
        assertEq(reg.failingCount(AGENT), 1);

        vm.prank(address(0xBAD));
        vm.expectRevert();
        reg.resetResult(AGENT, CTRL_A);
    }

    // ─── finding 10: only catalog control ids ───

    function test_UnknownControlReverts() public {
        bytes32 junk = keccak256("junk");
        _expectReportRevert(abi.encodeWithSelector(AttestationRegistry.UnknownControl.selector, junk), junk, NOW);
    }

    function test_OnlyOwnerAllowsControls() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        reg.setAllowedControl(keccak256("x"), true);
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

    function test_ZeroTimestampReverts() public {
        vm.prank(MOCK_FORWARDER, REPORTER);
        vm.expectRevert(AttestationRegistry.ZeroTimestamp.selector);
        reg.onReport("", abi.encode(CTRL_A, AGENT, true, EVIDENCE, uint64(0)));
    }

    function test_ExpectedAuthorChecked() public {
        address author = makeAddr("author");
        reg.setExpectedAuthor(author);
        bytes memory goodMeta = abi.encodePacked(bytes32(uint256(1)), bytes10("wf"), author);
        bytes memory badMeta = abi.encodePacked(bytes32(uint256(1)), bytes10("wf"), address(0xBEEF));
        bytes memory report = abi.encode(CTRL_A, AGENT, true, EVIDENCE, uint64(1));

        vm.prank(MOCK_FORWARDER, REPORTER);
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidAuthor.selector, address(0xBEEF), author));
        reg.onReport(badMeta, report);

        vm.prank(MOCK_FORWARDER, REPORTER);
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
        bytes32[4] memory ctrls = [CTRL_A, CTRL_B, CTRL_C, CTRL_D];
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
