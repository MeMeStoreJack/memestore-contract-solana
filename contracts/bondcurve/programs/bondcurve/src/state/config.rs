#![allow(dead_code)]

use anchor_lang::{prelude::*, solana_program::native_token::LAMPORTS_PER_SOL};

use crate::Fees;

#[account]
#[derive(Default, Debug)]
pub struct BondcurveConfig {
    /// Is the swap initialized, with data written to it
    pub is_initialized: bool,
    /// Bump seed used to generate the program address / authority
    pub bump_seed: u8,
    /// Token program ID associated with the swap
    pub token_program_id: Pubkey,
    /// Address of pool token mint
    pub mint: Pubkey,
    /// Address of pool fee account
    pub fees: Fees,
    pub owner: Pubkey,
    pub sol_reserves: u64,
    pub token_reserves: u64,
    pub trade_step: u8,
    pub token_total_supply: u64,
    pub init_buy_value: u64,
}

impl BondcurveConfig {
    pub const LEN: usize = 8 + std::mem::size_of::<BondcurveConfig>();

    pub fn remain_amount(&self, sol_value: u64) -> u64 {
        sol_value - sol_value * 15 / 1000
    }

    pub fn get_amount_out(&self, value: u64, is_buy: bool, trade_a: u64) -> u64 {
        Self::calc_amount_out(value, is_buy, self.token_reserves, self.sol_reserves, trade_a)
    }

    pub fn get_buy_price(&self, buy_amount_sol: u64, trade_a: u64) -> u64 {
        return self.get_amount_out(buy_amount_sol, true, trade_a);
    }

    pub fn get_sell_price(&self, sell_amount_token: u64, trade_a: u64) -> u64 {
        return self.get_amount_out(sell_amount_token, false, trade_a);
    }

    pub fn calc_amount_out(value: u64, is_buy: bool, token_reserves: u64, sol_reserves: u64, trade_a: u64) -> u64 {
        let value_u128 = value as u128;
        let sol_reserves_u128 = sol_reserves as u128;
        let trade_a_u128 = trade_a as u128;
        let token_reserves_u128 = token_reserves as u128;
        if is_buy {
            // value * token_reserves / (sol_reserves + value + trade_a)
            let token_bought = value_u128
                .checked_mul(token_reserves_u128)
                .unwrap()
                .checked_div(sol_reserves_u128 + value_u128 + trade_a_u128)
                .unwrap() as u64;
            return token_bought;
        } else {
            // value * (sol_reserves + trade_a) / (token_reserves + value)
            let sol_got = value_u128
                .checked_mul(sol_reserves_u128 + trade_a_u128)
                .unwrap()
                .checked_div(token_reserves_u128 + value_u128)
                .unwrap() as u64;
            return sol_got;
        }
    }

    pub fn estimate_buy_result(&self, lamports: u64, trade_a: u64) -> (u64, u64, u64, u64) {
        let net_sol = self.remain_amount(lamports);
        (
            lamports * 1 / 100,        // trade_fee
            lamports * (3 + 2) / 1000, // refer+upreferer fee
            net_sol,
            self.get_amount_out(net_sol, true, trade_a), // remain token
        )
    }

    pub fn estimate_sell_result(&self, token_amount: u64, trade_a: u64) -> (u64, u64, u64, u64, u64) {
        let sol_amt: u64 = self.get_amount_out(token_amount, false, trade_a);
        let trade_fee = sol_amt * 1 / 100;
        let refer_fee = sol_amt * 3 / 1000;
        let uprefer_fee = sol_amt * 2 / 1000;
        (trade_fee, refer_fee, uprefer_fee, sol_amt * 985 / 1000, sol_amt)
    }

    pub fn calc_last_token_price(&self, trade_a: u64) -> u64 {
        let x = (0.0000985 * 1e9) as u128;
        let lamports_per_sol = LAMPORTS_PER_SOL as u128;
        x.checked_mul(10000 * lamports_per_sol)
            .unwrap()
            .checked_div(self.get_amount_out(x as u64, true, trade_a) as u128)
            .unwrap() as u64
    }

    pub fn calc_token_price(&self, remain_amount: u64, token_bought: u64) -> u64 {
        if token_bought == 0 {
            return 0;
        }
        let remain_amount_u128 = remain_amount as u128;
        let token_bought_u128 = token_bought as u128;
        let lamports_per_sol = LAMPORTS_PER_SOL as u128;
        remain_amount_u128
            .checked_mul(lamports_per_sol)
            .unwrap()
            .checked_div(token_bought_u128)
            .unwrap() as u64
    }

    pub fn calc_pool_token_amount(&self, sol_reserves: u64, last_token_price: u64) -> u64 {
        let sol_reserves_u128 = sol_reserves as u128;
        let last_token_price_u128 = last_token_price as u128;
        sol_reserves_u128
            .checked_mul(1_000_000_000)
            .unwrap()
            .checked_div(last_token_price_u128)
            .unwrap() as u64
    }
}
