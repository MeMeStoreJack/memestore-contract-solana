use std::ops::Deref;

use crate::{FairMintGlobalAccount, FairmintConfig};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, SetAuthority, Token, Transfer},
    token_2022::spl_token_2022::{self, extension, state::AccountState},
    token_interface::{Mint, TokenAccount},
};
use raydium_cp_swap::{
    cpi,
    program::RaydiumCpSwap,
    states::{AmmConfig, OBSERVATION_SEED, POOL_LP_MINT_SEED, POOL_SEED, POOL_VAULT_SEED},
};

use super::thaw_account;

#[derive(Accounts)]
pub struct ProxyInitialize<'info> {
    /// CHECK: Safe
    pub global: Box<Account<'info, FairMintGlobalAccount>>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    /// CHECK: Safe
    #[account(
        mut,
        constraint = mint.key() == fair_mint.mint,
    )]
    pub fair_mint: Box<Account<'info, FairmintConfig>>,
    /// CHECK: Safe
    #[account(mut)]
    pub fair_mint_wsol: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        token::mint = wsol_mint,
        token::authority = creator,
    )]
    pub user_wsol: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub wsol_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = global,
    )]
    pub associated_fair_mint: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
        token::token_program = token_program,
    )]
    pub associated_user: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cp_swap_program: Program<'info, RaydiumCpSwap>,
    /// Address paying to create the pool. Can be anyone
    #[account(mut,
        constraint = creator.key() == global.dex_bot
    )]
    pub creator: Signer<'info>,

    /// Which config the pool belongs to.
    /// https://solscan.io/account/CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C?accountName=AmmConfig#acccountsData
    /// C7Cx2pMLtjybS3mDKSfsBj4zQ3PRZGkKt7RCYTTbCSx2 4% trade_fee
    /// G95xxie3XbkCqtE39GgQ9Ggc7xBC8Uceve7HFDEFApkc 1% trade_fee
    /// D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 0.25% trade_fee
    /// 2fGXL8uhqxJ4tpgtosHZXT4zcQap6j62z3bMDxdkMvy5 2% trade_fee
    pub amm_config: Box<Account<'info, AmmConfig>>,

    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [
            raydium_cp_swap::AUTH_SEED.as_bytes(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// CHECK: Initialize an account to store the pool state, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_SEED.as_bytes(),
            amm_config.key().as_ref(),
            token_0_mint.key().as_ref(),
            token_1_mint.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub pool_state: UncheckedAccount<'info>,

    /// Token_0 mint, the key must smaller then token_1 mint.
    #[account(
        constraint = token_0_mint.key() < token_1_mint.key(),
        mint::token_program = token_program,
    )]
    pub token_0_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token_1 mint, the key must grater then token_0 mint.
    #[account(
        mint::token_program = token_program,
    )]
    pub token_1_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: pool lp mint, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_LP_MINT_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub lp_mint: UncheckedAccount<'info>,

    /// payer token0 account
    #[account(
        mut,
        token::mint = token_0_mint,
        token::authority = creator,
    )]
    pub creator_token_0: Box<InterfaceAccount<'info, TokenAccount>>,

    /// creator token1 account
    #[account(
        mut,
        token::mint = token_1_mint,
        token::authority = creator,
    )]
    pub creator_token_1: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: creator lp ATA token account, init by cp-swap
    #[account(mut)]
    pub creator_lp_token: UncheckedAccount<'info>,

    /// CHECK: Token_0 vault for the pool, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_0_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub token_0_vault: UncheckedAccount<'info>,

    /// CHECK: Token_1 vault for the pool, init by cp-swap
    #[account(
        mut,
        seeds = [
            POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_1_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub token_1_vault: UncheckedAccount<'info>,

    /// create pool fee account
    #[account(
        mut,
        address= raydium_cp_swap::create_pool_fee_reveiver::id(),
    )]
    pub create_pool_fee: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: an account to store oracle observations, init by cp-swap
    #[account(
        mut,
        seeds = [
            OBSERVATION_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub observation_state: UncheckedAccount<'info>,

    /// Program to create mint account and mint tokens
    pub token_program: Program<'info, Token>,
    /// Program to create an ATA for receiving position NFT
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> ProxyInitialize<'info> {
    pub fn proxy_initialize(&self, init_amount_0: u64, init_amount_1: u64, open_time: u64) -> Result<()> {
        let cpi_accounts = cpi::accounts::Initialize {
            creator: self.creator.to_account_info(),
            amm_config: self.amm_config.to_account_info(),
            authority: self.authority.to_account_info(),
            pool_state: self.pool_state.to_account_info(),
            token_0_mint: self.token_0_mint.to_account_info(),
            token_1_mint: self.token_1_mint.to_account_info(),
            lp_mint: self.lp_mint.to_account_info(),
            creator_token_0: self.creator_token_0.to_account_info(),
            creator_token_1: self.creator_token_1.to_account_info(),
            creator_lp_token: self.creator_lp_token.to_account_info(),
            token_0_vault: self.token_0_vault.to_account_info(),
            token_1_vault: self.token_1_vault.to_account_info(),
            create_pool_fee: self.create_pool_fee.to_account_info(),
            observation_state: self.observation_state.to_account_info(),
            token_program: self.token_program.to_account_info(),
            token_0_program: self.token_program.to_account_info(),
            token_1_program: self.token_program.to_account_info(),
            associated_token_program: self.associated_token_program.to_account_info(),
            system_program: self.system_program.to_account_info(),
            rent: self.rent.to_account_info(),
        };
        let cpi_context = CpiContext::new(self.cp_swap_program.to_account_info(), cpi_accounts);
        cpi::initialize(cpi_context, init_amount_0, init_amount_1, open_time)
    }

    pub fn withdraw_token_reserve(&self) -> Result<()> {
        if self.associated_user.state == AccountState::Frozen {
            thaw_account(
                self.global.bump,
                self.token_program.to_account_info(),
                self.mint.to_account_info(),
                self.associated_user.to_account_info(),
                self.global.to_account_info(),
            )?;
        }

        let seeds = [b"global".as_ref(), &[self.global.bump]];
        let binding = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.associated_fair_mint.to_account_info(),
                to: self.associated_user.to_account_info(),
                authority: self.global.to_account_info(),
            },
            binding,
        );
        anchor_spl::token::transfer(cpi_ctx, self.associated_fair_mint.amount)
    }

    pub fn withdraw_wsol(&self) -> Result<()> {
        let seeds = [
            b"fair-mint".as_ref(),
            self.fair_mint.mint.as_ref(),
            &[self.fair_mint.bump_seed],
        ];
        let binding = [&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.fair_mint_wsol.to_account_info(),
                to: self.user_wsol.to_account_info(),
                authority: self.fair_mint.to_account_info(),
            },
            &binding,
        );
        token::transfer(cpi_ctx, self.fair_mint.sol_reserves)
    }

    pub fn burn_liquidity(&self) -> Result<()> {
        let creator_lp_account = extension::StateWithExtensions::<spl_token_2022::state::Account>::unpack(
            self.creator_lp_token.to_account_info().try_borrow_data()?.deref(),
        )?
        .base;
        token::burn(
            CpiContext::new(
                self.token_program.to_account_info(),
                Burn {
                    mint: self.lp_mint.to_account_info(),
                    from: self.creator_lp_token.to_account_info(),
                    authority: self.creator.to_account_info(),
                },
            ),
            creator_lp_account.amount,
        )?;
        Ok(())
    }

    pub fn revoke_mint(&self) -> Result<()> {
        let seeds = [b"global".as_ref(), &[self.global.bump]];
        let binding = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            SetAuthority {
                current_authority: self.global.to_account_info(),
                account_or_mint: self.mint.to_account_info(),
            },
            binding,
        );
        token::set_authority(cpi_ctx, token::spl_token::instruction::AuthorityType::MintTokens, None)?;
        Ok(())
    }
}
