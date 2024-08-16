use anchor_lang::prelude::*;

mod error;
mod event;
mod instructions;
mod state;

use crate::instructions::Buy;
use crate::instructions::Sell;
use crate::BondCurveCommonParams;
use error::ErrorCode::*;
use event::*;
use instructions::*;
use state::*;

use crate::AddLiquidityEvent;
use crate::BuyParams;
use crate::SellEvent;
use crate::TradeInfo;
use crate::{split_fee, BuyEvent, SellParams, TradeStepEvent};
use token::spl_token::native_mint;

pub mod admin {
    use anchor_lang::prelude::declare_id;
    declare_id!("HyEd2PbN4D1zGCJZE8kzHKWDFTQ9LgtiWFgy2AnS258d");
}

declare_id!("7yx8TskMu1CD9pfxJGH3AEwEP7SGhNyt8nwiEvgus5zQ");

use crate::GlobalParams;

use anchor_spl::token::{self};

#[program]
pub mod bondcurve {
    use token::{spl_token::state::AccountState, ThawAccount};

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: GlobalParams) -> Result<()> {
        let global = &mut ctx.accounts.global;
        assert!(!global.initialized, "Already initialized");
        assert!(params.fees.validate(false), "invalid fee");
        global.initialized = true;
        global.authority = params.owner;
        global.params = params;
        global.bump = ctx.bumps.global;
        Ok(())
    }

    pub fn set_global(ctx: Context<SetGlobal>, params: GlobalParams) -> Result<()> {
        ctx.accounts.set_global(params)
    }

    pub fn create(ctx: Context<Create>, init_buy_value: u64, meta: BondCurveMetadata) -> Result<()> {
        if !validate(init_buy_value, &ctx.accounts.global.params) {
            return Err(InvalidBondcurveCommon.into());
        }
        if ctx.accounts.bonding_curve.is_initialized {
            return Err(AlreadyInitialized.into());
        }

        let (_, bump_seed) =
            Pubkey::find_program_address(&[b"bonding-curve", ctx.accounts.mint.key().as_ref()], ctx.program_id);

        ctx.accounts.create_metadata_account(meta.name, meta.symbol, meta.uri)?;

        let bonding_curve = &mut ctx.accounts.bonding_curve;
        bonding_curve.is_initialized = true;
        bonding_curve.bump_seed = bump_seed;
        bonding_curve.token_program_id = *ctx.accounts.token_program.key;
        bonding_curve.mint = *ctx.accounts.mint.to_account_info().key;
        bonding_curve.sol_reserves = 0;
        bonding_curve.init_buy_value = init_buy_value;
        bonding_curve.token_reserves = ctx.accounts.global.params.token_total_supply;
        bonding_curve.trade_step = 1;

        emit!(MintDeployedEvent {
            mint: *ctx.accounts.mint.to_account_info().key,
            sender: *ctx.accounts.user.key,
            unix_timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn create2(ctx: Context<Create2>) -> Result<()> {
        ctx.accounts
            .mint_to_pool(ctx.accounts.global.params.token_total_supply)?;
        Ok(())
    }

    pub fn buy(ctx: Context<Buy>, params: BuyParams) -> Result<()> {
        let bonding_curve = &ctx.accounts.bonding_curve;
        if bonding_curve.trade_step != 1 {
            return Err(InvalidTradeStep.into());
        }

        if *ctx.accounts.mint.to_account_info().key != bonding_curve.mint {
            return Err(IncorrectPoolMint.into());
        }

        if *ctx.accounts.token_program.to_account_info().key != bonding_curve.token_program_id {
            return Err(IncorrectTokenProgramId.into());
        }

        let (_, _, net_sol, token_bought) =
            bonding_curve.estimate_buy_result(params.lamports, ctx.accounts.global.params.trade_a);
        assert!(token_bought > 0, "token_bought is zero");

        if ctx.accounts.associated_user.state == AccountState::Frozen {
            thaw_account(
                ctx.accounts.global.bump,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.associated_user.to_account_info(),
                ctx.accounts.global.to_account_info(),
            )?;
        }

        ctx.accounts.transfer_from_pool_to_user(token_bought)?;

        let (refer_account, up_refer_account) = ctx.accounts.get_refer_and_up_refer_accounts()?;
        let trade_info = split_fee(params.lamports, refer_account, up_refer_account);

        ctx.accounts.transfer_sols_in(&trade_info)?;

        let bonding_curve = ctx.accounts.bonding_curve.as_mut();
        bonding_curve.sol_reserves += net_sol;
        bonding_curve.token_reserves -= token_bought;

        let mut last_token_price = bonding_curve.calc_token_price(trade_info.remain_amount, token_bought);
        if bonding_curve.sol_reserves >= ctx.accounts.global.params.target_amount {
            bonding_curve.trade_step = 2;
            emit!(TradeStepEvent {
                mint: bonding_curve.mint,
                trade_step: 2
            });

            let protocol_fee = bonding_curve.sol_reserves * 5 / 100;
            send_lamports(
                &bonding_curve.to_account_info(),
                &ctx.accounts.fee_recipient.to_account_info(),
                protocol_fee,
            )?;

            let last_price = bonding_curve.calc_last_token_price(ctx.accounts.global.params.trade_a);
            bonding_curve.sol_reserves = bonding_curve.sol_reserves * 95 / 100;
            let pool_token_amount = bonding_curve.calc_pool_token_amount(bonding_curve.sol_reserves, last_token_price);
            let cur_amt = bonding_curve.token_reserves;
            bonding_curve.token_reserves = pool_token_amount;

            last_token_price = last_price;

            ctx.accounts.adjust_pool(cur_amt, pool_token_amount)?;
        } else {
            last_token_price = bonding_curve.calc_last_token_price(ctx.accounts.global.params.trade_a);
        }

        emit!(BuyEvent {
            mint: *ctx.accounts.mint.to_account_info().key,
            sender: *ctx.accounts.user.key,
            amount: params.lamports,
            token_amount: token_bought,
            last_token_price,
            trade_info,
            unix_timestamp: Clock::get()?.unix_timestamp,
        });
        let associate_user = ctx.accounts.associated_user.to_account_info();
        ctx.accounts.freeze_account(&associate_user)?;

        Ok(())
    }

    pub fn sell(ctx: Context<Sell>, params: SellParams) -> Result<()> {
        let bonding_curve = ctx.accounts.bonding_curve.as_mut();
        if bonding_curve.trade_step != 1 {
            return Err(InvalidTradeStep.into());
        }
        if *ctx.accounts.mint.to_account_info().key != bonding_curve.mint {
            return Err(IncorrectPoolMint.into());
        }

        if *ctx.accounts.token_program.to_account_info().key != bonding_curve.token_program_id {
            return Err(IncorrectTokenProgramId.into());
        }
        let sols = bonding_curve.estimate_sell_result(params.token_amount, ctx.accounts.global.params.trade_a);
        assert!(sols.3 > 0, "remain_amount is zero");
        bonding_curve.token_reserves += params.token_amount;
        bonding_curve.sol_reserves -= sols.4;
        let last_token_price = bonding_curve.calc_last_token_price(ctx.accounts.global.params.trade_a);

        let (referrer, up_referrer) = ctx.accounts.get_refer_and_up_refer_accounts()?;
        if ctx.accounts.associated_user.state == AccountState::Frozen {
            thaw_account(
                ctx.accounts.global.bump,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.associated_user.to_account_info(),
                ctx.accounts.global.to_account_info(),
            )?;
        }
        ctx.accounts.transfer_token_in(params.token_amount)?;
        ctx.accounts.transfer_sols_out(sols)?;

        emit!(SellEvent {
            mint: *ctx.accounts.mint.to_account_info().key,
            sender: *ctx.accounts.user.key,
            amount: sols.3,
            token_amount: params.token_amount,
            last_token_price,
            trade_info: TradeInfo {
                referrer,
                referrer_amount: sols.1,
                up_referrer,
                up_referrer_amount: sols.2,
                fee_value: sols.0,
                remain_amount: sols.3,
            },
            unix_timestamp: Clock::get()?.unix_timestamp,
        });
        let associate_user = ctx.accounts.associated_user.to_account_info();
        ctx.accounts.freeze_account(&associate_user)?;
        Ok(())
    }

    pub fn wrap_sol(ctx: Context<WrapSol>) -> Result<()> {
        let bonding_curve = &ctx.accounts.bonding_curve;
        assert!(bonding_curve.trade_step == 2, "Trade step is not 2");
        let mut lamport = ctx.accounts.bonding_curve.sol_reserves;
        let from = ctx.accounts.bonding_curve.to_account_info();
        let from_balance = from.lamports();
        let rent_exempt = Rent::get()?.minimum_balance(from.data_len());
        if from_balance < rent_exempt + lamport {
            lamport = from_balance - rent_exempt - 1000; // FOR RENT
        }
        send_lamports(
            &bonding_curve.to_account_info(),
            &ctx.accounts.bonding_curve_wsol.to_account_info(),
            lamport,
        )?;
        let bc = ctx.accounts.bonding_curve.as_mut();
        bc.trade_step = 3;
        bc.sol_reserves = lamport;
        emit!(TradeStepEvent {
            mint: bc.mint,
            trade_step: 3
        });
        Ok(())
    }

    // Sync the native token to reflect the new SOL balance as wSOL
    pub fn sync_wsol(ctx: Context<SyncWsol>) -> Result<()> {
        let bonding_curve = &ctx.accounts.bonding_curve;
        assert!(bonding_curve.trade_step == 3, "Trade step is not 3");
        token::sync_native(CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::SyncNative {
                account: ctx.accounts.bonding_curve_wsol.to_account_info(),
            },
        ))?;
        let bc = ctx.accounts.bonding_curve.as_mut();
        bc.trade_step = 4;
        emit!(TradeStepEvent {
            mint: bc.mint,
            trade_step: 4
        });
        Ok(())
    }

    pub fn proxy_initialize(ctx: Context<ProxyInitialize>, open_time: u64) -> Result<()> {
        let bonding_curve = &ctx.accounts.bonding_curve;
        assert!(bonding_curve.trade_step == 4, "Trade step is not 4");

        let (init_amount_0, init_amount_1) = if bonding_curve.mint < native_mint::ID {
            (bonding_curve.token_reserves, bonding_curve.sol_reserves)
        } else {
            (bonding_curve.sol_reserves, bonding_curve.token_reserves)
        };

        ctx.accounts.withdraw_token_reserve()?;
        ctx.accounts.withdraw_wsol()?;

        ctx.accounts.proxy_initialize(init_amount_0, init_amount_1, open_time)?;
        emit!(TradeStepEvent {
            mint: bonding_curve.mint,
            trade_step: 5
        });
        emit!(AddLiquidityEvent {
            mint: bonding_curve.mint,
            sender: ctx.accounts.creator.key(),
            sol_amount: bonding_curve.sol_reserves,
            token_amount: bonding_curve.token_reserves,
            unix_timestamp: Clock::get()?.unix_timestamp,
        });
        let bc = ctx.accounts.bonding_curve.as_mut();
        bc.trade_step = 5;
        ctx.accounts.burn_liquidity()?;
        ctx.accounts.revoke_mint()?;
        Ok(())
    }

    pub fn unlock(ctx: Context<Unlock>) -> Result<()> {
        if ctx.accounts.bonding_curve.trade_step != 5 {
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
