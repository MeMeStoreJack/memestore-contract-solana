use anchor_lang::prelude::*;

use super::Fees;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Copy, Debug)]
pub struct GlobalParams {
    pub fee_recipient: Pubkey,
    pub token_total_supply: u64,
    pub owner: Pubkey,
    pub fees: Fees,
    pub target_amount: u64,
    pub trade_a: u64,
    pub init_buy_max_percent: u64,
    pub dex_bot: Pubkey, // backend bot for add liquidity
}

#[derive(Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct BondCurveCommonParams {
    pub init_buy_value: u64, // sol value for first buy when create
}

#[derive(Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct BondCurveMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

pub fn validate(init_buy_value: u64, p: &GlobalParams) -> bool {
    init_buy_value == 0
        || (init_buy_value > 0
            && p.init_buy_max_percent < 1000
            && init_buy_value * 1000 <= p.target_amount * p.init_buy_max_percent)
}

#[account]
#[derive(Default, Copy, Debug)]
pub struct GlobalAccount {
    pub bump: u8,
    pub initialized: bool,
    pub authority: Pubkey,
    pub params: GlobalParams,
}

impl GlobalAccount {
    pub const LEN: usize = 8 + std::mem::size_of::<GlobalAccount>();
}

#[account]
#[derive(Default, Debug)]
pub struct BuyParams {
    pub lamports: u64,
}

impl BuyParams {
    pub const LEN: usize = 8 + std::mem::size_of::<BuyParams>();
}

#[account]
#[derive(Default, Debug)]
pub struct SellParams {
    pub token_amount: u64,
}

impl SellParams {
    pub const LEN: usize = 8 + std::mem::size_of::<SellParams>();
}
