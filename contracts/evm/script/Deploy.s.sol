// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --private-key $PK --broadcast
/// FORWARDER defaults to the Sepolia MockKeystoneForwarder used by `cre workflow simulate`.
contract Deploy is Script {
    address constant SEPOLIA_MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external returns (AttestationRegistry reg) {
        address forwarder = vm.envOr("FORWARDER", SEPOLIA_MOCK_FORWARDER);
        vm.startBroadcast();
        reg = new AttestationRegistry(forwarder);
        vm.stopBroadcast();
        console.log("AttestationRegistry", address(reg));
        console.log("forwarder", forwarder);
    }
}
