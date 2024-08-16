use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, FreezeAccount, Mint, ThawAccount, Token, TokenAccount, Transfer},
};

use crate::GlobalAccount;
use referrerstorage::MyStorage;

use crate::BondcurveConfig;

use super::send_lamports;

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub global: Account<'info, GlobalAccount>,
    /// CHECK: Safe
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub bonding_curve: Box<Account<'info, BondcurveConfig>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = global,
    )]
    pub associated_bonding_curve: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
        token::token_program = token_program,
    )]
    pub associated_user: Account<'info, TokenAccount>,
    /// CHECK: Safe
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub refer_account: Option<AccountInfo<'info>>,
    #[account(mut)]
    pub refer_storage: Option<Account<'info, MyStorage>>,
    /// CHECK: Safe
    #[account(mut)]
    pub up_refer_account: Option<AccountInfo<'info>>,
    #[account(mut)]
    pub up_refer_storage: Option<Account<'info, MyStorage>>,
}

impl<'info> Sell<'info> {
    pub fn transfer_sols_out(&self, lamports: (u64, u64, u64, u64, u64)) -> Result<()> {
        self.transfer_sol_out(
            self.bonding_curve.to_account_info(),
            self.fee_recipient.clone(),
            lamports.0,
        )?;
        if self.refer_account.is_some()
            && self.refer_storage.is_some()
            && self.refer_storage.as_ref().unwrap().owner == *self.user.key
            && self.refer_storage.as_ref().unwrap().referrer == self.refer_account.as_ref().unwrap().key()
        {
            self.transfer_sol_out(
                self.bonding_curve.to_account_info(),
                self.refer_account.as_ref().unwrap().to_account_info(),
                lamports.1,
            )?;
        } else {
            self.transfer_sol_out(
                self.bonding_curve.to_account_info(),
                self.fee_recipient.clone(),
                lamports.1,
            )?;
        }
        if self.up_refer_account.is_some()
            && self.up_refer_storage.is_some()
            && self.up_refer_storage.as_ref().unwrap().owner == self.refer_account.as_ref().unwrap().key()
            && self.up_refer_storage.as_ref().unwrap().referrer == self.up_refer_account.as_ref().unwrap().key()
        {
            self.transfer_sol_out(
                self.bonding_curve.to_account_info(),
                self.up_refer_account.as_ref().unwrap().to_account_info(),
                lamports.2,
            )?;
        } else {
            self.transfer_sol_out(
                self.bonding_curve.to_account_info(),
                self.fee_recipient.clone(),
                lamports.2,
            )?;
        }
        self.transfer_sol_out(
            self.bonding_curve.to_account_info(),
            self.user.to_account_info(),
            lamports.3,
        )?;
        Ok(())
    }

    pub fn transfer_token_in(&self, token_amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.associated_user.to_account_info(),
                    to: self.associated_bonding_curve.to_account_info(),
                    authority: self.user.to_account_info(),
                },
            ),
            token_amount,
        )?;
        Ok(())
    }

    pub fn transfer_sol_out(&self, from: AccountInfo<'info>, to: AccountInfo<'info>, lamports: u64) -> Result<()> {
        if lamports == 0 {
            return Ok(());
        }
        send_lamports(&from, &to, lamports)
    }

    pub fn get_refer_and_up_refer_accounts(&self) -> Result<(Pubkey, Pubkey)> {
        let mut refer_account = self.fee_recipient.key();
        let mut up_refer_account = self.fee_recipient.key();
        if self.refer_account.is_some()
            && self.refer_storage.is_some()
            && self.refer_storage.as_ref().unwrap().owner == *self.user.key
            && self.refer_storage.as_ref().unwrap().referrer == self.refer_account.as_ref().unwrap().key()
        {
            refer_account = self.refer_account.clone().unwrap().key();
        }

        if self.up_refer_account.is_some()
            && self.up_refer_storage.is_some()
            && self.up_refer_storage.as_ref().unwrap().owner == self.refer_account.as_ref().unwrap().key()
            && self.up_refer_storage.as_ref().unwrap().referrer == self.up_refer_account.as_ref().unwrap().key()
        {
            up_refer_account = self.up_refer_account.clone().unwrap().key();
        }
        return Ok((refer_account, up_refer_account));
    }

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
