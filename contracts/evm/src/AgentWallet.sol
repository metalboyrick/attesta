// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentWallet
/// @notice Minimal native-ETH wallet an AI agent spends from on Sepolia. It does not enforce the cap or the
///         allowlist: it records what happened so the off-chain CRE controls can test it.
///         `owner` is the human/compliance authority, `agentSigner` is the agent's hot key.
contract AgentWallet {
    uint256 internal constant SECONDS_PER_DAY = 86_400;

    address public owner;
    address public agentSigner;
    uint256 public dailyCap;
    uint256 public spentToday;
    uint64 public dayIndex;
    bool public frozen;
    mapping(address => bool) public allowlisted;

    event Payment(
        address indexed signer,
        address indexed to,
        uint256 amount,
        uint256 spentToday,
        uint256 dailyCap,
        bool allowlisted,
        uint64 ts
    );
    event SignerChanged(address indexed previous, address indexed next);
    event OwnerChanged(address indexed previous, address indexed next);
    event PolicyUpdated(uint256 dailyCap);
    event AllowlistUpdated(address indexed counterparty, bool allowed);
    event FrozenChanged(bool frozen);

    error NotOwner();
    error NotSigner();
    error Frozen();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address signer, uint256 cap) {
        owner = msg.sender;
        agentSigner = signer;
        dailyCap = cap;
        emit OwnerChanged(address(0), msg.sender);
        emit SignerChanged(address(0), signer);
        emit PolicyUpdated(cap);
    }

    receive() external payable {}

    /// @notice Agent pays a counterparty. Over-cap and off-allowlist payments go through and are flagged in the event.
    function pay(address payable to, uint256 amount) external {
        if (msg.sender != agentSigner) revert NotSigner();
        if (frozen) revert Frozen();

        uint64 today = uint64(block.timestamp / SECONDS_PER_DAY);
        if (today != dayIndex) {
            dayIndex = today;
            spentToday = 0;
        }
        spentToday += amount;
        emit Payment(msg.sender, to, amount, spentToday, dailyCap, allowlisted[to], uint64(block.timestamp));

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Everything the CRE workflow reads, in one call.
    function state()
        external
        view
        returns (address owner_, address signer_, uint256 cap_, uint256 spent_, uint64 day_, bool frozen_)
    {
        return (owner, agentSigner, dailyCap, spentToday, dayIndex, frozen);
    }

    function setSigner(address next) external onlyOwner {
        emit SignerChanged(agentSigner, next);
        agentSigner = next;
    }

    function transferOwnership(address next) external onlyOwner {
        emit OwnerChanged(owner, next);
        owner = next;
    }

    function setDailyCap(uint256 cap) external onlyOwner {
        dailyCap = cap;
        emit PolicyUpdated(cap);
    }

    function setAllowlisted(address counterparty, bool allowed) external onlyOwner {
        allowlisted[counterparty] = allowed;
        emit AllowlistUpdated(counterparty, allowed);
    }

    function setFrozen(bool f) external onlyOwner {
        frozen = f;
        emit FrozenChanged(f);
    }
}
