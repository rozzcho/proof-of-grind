use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the admin can create challenges")]
    Unauthorized,
    #[msg("Track must be weekly (0) or biweekly (1)")]
    InvalidTrack,
    #[msg("Entry fee must be greater than zero")]
    InvalidEntryFee,
    #[msg("Registration must be co-signed by the verifier")]
    InvalidVerifier,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
