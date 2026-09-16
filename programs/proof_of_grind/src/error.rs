use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the weekly track is open")]
    InvalidTrack,
    #[msg("Multiply must be between 1 and 10")]
    InvalidMultiply,
    #[msg("Registration for this challenge is not open")]
    RegistrationClosed,
    #[msg("Registration must be co-signed by the verifier")]
    InvalidVerifier,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
