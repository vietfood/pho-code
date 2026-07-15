use super::Usage;

pub const PROFILE_REVISION: u32 = 1;
pub const MODEL: &str = "deepseek-v4-flash";
pub const THINKING_MODE: &str = "enabled";
pub const REASONING_EFFORT: &str = "high";
pub const MODELS_ENDPOINT: &str = "https://api.deepseek.com/models";
pub const CHAT_ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
pub const MAXIMUM_OUTPUT_TOKENS: u32 = 16_384;
pub const PRICE_OBSERVED_ON: &str = "2026-07-15";
pub const MAXIMUM_PRICE_AGE_DAYS: i64 = 30;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EstimatedCost {
    pub nano_usd: u128,
    pub observed_on: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum PriceProfileError {
    #[error("price profile is stale")]
    Stale,
    #[error("system clock precedes the price observation")]
    ClockInvalid,
}

pub fn estimate_cost(usage: &Usage) -> Result<Option<EstimatedCost>, PriceProfileError> {
    let current_day = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| PriceProfileError::ClockInvalid)?
        .as_secs()
        / 86_400;
    estimate_cost_on_day(
        usage,
        i64::try_from(current_day).map_err(|_| PriceProfileError::ClockInvalid)?,
    )
}

fn estimate_cost_on_day(
    usage: &Usage,
    current_day: i64,
) -> Result<Option<EstimatedCost>, PriceProfileError> {
    let observed_day = days_from_civil(2026, 7, 15);
    let age = current_day
        .checked_sub(observed_day)
        .ok_or(PriceProfileError::ClockInvalid)?;
    if age < 0 {
        return Err(PriceProfileError::ClockInvalid);
    }
    if age > MAXIMUM_PRICE_AGE_DAYS {
        return Err(PriceProfileError::Stale);
    }
    let (Some(cache_hit), Some(cache_miss), Some(output)) = (
        usage.cache_hit_tokens,
        usage.cache_miss_tokens,
        usage.output_tokens,
    ) else {
        return Ok(None);
    };
    let Some(weighted) = u128::from(cache_hit)
        .checked_mul(2_800_000)
        .and_then(|value| {
            u128::from(cache_miss)
                .checked_mul(140_000_000)
                .and_then(|miss| value.checked_add(miss))
        })
        .and_then(|value| {
            u128::from(output)
                .checked_mul(280_000_000)
                .and_then(|output| value.checked_add(output))
        })
    else {
        return Ok(None);
    };
    Ok(Some(EstimatedCost {
        nano_usd: weighted / 1_000_000,
        observed_on: PRICE_OBSERVED_ON,
    }))
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
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
        let observed_day = days_from_civil(2026, 7, 15);
        assert_eq!(
            estimate_cost_on_day(&usage, observed_day)
                .unwrap()
                .unwrap()
                .nano_usd,
            4_228
        );
        let mut incomplete = usage;
        incomplete.cache_hit_tokens = None;
        assert_eq!(
            estimate_cost_on_day(&incomplete, observed_day).unwrap(),
            None
        );
        assert_eq!(
            estimate_cost_on_day(&incomplete, observed_day + 31),
            Err(PriceProfileError::Stale)
        );
        assert_eq!(
            estimate_cost_on_day(&incomplete, observed_day - 1),
            Err(PriceProfileError::ClockInvalid)
        );
    }
}
