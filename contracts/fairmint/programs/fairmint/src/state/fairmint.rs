use anchor_lang::prelude::*;

#[derive(PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug, Clone)]
pub struct FairMintCommonParams {
    pub mint_supply: u64,
    pub mint_price: u64,
    pub single_mint_min: u64,
    pub single_mint_max: u64,
    pub mint_max: u64,
}

#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

impl FairMintCommonParams {
    pub fn validate(&self) -> bool {
        self.mint_supply > 0
            && self.mint_price > 0
            && self.single_mint_min > 0
            && self.single_mint_max > 0
            && self.single_mint_min <= self.single_mint_max
            && self.mint_max > 0
            && self.mint_max <= self.mint_supply
    }
}
