use crate::GlobalAccount;
use anchor_lang::prelude::*;
use anchor_spl::{
    metadata::{create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3},
    token::{Mint, Token},
};

use crate::BondcurveConfig;
use anchor_spl::metadata::Metadata;

use mpl_token_metadata::pda::find_metadata_account;

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(mut, constraint = user.key() == global.params.dex_bot)]
    pub user: Signer<'info>,
    #[account(init_if_needed, payer = user, mint::decimals = 9, mint::authority = global.key(), mint::freeze_authority = global.key())]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<BondcurveConfig>(),
        seeds = [b"bonding-curve", mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve: Box<Account<'info, BondcurveConfig>>,
    #[account(mut)]
    pub global: Box<Account<'info, GlobalAccount>>,
    /// CHECK: Safe
    #[account(
        mut,
        address = find_metadata_account(&mint.key()).0,
    )]
    pub metadata: AccountInfo<'info>,
    /// CHECK: Safe
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> Create<'info> {
    pub fn create_metadata_account(&self, name: String, symbol: String, uri: String) -> Result<()> {
        let global_seeds = &[b"global".as_ref(), &[self.global.bump]];
        let global_signer = [&global_seeds[..]];
        let token_data = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };
        let metadata_ctx = CpiContext::new_with_signer(
            self.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: self.metadata.to_account_info(),
                mint: self.mint.to_account_info(),
                mint_authority: self.global.to_account_info(),
                payer: self.user.to_account_info(),
                update_authority: self.global.to_account_info(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
            &global_signer,
        );
        msg!("Creating metadata account");
        create_metadata_accounts_v3(metadata_ctx, token_data, false, false, None)?;
        Ok(())
    }
}
