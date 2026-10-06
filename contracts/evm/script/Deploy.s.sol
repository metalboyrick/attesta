// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {AgentWallet} from "../src/AgentWallet.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --private-key $PK --broadcast
/// FORWARDER defaults to the Sepolia MockKeystoneForwarder used by `cre workflow simulate`.
/// If AGENT_SIGNER is set, also deploys a demo AgentWallet, allowlists VENDOR and funds it with WALLET_FUND wei.
contract Deploy is Script {
    address constant SEPOLIA_MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external returns (AttestationRegistry reg, AgentWallet wallet) {
        address forwarder = vm.envOr("FORWARDER", SEPOLIA_MOCK_FORWARDER);
        address signer = vm.envOr("AGENT_SIGNER", address(0));

        vm.startBroadcast();
        // Deployer EOA becomes owner and reporter (tx.origin of `cre workflow simulate --broadcast`).
        reg = new AttestationRegistry(forwarder);
        // controls/catalog.json ids; anything else is rejected
        reg.setAllowedControl(keccak256("ATT-SPEND-01"), true);
        reg.setAllowedControl(keccak256("ATT-CPTY-02"), true);
        reg.setAllowedControl(keccak256("ATT-KEY-03"), true);
        reg.setAllowedControl(keccak256("ATT-TXLIM-04"), true);
        reg.setAllowedControl(keccak256("ATT-FRZ-05"), true);
        reg.setAllowedControl(keccak256("ATT-CHG-06"), true);
        reg.setAllowedControl(keccak256("ATT-LOG-07"), true);
        reg.setAllowedControl(keccak256("ATT-HITL-08"), true);
        if (signer != address(0)) {
            wallet = new AgentWallet(signer, vm.envOr("DAILY_CAP", uint256(0.01 ether)));
            address vendor = vm.envOr("VENDOR", address(0));
            if (vendor != address(0)) wallet.setAllowlisted(vendor, true);
            uint256 fund = vm.envOr("WALLET_FUND", uint256(0.005 ether));
            if (fund > 0) {
                (bool ok,) = address(wallet).call{value: fund}("");
                require(ok, "fund wallet");
            }
        }
        vm.stopBroadcast();

        console.log("AttestationRegistry", address(reg));
        console.log("AgentWallet", address(wallet));
        console.log("forwarder", forwarder);
    }
}
