use anchor_lang::prelude::*;

#[event]
pub struct TradeStepEvent {
    pub mint: Pubkey,
    pub trade_step: u8,
}

#[event]
pub struct FairMintEvent {
    pub mint: Pubkey,
    pub sender: Pubkey,
    pub amount: u64, // token amount
    pub unix_timestamp: i64,
}

#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct TradeInfo {
    pub referrer: Pubkey,
    pub referrer_amount: u64,
    pub up_referrer: Pubkey,
    pub up_referrer_amount: u64,
    pub fee_value: u64,
    pub remain_amount: u64,
}

pub fn split_fee(amount: u64, referrer: Pubkey, up_referrer: Pubkey) -> TradeInfo {
    let fee_value = amount * 10 / 1000;
    let referrer_amount = amount * 3 / 1000;
    let up_referrer_amount = amount * 2 / 1000;
    let remain_amount = amount - fee_value - referrer_amount - up_referrer_amount;
    TradeInfo {
        referrer,
        referrer_amount,
        up_referrer,
        up_referrer_amount,
        fee_value,
        remain_amount,
    }
}

pub fn remain_amount(amount: u64) -> (u64, u64) {
    (amount * 5 / 100, amount * 95 / 100)
}

#[event]
pub struct AddLiquidityEvent {
    pub mint: Pubkey,
    pub sender: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub unix_timestamp: i64,
}
