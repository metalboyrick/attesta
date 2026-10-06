use {
    anchor_lang::{
        prelude::Pubkey, solana_program::instruction::Instruction, AccountDeserialize,
        InstructionData, ToAccountMetas,
    },
    attesta_guard::{AgentPolicy, POLICY_SEED, VAULT_SEED},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const LAMPORTS: u64 = 1_000_000_000;
const CAP: u64 = 100_000_000; // 0.1 SOL / day

// Anchor custom errors start at 6000, in GuardError declaration order.
const ERR_AGENT_FROZEN: u32 = 6000;
const ERR_OVER_DAILY_CAP: u32 = 6001;
const ERR_ALLOWLIST_TOO_LONG: u32 = 6002;
const ERR_CONSTRAINT_HAS_ONE: u32 = 2001;

struct Ctx {
    svm: LiteSVM,
    payer: Keypair,
    authority: Keypair,
    agent: Keypair,
    policy: Pubkey,
    vault: Pubkey,
}

fn pdas(agent: &Pubkey) -> (Pubkey, Pubkey) {
    let id = attesta_guard::id();
    (
        Pubkey::find_program_address(&[POLICY_SEED, agent.as_ref()], &id).0,
        Pubkey::find_program_address(&[VAULT_SEED, agent.as_ref()], &id).0,
    )
}

fn send(svm: &mut LiteSVM, ix: Instruction, payer: &Keypair, signers: &[&Keypair]) -> Result<(), u32> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| {
        match e.err {
            solana_transaction_error::TransactionError::InstructionError(
                _,
                solana_instruction_error::InstructionError::Custom(code),
            ) => code,
            other => panic!("unexpected error: {other:?}\nlogs: {:#?}", e.meta.logs),
        }
    })
}

fn setup(allowlist: Vec<Pubkey>) -> Ctx {
    let mut svm = LiteSVM::new();
    svm.add_program(attesta_guard::id(), include_bytes!("../../../target/deploy/attesta_guard.so"))
        .unwrap();
    let payer = Keypair::new();
    let authority = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * LAMPORTS).unwrap();
    svm.airdrop(&authority.pubkey(), LAMPORTS).unwrap();
    let (policy, vault) = pdas(&agent.pubkey());

    let ix = Instruction::new_with_bytes(
        attesta_guard::id(),
        &attesta_guard::instruction::RegisterAgent {
            authority: authority.pubkey(),
            daily_cap: CAP,
            allowlist,
        }
        .data(),
        attesta_guard::accounts::RegisterAgent {
            payer: payer.pubkey(),
            agent: agent.pubkey(),
            policy,
            vault,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    );
    send(&mut svm, ix, &payer, &[&payer, &agent]).unwrap();
    // Fund the vault (plain system transfer; anyone can deposit).
    svm.airdrop(&vault, LAMPORTS).unwrap();
    Ctx { svm, payer, authority, agent, policy, vault }
}

fn policy_state(c: &Ctx) -> AgentPolicy {
    let acc = c.svm.get_account(&c.policy).unwrap();
    AgentPolicy::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn spend(c: &mut Ctx, recipient: Pubkey, amount: u64) -> Result<(), u32> {
    let ix = Instruction::new_with_bytes(
        attesta_guard::id(),
        &attesta_guard::instruction::Spend { amount }.data(),
        attesta_guard::accounts::Spend {
            agent: c.agent.pubkey(),
            policy: c.policy,
            vault: c.vault,
            recipient,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    );
    let (payer, agent) = (c.payer.insecure_clone(), c.agent.insecure_clone());
    send(&mut c.svm, ix, &payer, &[&payer, &agent])
}

fn set_frozen(c: &mut Ctx, signer: &Keypair, frozen: bool) -> Result<(), u32> {
    let ix = Instruction::new_with_bytes(
        attesta_guard::id(),
        &attesta_guard::instruction::SetFrozen { frozen, reason_code: 7 }.data(),
        attesta_guard::accounts::SetFrozen { authority: signer.pubkey(), policy: c.policy }
            .to_account_metas(None),
    );
    let payer = c.payer.insecure_clone();
    send(&mut c.svm, ix, &payer, &[&payer, signer])
}

#[test]
fn register_sets_policy() {
    let r = Pubkey::new_unique();
    let c = setup(vec![r]);
    let p = policy_state(&c);
    assert_eq!(p.agent, c.agent.pubkey());
    assert_eq!(p.authority, c.authority.pubkey());
    assert_eq!(p.daily_cap, CAP);
    assert!(!p.frozen);
    assert_eq!(p.allowlist, vec![r]);
}

#[test]
fn spend_moves_lamports_and_tracks_daily_total() {
    let mut c = setup(vec![]);
    let r = Pubkey::new_unique();
    spend(&mut c, r, 40_000_000).unwrap();
    spend(&mut c, r, 60_000_000).unwrap();
    assert_eq!(c.svm.get_balance(&r).unwrap(), 100_000_000);
    assert_eq!(policy_state(&c).spent_today, CAP);
}

#[test]
fn spend_over_cap_rejected() {
    let mut c = setup(vec![]);
    let r = Pubkey::new_unique();
    spend(&mut c, r, 60_000_000).unwrap();
    assert_eq!(spend(&mut c, r, 50_000_000), Err(ERR_OVER_DAILY_CAP));
}

#[test]
fn cap_resets_next_day() {
    let mut c = setup(vec![]);
    let r = Pubkey::new_unique();
    spend(&mut c, r, CAP).unwrap();
    let mut clock: anchor_lang::prelude::Clock = c.svm.get_sysvar();
    clock.unix_timestamp += 86_400;
    c.svm.set_sysvar(&clock);
    spend(&mut c, r, CAP).unwrap();
    assert_eq!(policy_state(&c).spent_today, CAP);
}

#[test]
fn frozen_agent_cannot_spend_and_unfreeze_restores() {
    let mut c = setup(vec![]);
    let r = Pubkey::new_unique();
    spend(&mut c, r, 10_000_000).unwrap();
    let auth = c.authority.insecure_clone();
    set_frozen(&mut c, &auth, true).unwrap();
    assert!(policy_state(&c).frozen);
    assert_eq!(spend(&mut c, r, 10_000_000), Err(ERR_AGENT_FROZEN));
    set_frozen(&mut c, &auth, false).unwrap();
    spend(&mut c, r, 10_000_000).unwrap();
}

#[test]
fn only_authority_can_freeze() {
    let mut c = setup(vec![]);
    let agent = c.agent.insecure_clone();
    assert_eq!(set_frozen(&mut c, &agent, true), Err(ERR_CONSTRAINT_HAS_ONE));
    assert!(!policy_state(&c).frozen);
}

#[test]
fn non_allowlisted_recipient_still_allowed() {
    // Allowlist is evidence only; enforcement is off-chain evaluation + freeze.
    let mut c = setup(vec![Pubkey::new_unique()]);
    let stranger = Pubkey::new_unique();
    spend(&mut c, stranger, 1_000_000).unwrap();
    assert_eq!(c.svm.get_balance(&stranger).unwrap(), 1_000_000);
}

#[test]
fn allowlist_too_long_rejected() {
    let mut svm = LiteSVM::new();
    svm.add_program(attesta_guard::id(), include_bytes!("../../../target/deploy/attesta_guard.so"))
        .unwrap();
    let payer = Keypair::new();
    let agent = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * LAMPORTS).unwrap();
    let (policy, vault) = pdas(&agent.pubkey());
    let ix = Instruction::new_with_bytes(
        attesta_guard::id(),
        &attesta_guard::instruction::RegisterAgent {
            authority: Pubkey::new_unique(),
            daily_cap: CAP,
            allowlist: (0..9).map(|_| Pubkey::new_unique()).collect(),
        }
        .data(),
        attesta_guard::accounts::RegisterAgent {
            payer: payer.pubkey(),
            agent: agent.pubkey(),
            policy,
            vault,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
    );
    assert_eq!(send(&mut svm, ix, &payer, &[&payer, &agent]), Err(ERR_ALLOWLIST_TOO_LONG));
}
