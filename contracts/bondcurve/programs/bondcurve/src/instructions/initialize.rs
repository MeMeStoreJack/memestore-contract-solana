use crate::state::GlobalAccount;
use crate::{BondCurveCommonParams, Fees};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, seeds = [b"global"], space = GlobalAccount::LEN, bump)]
    pub global: Box<Account<'info, GlobalAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct InitializeParams {
    pub common: BondCurveCommonParams,
    pub fees: Fees,
}
