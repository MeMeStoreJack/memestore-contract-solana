//! Error Types

use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Config account has already been initialized")]
    AlreadyInitialized,
    // The program address provided doesn't match the value generated by the program.
    #[msg("Invalid program address generated from bump seed and key")]
    InvalidProgramAddress,
    // The owner of the pool token output is set to the program address generated by the program.
    #[msg("Output pool account owner cannot be the program address")]
    InvalidOutputOwner,
    // The owner of the input isn't set to the program address generated by the program.
    #[msg("Input account owner is not the program address")]
    InvalidOwner,
    #[msg("Pool token mint has a non-zero supply")]
    InvalidSupply,
    #[msg("Pool token mint has a freeze authority")]
    InvalidFreezeAuthority,
    #[msg("Invalid mint price")]
    InvalidMintPrice,
    #[msg("Invalid fairmint common config")]
    InvalidFairmintCommon,
    #[msg("Invalid fairmint fees config")]
    InvalidFairmintFees,
    #[msg("Invalid bondcurve common config")]
    InvalidBondcurveCommon,
    #[msg("Invalid bondcurve fees config")]
    InvalidBondcurveFees,
    // Address of the provided pool token mint is incorrect
    #[msg("Address of the provided pool token mint is incorrect")]
    IncorrectPoolMint,
    // The provided token program does not match the token program expected by the fairmint
    #[msg("The provided token program does not match the token program expected by the fairmint")]
    IncorrectTokenProgramId,
    #[msg("The provided token fee account does not match expected by the fairmint/bondcurve")]
    IncorrectPoolFeeAccount,
    #[msg("amount is too small")]
    AmountTooSmall,
    #[msg("amount is too big")]
    AmountTooBig,
    #[msg("invalid trade step")]
    InvalidTradeStep,
    #[msg("Account is not frozen")]
    AccountNotFrozen,
    #[msg("Account is not authorized to sign this instruction")]
    MultisigAccountNotAuthorized,
    #[msg("Account is not rent exempt")]
    NotRentExempt,
}
