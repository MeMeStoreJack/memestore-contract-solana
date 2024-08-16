use anchor_lang::prelude::*;

use crate::{FairMintCommonParams, Fees};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Copy, Debug)]
pub struct FairMintGlobalParams {
    pub fee_recipient: Pubkey,
    pub owner: Pubkey,
}

#[account]
#[derive(Default, Debug)]
pub struct FairMintGlobalAccount {
    pub bump: u8,
    pub initialized: bool,
    pub fee_recipient: Pubkey,
    pub owner: Pubkey,
    pub fees: Fees,
    pub dex_bot: Pubkey,
}

impl FairMintGlobalAccount {
    pub const LEN: usize = 8 + std::mem::size_of::<FairMintGlobalAccount>();
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, seeds = [b"global"], space = FairMintGlobalAccount::LEN, bump)]
    pub global: Box<Account<'info, FairMintGlobalAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct FairMintInitializeParams {
    pub common: FairMintCommonParams,
    pub fees: Fees,
}
