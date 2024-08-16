use anchor_lang::prelude::*;
use anchor_spl::token::{self, spl_token::native_mint};
use token::{spl_token::state::AccountState, ThawAccount};
pub mod error;
pub mod event;
pub mod helper;
pub mod instructions;
pub mod state;

use error::ErrorCode::*;
pub use event::*;
pub use helper::*;
use instructions::*;
pub use state::*;

pub mod admin {
    use anchor_lang::prelude::declare_id;
    declare_id!("CtQYLQMtL7azqRj5qRPxgumzDQ9mL44HWrv3iWm4T6Jg");
}

declare_id!("8Ezd1v6nBKrVBvQepsjmzXE7KoistTyFGrKwXV6BoqRw");

#[program]
pub mod fairmint {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_recipient: Pubkey, owner: Pubkey, dex_bot: Pubkey) -> Result<()> {
        let global = &mut ctx.accounts.global;
        assert!(!global.initialized, "Already initialized");
        global.initialized = true;
        global.fee_recipient = fee_recipient;
        global.owner = owner;
        global.dex_bot = dex_bot;
        global.bump = ctx.bumps.global;

        Ok(())
    }

    pub fn set_global(ctx: Context<SetGlobal>, fee_recipient: Pubkey, owner: Pubkey, dex_bot: Pubkey) -> Result<()> {
        let global = &mut ctx.accounts.global;
        global.fee_recipient = fee_recipient;
        global.owner = owner;
        global.dex_bot = dex_bot;
        Ok(())
    }

    pub fn create(ctx: Context<Create>, common: FairMintCommonParams, meta: TokenMetadata) -> Result<()> {
        if !common.validate() {
            return Err(InvalidFairmintCommon.into());
        }
        if !ctx.accounts.global.fees.validate(true) {
            return Err(InvalidFairmintFees.into());
        }

        if ctx.accounts.fair_mint.is_initialized {
            return Err(AlreadyInitialized.into());
        }

        let (_, bump_seed) = Pubkey::find_program_address(
            &[b"fair-mint".as_ref(), ctx.accounts.mint.key().as_ref()],
            ctx.program_id,
        );
        ctx.accounts.create_metadata_account(meta.name, meta.symbol, meta.uri)?;

        let fair_mint = &mut ctx.accounts.fair_mint;
        fair_mint.is_initialized = true;
        fair_mint.bump_seed = bump_seed;
        fair_mint.token_program_id = *ctx.accounts.token_program.key;
        fair_mint.mint = *ctx.accounts.mint.to_account_info().key;
        fair_mint.common = common.clone();
        fair_mint.sol_reserves = 0;
        fair_mint.token_reserves = 0;
        fair_mint.trade_step = 0;
        Ok(())
    }

    pub fn create2(_ctx: Context<Create2>) -> Result<()> {
        Ok(())
    }

    pub fn fair_mint(ctx: Context<FairMint>, params: FairMintParams) -> Result<()> {
        let fair_mint = &mut ctx.accounts.fair_mint;
        if fair_mint.to_account_info().owner != ctx.program_id {
            return Err(ProgramError::IncorrectProgramId.into());
        }

        if fair_mint.trade_step != 0 {
            return Err(InvalidTradeStep.into());
        }

        if *ctx.accounts.token_program.to_account_info().key != fair_mint.token_program_id {
            return Err(IncorrectTokenProgramId.into());
        }

        let sol_min = fair_mint.sol_required(params.amount);
        let (protocol_fee, net_sol) = crate::remain_amount(sol_min);

        if params.amount < fair_mint.common.single_mint_min {
            return Err(AmountTooSmall.into());
        }

        if params.amount > fair_mint.common.single_mint_max {
            return Err(AmountTooBig.into());
        }

        fair_mint.token_reserves += params.amount;
        fair_mint.sol_reserves += net_sol;

        if fair_mint.token_reserves + fair_mint.common.single_mint_min > fair_mint.common.mint_supply {
            fair_mint.trade_step = 2;
            emit!(TradeStepEvent {
                mint: fair_mint.mint,
                trade_step: 2
            });
        }

        if ctx.accounts.associated_user.state == AccountState::Frozen {
            thaw_account(
                ctx.accounts.global.bump,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.associated_user.to_account_info(),
                ctx.accounts.global.to_account_info(),
            )?;
        }
        mint_to(
            ctx.accounts.global.bump,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.associated_user.to_account_info(),
            ctx.accounts.global.to_account_info(),
            params.amount,
        )?;

        transfer_sol(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.fee_recipient.to_account_info(),
            protocol_fee,
        )?;

        let to = fair_mint.to_account_info();
        transfer_sol(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.user.to_account_info(),
            to,
            net_sol,
        )?;

        if fair_mint.trade_step == 2 {
            let pool_token_amount = fair_mint.sol_reserves * 1_000_000_000 / fair_mint.common.mint_price;
            mint_to(
                ctx.accounts.global.bump,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.associated_fair_mint.to_account_info(),
                ctx.accounts.global.to_account_info(),
                pool_token_amount,
            )?;
        }
        emit!(FairMintEvent {
            mint: fair_mint.mint,
            sender: *ctx.accounts.user.key,
            amount: params.amount,
            unix_timestamp: Clock::get()?.unix_timestamp,
        });

        let associate_user = ctx.accounts.associated_user.to_account_info();
        ctx.accounts.freeze_account(&associate_user)?;
        Ok(())
    }

    pub fn wrap_sol(ctx: Context<WrapSol>) -> Result<()> {
        let fair_mint = &ctx.accounts.fair_mint;
        assert!(fair_mint.trade_step == 2, "Trade step is not 2");
        let lamport = ctx.accounts.fair_mint.sol_reserves;
        send_lamports(
            &fair_mint.to_account_info(),
            &ctx.accounts.fair_mint_wsol.to_account_info(),
            lamport,
        )?;
        let fm = &mut ctx.accounts.fair_mint.as_mut();
        fm.trade_step = 3;
        emit!(TradeStepEvent {
            mint: fm.mint,
            trade_step: 3
        });
        Ok(())
    }

    // Sync the native token to reflect the new SOL balance as wSOL
    pub fn sync_wsol(ctx: Context<SyncWsol>) -> Result<()> {
        let fair_mint = &ctx.accounts.fair_mint;
        assert!(fair_mint.trade_step == 3, "Trade step is not 3");
        token::sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::SyncNative {
                account: ctx.accounts.fair_mint_wsol.to_account_info(),
            },
        ))?;
        let fm = &mut ctx.accounts.fair_mint.as_mut();
        fm.trade_step = 4;
        emit!(TradeStepEvent {
            mint: fm.mint,
            trade_step: 4
        });
        Ok(())
    }

    pub fn proxy_initialize(ctx: Context<ProxyInitialize>, open_time: u64) -> Result<()> {
        let fair_mint = &ctx.accounts.fair_mint;
        let associated_fair_mint = &ctx.accounts.associated_fair_mint;
        let pool_token_amount = associated_fair_mint.amount;
        assert!(fair_mint.trade_step == 4, "Trade step is not 4");

        let (init_amount_0, init_amount_1) = if fair_mint.mint < native_mint::ID {
            (pool_token_amount, fair_mint.sol_reserves)
        } else {
            (fair_mint.sol_reserves, pool_token_amount)
        };

        ctx.accounts.withdraw_token_reserve()?;
        ctx.accounts.withdraw_wsol()?;

        ctx.accounts.proxy_initialize(init_amount_0, init_amount_1, open_time)?;
        emit!(TradeStepEvent {
            mint: fair_mint.mint,
            trade_step: 5
        });
        emit!(AddLiquidityEvent {
            mint: fair_mint.mint,
            sender: ctx.accounts.creator.key(),
            sol_amount: fair_mint.sol_reserves,
            token_amount: pool_token_amount,
            unix_timestamp: Clock::get()?.unix_timestamp,
        });
        let fm = ctx.accounts.fair_mint.as_mut();
        fm.trade_step = 5;
        ctx.accounts.burn_liquidity()?;
        ctx.accounts.revoke_mint()?;
        Ok(())
    }

    pub fn unlock(ctx: Context<Unlock>) -> Result<()> {
        if ctx.accounts.fair_mint.trade_step != 5 {
            return Err(InvalidTradeStep.into());
        }
        if ctx.accounts.associated_user.state != AccountState::Frozen {
            return Err(AccountNotFrozen.into());
        }
        let seeds = &[b"global".as_ref(), &[ctx.accounts.global.bump]];
        let signer = [&seeds[..]];
        let cpi_accounts = ThawAccount {
            account: ctx.accounts.associated_user.to_account_info().clone(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.global.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer);
        anchor_spl::token::thaw_account(cpi_ctx)
    }
}

#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct InitializeParams {
    pub common: FairMintCommonParams,
    pub fees: Fees,
}

/// Calculates the authority id by generating a program address.
pub fn authority_id(program_id: &Pubkey, my_info: &Pubkey, bump_seed: u8) -> Result<Pubkey> {
    Pubkey::create_program_address(&[&my_info.to_bytes()[..32], &[bump_seed]], program_id)
        .or(Err(InvalidProgramAddress.into()))
}
