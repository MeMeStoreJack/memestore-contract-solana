use anchor_lang::prelude::*;
use num_traits::pow;

use super::FairMintCommonParams;

#[account]
#[derive(Default, Debug)]
pub struct FairmintConfig {
    /// Is the swap initialized, with data written to it
    pub is_initialized: bool,
    /// Bump seed used to generate the program address / authority
    pub bump_seed: u8,
    /// Token program ID associated with the swap
    pub token_program_id: Pubkey,
    /// Address of pool token mint
    pub mint: Pubkey,
    /// Address of pool fee account
    pub fee_recipient: Pubkey,
    /// common associated with fairmint
    pub common: FairMintCommonParams,
    pub owner: Pubkey,
    pub sol_reserves: u64,
    pub token_reserves: u64,
    pub token_total_supply: u64,
    pub trade_step: u8,
}

impl FairmintConfig {
    pub const LEN: usize = 8 + std::mem::size_of::<FairmintConfig>();

    pub fn get_token_out(&self, sol_in: u64) -> u64 {
        sol_in * pow(10, 9) / self.common.mint_price
    }

    pub fn sol_required(&self, token_in: u64) -> u64 {
        token_in * self.common.mint_price / pow(10, 9)
    }
}
