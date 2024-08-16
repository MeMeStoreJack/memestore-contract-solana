use anchor_lang::prelude::*;

#[account]
pub struct FairMintParams {
    pub amount: u64,
}

impl FairMintParams {
    pub const LEN: usize = 8 + std::mem::size_of::<FairMintParams>();
}
