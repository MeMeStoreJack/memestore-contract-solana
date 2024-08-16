use anchor_lang::prelude::*;

use super::FairMintGlobalAccount;

#[derive(Accounts)]
pub struct SetGlobal<'info> {
    #[account(mut, constraint = global.owner == *user.key)]
    pub global: Box<Account<'info, FairMintGlobalAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> SetGlobal<'info> {
    pub fn set_global(&mut self, fee_recipient: Pubkey, owner: Pubkey, dex_bot: Pubkey) -> Result<()> {
        let global = &mut self.global;
        global.fee_recipient = fee_recipient;
        global.owner = owner;
        global.dex_bot = dex_bot;
        Ok(())
    }
}
