// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentWallet} from "../src/AgentWallet.sol";

contract AgentWalletTest is Test {
    AgentWallet w;
    address signer = makeAddr("signer");
    address payable vendor = payable(makeAddr("vendor"));
    address payable stranger = payable(makeAddr("stranger"));

    event Payment(
        address indexed signer,
        address indexed to,
        uint256 amount,
        uint256 spentToday,
        uint256 dailyCap,
        bool allowlisted,
        uint64 ts
    );

    function setUp() public {
        vm.warp(10 days);
        w = new AgentWallet(signer, 1 ether);
        w.setAllowlisted(vendor, true);
        vm.deal(address(w), 10 ether);
    }

    function test_PayEmitsAndTracks() public {
        vm.expectEmit(true, true, false, true, address(w));
        emit Payment(signer, vendor, 0.4 ether, 0.4 ether, 1 ether, true, uint64(block.timestamp));
        vm.prank(signer);
        w.pay(vendor, 0.4 ether);
        assertEq(vendor.balance, 0.4 ether);
        (,,, uint256 spent, uint64 day,) = w.state();
        assertEq(spent, 0.4 ether);
        assertEq(day, 10);
    }

    function test_OverCapAndOffAllowlistAreRecordedNotBlocked() public {
        vm.startPrank(signer);
        w.pay(vendor, 0.9 ether);
        vm.expectEmit(true, true, false, true, address(w));
        emit Payment(signer, stranger, 0.2 ether, 1.1 ether, 1 ether, false, uint64(block.timestamp));
        w.pay(stranger, 0.2 ether);
        vm.stopPrank();
        assertEq(w.spentToday(), 1.1 ether);
    }

    function test_DayRollResetsSpent() public {
        vm.prank(signer);
        w.pay(vendor, 0.9 ether);
        vm.warp(block.timestamp + 1 days);
        vm.prank(signer);
        w.pay(vendor, 0.1 ether);
        assertEq(w.spentToday(), 0.1 ether);
    }

    function test_OnlySignerPays() public {
        vm.expectRevert(AgentWallet.NotSigner.selector);
        w.pay(vendor, 1);
    }

    function test_FrozenBlocksPay() public {
        w.setFrozen(true);
        vm.prank(signer);
        vm.expectRevert(AgentWallet.Frozen.selector);
        w.pay(vendor, 1);
    }

    function test_OnlyOwnerAdmin() public {
        vm.startPrank(stranger);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        w.setSigner(stranger);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        w.transferOwnership(stranger);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        w.setDailyCap(0);
        vm.stopPrank();

        w.setSigner(stranger);
        (, address s,,,,) = w.state();
        assertEq(s, stranger);
    }
}
