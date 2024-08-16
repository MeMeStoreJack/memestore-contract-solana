use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::FairmintConfig;

use super::FairMintGlobalAccount;

#[derive(Accounts)]
pub struct Unlock<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub associated_user: Account<'info, TokenAccount>,
    /// CHECK: Safe
    #[account(mut)]
    pub fair_mint: Box<Account<'info, FairmintConfig>>,
    #[account(mut)]
    pub global: Box<Account<'info, FairMintGlobalAccount>>,
    pub token_program: Program<'info, Token>,
}
