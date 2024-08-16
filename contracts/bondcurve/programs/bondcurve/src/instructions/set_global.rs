use crate::state::{GlobalAccount, GlobalParams};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct SetGlobal<'info> {
    #[account(mut, constraint = global.params.owner == *user.key)]
    pub global: Box<Account<'info, GlobalAccount>>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> SetGlobal<'info> {
    pub fn set_global(&mut self, params: GlobalParams) -> Result<()> {
        let global = self.global.as_mut();
        assert!(params.fees.validate(true), "invalid fee");
        global.authority = params.owner;
        global.params = params;
        Ok(())
    }
}
