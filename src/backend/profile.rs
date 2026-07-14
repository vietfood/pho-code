use super::Usage;

pub const PROFILE_REVISION: u32 = 1;
pub const MODEL: &str = "deepseek-v4-flash";
pub const MODELS_ENDPOINT: &str = "https://api.deepseek.com/models";
pub const CHAT_ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
pub const MAXIMUM_OUTPUT_TOKENS: u32 = 16_384;
pub const PRICE_OBSERVED_ON: &str = "2026-07-14";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EstimatedCost {
    pub nano_usd: u128,
    pub observed_on: &'static str,
}

pub fn estimate_cost(usage: &Usage) -> Option<EstimatedCost> {
    let weighted = u128::from(usage.cache_hit_tokens?)
        .checked_mul(2_800_000)?
        .checked_add(u128::from(usage.cache_miss_tokens?).checked_mul(140_000_000)?)?
        .checked_add(u128::from(usage.output_tokens?).checked_mul(280_000_000)?)?;
    Some(EstimatedCost {
        nano_usd: weighted / 1_000_000,
        observed_on: PRICE_OBSERVED_ON,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_is_dated_checked_and_does_not_add_reasoning_twice() {
        let usage = Usage {
            prompt_tokens: Some(35),
            cache_hit_tokens: Some(10),
            cache_miss_tokens: Some(20),
            output_tokens: Some(5),
            reasoning_tokens: Some(4),
            total_tokens: Some(40),
        };
        assert_eq!(estimate_cost(&usage).unwrap().nano_usd, 4_228);
        let mut incomplete = usage;
        incomplete.cache_hit_tokens = None;
        assert!(estimate_cost(&incomplete).is_none());
    }
}
