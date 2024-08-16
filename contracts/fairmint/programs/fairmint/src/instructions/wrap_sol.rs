use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::FairmintConfig;
#[derive(Accounts)]
pub struct WrapSol<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(mut)]
    pub fair_mint: Box<Account<'info, FairmintConfig>>,
    #[account(
        init_if_needed,
        payer = signer,
        token::mint = wsol_mint,
        token::authority = fair_mint,
        seeds = [b"associated-wsol", fair_mint.to_account_info().key().as_ref()],
        bump
    )]
    pub fair_mint_wsol: Account<'info, TokenAccount>,
    pub wsol_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SyncWsol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub fair_mint: Box<Account<'info, FairmintConfig>>,
    #[account(mut,
        token::authority = fair_mint
    )]
    pub fair_mint_wsol: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
        token::token_program = token_program,
    )]
    pub associated_user: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
