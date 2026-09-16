use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unknown challenge track")]
    InvalidTrack,
    #[msg("Multiply must be between 1 and 10")]
    InvalidMultiply,
    #[msg("Registration for this challenge is not open")]
    RegistrationClosed,
    #[msg("Registration must be co-signed by the verifier")]
    InvalidVerifier,
    #[msg("That day is not part of this challenge")]
    InvalidDay,
    #[msg("That day has not started yet")]
    DayNotStarted,
    #[msg("Progress can no longer be recorded for this challenge")]
    RecordingClosed,
    #[msg("The challenge is still running")]
    ChallengeNotOver,
    #[msg("This participant was already counted")]
    AlreadyTallied,
    #[msg("Every participant must be counted first")]
    NotFinalized,
    #[msg("Only participants who passed every day can claim")]
    NotAWinner,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Everyone must claim before fees can be withdrawn")]
    ClaimsPending,
    #[msg("This challenge has winners, so nothing rolls over")]
    NothingToRollOver,
    #[msg("The prize pool already rolled over")]
    AlreadyRolledOver,
    #[msg("The prize pool can only roll over into a later challenge on the same track")]
    InvalidRolloverTarget,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
