use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{BondcurveConfig, GlobalAccount};

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
    pub bonding_curve: Box<Account<'info, BondcurveConfig>>,
    #[account(mut)]
    pub global: Box<Account<'info, GlobalAccount>>,
    pub token_program: Program<'info, Token>,
}
