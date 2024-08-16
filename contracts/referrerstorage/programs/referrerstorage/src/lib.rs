use anchor_lang::prelude::*;

declare_id!("6RbbdFjmhqPiQ3bqk8Gg8StwJ7szwPPGAzjRLmeFLC7D");

#[program]
pub mod referrerstorage {
    use super::*;

    pub fn set_referrer(ctx: Context<SetReferrer>, referrer: Pubkey) -> Result<()> {
        assert!(ctx.accounts.user.key != &referrer, "Cannot refer self");
        ctx.accounts.storage.referrer = referrer;
        ctx.accounts.storage.owner = *ctx.accounts.user.key;
        ctx.accounts.storage.bump = ctx.bumps.storage;

        emit!(ReferrerSet {
            owner: *ctx.accounts.user.key,
            referrer,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetReferrer<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(init, payer = user, space = 8 + MyStorage::INIT_SPACE, seeds=[b"referrer", user.key().as_ref()], bump)]
    pub storage: Account<'info, MyStorage>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace, Default)]
pub struct MyStorage {
    pub owner: Pubkey,
    pub referrer: Pubkey,
    pub bump: u8,
}

#[event]
pub struct ReferrerSet {
    pub owner: Pubkey,
    pub referrer: Pubkey,
    pub timestamp: i64,
}
