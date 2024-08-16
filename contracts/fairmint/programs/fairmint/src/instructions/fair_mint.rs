use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{FreezeAccount, Mint, MintTo, ThawAccount, Token, TokenAccount},
};

use crate::FairmintConfig;

use super::FairMintGlobalAccount;

#[derive(Accounts)]
pub struct FairMint<'info> {
    #[account(mut)]
    pub global: Account<'info, FairMintGlobalAccount>,
    /// CHECK: Safe
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub fair_mint: Box<Account<'info, FairmintConfig>>,
    #[account(mut)]
    pub associated_fair_mint: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
        token::token_program = token_program,
    )]
    pub associated_user: Account<'info, TokenAccount>,
    /// CHECK: Safe
    #[account(mut, signer)]
    pub user: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: Safe
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> FairMint<'info> {
    pub fn freeze_account(&self, account: &AccountInfo<'info>) -> Result<()> {
        let seeds = &[b"global".as_ref(), &[self.global.bump]];
        let signer = [&seeds[..]];
        let cpi_accounts = FreezeAccount {
            mint: self.mint.to_account_info(),
            account: account.clone(),
            authority: self.global.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer);
        anchor_spl::token::freeze_account(cpi_ctx)
    }

    pub fn thaw_account(&self, account: &AccountInfo<'info>) -> Result<()> {
        let seeds = &[b"global".as_ref(), &[self.global.bump]];
        let signer = [&seeds[..]];
        let cpi_accounts = ThawAccount {
            account: account.clone(),
            mint: self.mint.to_account_info(),
            authority: self.global.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer);
        anchor_spl::token::thaw_account(cpi_ctx)
    }
}

pub fn mint_to<'info>(
    global_bump: u8,
    token_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    global: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let seeds = [b"global".as_ref(), &[global_bump][..]];
    let binding = [&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        MintTo {
            mint: mint.to_account_info(),
            to,
            authority: global.to_account_info(),
        },
        &binding,
    );
    anchor_spl::token::mint_to(cpi_ctx, amount)
}

pub fn thaw_account<'info>(
    global_bump: u8,
    token_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    account: AccountInfo<'info>,
    global: AccountInfo<'info>,
) -> Result<()> {
    let seeds = &[b"global".as_ref(), &[global_bump]];
    let signer = [&seeds[..]];
    let cpi_accounts = ThawAccount {
        account,
        mint,
        authority: global,
    };
    anchor_spl::token::thaw_account(CpiContext::new_with_signer(token_program, cpi_accounts, &signer))
}
