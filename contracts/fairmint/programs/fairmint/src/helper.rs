use crate::error::ErrorCode::NotRentExempt;
use anchor_lang::{prelude::*, system_program};

pub fn send_lamports(from: &AccountInfo, to: &AccountInfo, lamports: u64) -> Result<()> {
    let from_minimum_rent_excempt_balance = Rent::get()?.minimum_balance(from.try_data_len()?);
    if from.lamports() < from_minimum_rent_excempt_balance + lamports {
        return Err(NotRentExempt.into());
    }
    from.sub_lamports(lamports)?;
    to.add_lamports(lamports)?;
    Ok(())
}

pub fn transfer_sol<'info>(
    system_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    lamports: u64,
) -> Result<()> {
    system_program::transfer(
        CpiContext::new(system_program.to_account_info(), system_program::Transfer { from, to }),
        lamports,
    )?;
    Ok(())
}
