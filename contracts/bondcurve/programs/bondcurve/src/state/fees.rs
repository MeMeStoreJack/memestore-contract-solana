use anchor_lang::prelude::*;

#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct Fee {
    pub numerator: u64,
    pub denominator: u64,
}

#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct Fees {
    pub trade: Fee,         // 1%
    pub referrer: Fee,      // 0.3%
    pub up_referrer: Fee,   // 0.2%
    pub add_liquidity: Fee, // 5%
}

impl Fees {
    pub fn validate(&self, is_fair_mint: bool) -> bool {
        if is_fair_mint {
            self.trade.numerator == 0
                && self.referrer.numerator == 0
                && self.up_referrer.numerator == 0
                && self.add_liquidity.numerator < 1000
        } else {
            self.trade.numerator != 0
                && self.referrer.numerator != 0
                && self.up_referrer.numerator != 0
                && self.add_liquidity.numerator < 1000
        }
    }
}
