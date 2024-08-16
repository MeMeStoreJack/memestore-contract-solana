use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, FreezeAccount, Mint, MintTo, ThawAccount, Token, TokenAccount, Transfer},
};

use crate::{error::ErrorCode::NotRentExempt, GlobalAccount, TradeInfo};
use referrerstorage::MyStorage;

use crate::BondcurveConfig;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub global: Box<Account<'info, GlobalAccount>>, // seeds: ["global"], program_id: program_id
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
    pub associated_bonding_curve: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = user,
        token::token_program = token_program,
    )]
    pub associated_user: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user: AccountInfo<'info>, // user who receive token
    #[account(mut)]
    pub signer: Signer<'info>, // signer who sender the transaction
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

impl<'info> Buy<'info> {
    pub fn into_mint_to_user_context(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
        let cpi_accounts = MintTo {
            mint: self.mint.to_account_info(),
            to: self.associated_user.to_account_info(),
            authority: self.global.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }

    pub fn burn_from_pool(&self, token_amount: u64) -> Result<()> {
        let global_seeds = &[b"global".as_ref(), &[self.global.bump]];
        let global_signer = [&global_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Burn {
                mint: self.mint.to_account_info(),
                from: self.associated_bonding_curve.to_account_info(),
                authority: self.global.to_account_info(),
            },
            &global_signer,
        );
        token::burn(cpi_ctx, token_amount)
    }

    pub fn mint_to_pool(&self, token_amount: u64) -> Result<()> {
        let global_seeds = &[b"global".as_ref(), &[self.global.bump]];
        let global_signer = [&global_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            MintTo {
                mint: self.mint.to_account_info(),
                to: self.associated_bonding_curve.to_account_info(),
                authority: self.global.to_account_info(),
            },
            &global_signer,
        );
        token::mint_to(cpi_ctx, token_amount)
    }

    pub fn adjust_pool(&self, cur_amt: u64, target_amt: u64) -> Result<()> {
        if cur_amt < target_amt {
            self.mint_to_pool(target_amt - cur_amt)
        } else if cur_amt > target_amt {
            self.burn_from_pool(cur_amt - target_amt)
        } else {
            Ok(())
        }
    }

    pub fn transfer_from_pool_to_user(&self, token_amount: u64) -> Result<()> {
        let seeds = [b"global".as_ref(), &[self.global.bump][..]];
        let binding = [&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.associated_bonding_curve.to_account_info(),
                to: self.associated_user.to_account_info(),
                authority: self.global.to_account_info(),
            },
            &binding,
        );
        token::transfer(cpi_ctx, token_amount)
    }

    // bonding_curve, trade, refer, up_refer
    pub fn transfer_sols_in(&self, trade_info: &TradeInfo) -> Result<()> {
        transfer_sol(
            self.system_program.to_account_info(),
            self.signer.to_account_info(),
            self.bonding_curve.to_account_info(),
            trade_info.remain_amount,
        )?;
        transfer_sol(
            self.system_program.to_account_info(),
            self.signer.to_account_info(),
            self.fee_recipient.to_account_info(),
            trade_info.fee_value,
        )?;
        if self.refer_account.is_some() {
            assert!(self.refer_storage.is_some(), "Refer storage not set");
            assert!(
                (self.refer_storage).as_ref().unwrap().owner == *self.user.key
                    && (self.refer_storage).as_ref().unwrap().referrer == (self.refer_account).as_ref().unwrap().key(),
                "Refer account not match"
            );

            transfer_sol(
                self.system_program.to_account_info(),
                self.signer.to_account_info(),
                (self.refer_account).as_ref().unwrap().to_account_info(),
                trade_info.referrer_amount,
            )?;
        } else {
            transfer_sol(
                self.system_program.to_account_info(),
                self.signer.to_account_info(),
                self.fee_recipient.to_account_info(),
                trade_info.referrer_amount,
            )?;
        }

        if self.up_refer_account.is_some() {
            assert!(self.up_refer_storage.is_some(), "Up refer storage not set");
            assert!(
                (self.up_refer_storage).as_ref().unwrap().owner == (self.refer_account).as_ref().unwrap().key()
                    && (self.up_refer_storage).as_ref().unwrap().referrer
                        == (self.up_refer_account).as_ref().unwrap().key(),
                "Up refer account not match"
            );
            transfer_sol(
                self.system_program.to_account_info(),
                self.signer.to_account_info(),
                (self.up_refer_account).as_ref().unwrap().to_account_info(),
                trade_info.up_referrer_amount,
            )?;
        } else {
            transfer_sol(
                self.system_program.to_account_info(),
                self.signer.to_account_info(),
                self.fee_recipient.to_account_info(),
                trade_info.up_referrer_amount,
            )?;
        }

        Ok(())
    }

    pub fn get_refer_and_up_refer_accounts(&self) -> Result<(Pubkey, Pubkey)> {
        let mut refer_account = self.fee_recipient.key();
        let mut up_refer_account = self.fee_recipient.key();
        if self.refer_account.is_some()
            && self.refer_storage.is_some()
            && (self.refer_storage).as_ref().unwrap().owner == *self.user.key
            && (self.refer_storage).as_ref().unwrap().referrer == (self.refer_account).as_ref().unwrap().key()
        {
            refer_account = self.refer_account.clone().unwrap().key();
        }

        if self.up_refer_account.is_some()
            && self.up_refer_storage.is_some()
            && (self.up_refer_storage).as_ref().unwrap().owner == (self.refer_account).as_ref().unwrap().key()
            && (self.up_refer_storage).as_ref().unwrap().referrer == (self.up_refer_account).as_ref().unwrap().key()
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

pub fn transfer_sol<'info>(
    system_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    system_program::transfer(
        CpiContext::new(system_program.to_account_info(), system_program::Transfer { from, to }),
        lamports,
    )?;
    Ok(())
}

pub fn send_lamports(from: &AccountInfo, to: &AccountInfo, lamports: u64) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }
    let from_minimum_rent_excempt_balance = Rent::get()?.minimum_balance(from.try_data_len()?);
    if from.lamports() < from_minimum_rent_excempt_balance + lamports {
        return Err(NotRentExempt.into());
    }
    from.sub_lamports(lamports)?;
    to.add_lamports(lamports)?;
    Ok(())
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
