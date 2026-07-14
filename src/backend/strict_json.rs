use std::collections::HashSet;

use serde_json::{Map, Number, Value};

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum StrictJsonError {
    #[error("JSON input is invalid")]
    Invalid,
    #[error("JSON object contains a duplicate key")]
    DuplicateKey,
    #[error("JSON input exceeds its nesting limit")]
    NestingLimit,
    #[error("JSON input exceeds its byte limit")]
    ByteLimit,
    #[error("JSON top level is not an object")]
    TopLevelNotObject,
}

pub fn parse_strict_object(
    input: &str,
    maximum_bytes: usize,
    maximum_depth: usize,
) -> Result<Value, StrictJsonError> {
    if input.len() > maximum_bytes {
        return Err(StrictJsonError::ByteLimit);
    }
    let mut parser = Parser {
        bytes: input.as_bytes(),
        position: 0,
        maximum_depth,
    };
    let value = parser.value(0)?;
    parser.whitespace();
    if parser.position != parser.bytes.len() {
        return Err(StrictJsonError::Invalid);
    }
    if !value.is_object() {
        return Err(StrictJsonError::TopLevelNotObject);
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    position: usize,
    maximum_depth: usize,
}

impl Parser<'_> {
    fn value(&mut self, depth: usize) -> Result<Value, StrictJsonError> {
        if depth > self.maximum_depth {
            return Err(StrictJsonError::NestingLimit);
        }
        self.whitespace();
        match self.peek().ok_or(StrictJsonError::Invalid)? {
            b'{' => self.object(depth + 1),
            b'[' => self.array(depth + 1),
            b'"' => self.string().map(Value::String),
            b't' => {
                self.literal(b"true")?;
                Ok(Value::Bool(true))
            }
            b'f' => {
                self.literal(b"false")?;
                Ok(Value::Bool(false))
            }
            b'n' => {
                self.literal(b"null")?;
                Ok(Value::Null)
            }
            b'-' | b'0'..=b'9' => self.number(),
            _ => Err(StrictJsonError::Invalid),
        }
    }

    fn object(&mut self, depth: usize) -> Result<Value, StrictJsonError> {
        self.consume(b'{')?;
        self.whitespace();
        let mut map = Map::new();
        let mut keys = HashSet::new();
        if self.take(b'}') {
            return Ok(Value::Object(map));
        }
        loop {
            self.whitespace();
            let key = self.string()?;
            if !keys.insert(key.clone()) {
                return Err(StrictJsonError::DuplicateKey);
            }
            self.whitespace();
            self.consume(b':')?;
            let value = self.value(depth)?;
            map.insert(key, value);
            self.whitespace();
            if self.take(b'}') {
                break;
            }
            self.consume(b',')?;
        }
        Ok(Value::Object(map))
    }

    fn array(&mut self, depth: usize) -> Result<Value, StrictJsonError> {
        self.consume(b'[')?;
        self.whitespace();
        let mut values = Vec::new();
        if self.take(b']') {
            return Ok(Value::Array(values));
        }
        loop {
            values.push(self.value(depth)?);
            self.whitespace();
            if self.take(b']') {
                break;
            }
            self.consume(b',')?;
        }
        Ok(Value::Array(values))
    }

    fn string(&mut self) -> Result<String, StrictJsonError> {
        let start = self.position;
        self.consume(b'"')?;
        let mut escaped = false;
        while let Some(byte) = self.peek() {
            self.position += 1;
            if escaped {
                escaped = false;
                continue;
            }
            match byte {
                b'\\' => escaped = true,
                b'"' => {
                    return serde_json::from_slice(&self.bytes[start..self.position])
                        .map_err(|_| StrictJsonError::Invalid);
                }
                0..=31 => return Err(StrictJsonError::Invalid),
                _ => {}
            }
        }
        Err(StrictJsonError::Invalid)
    }

    fn number(&mut self) -> Result<Value, StrictJsonError> {
        let start = self.position;
        while matches!(
            self.peek(),
            Some(b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E')
        ) {
            self.position += 1;
        }
        let number: Number = serde_json::from_slice(&self.bytes[start..self.position])
            .map_err(|_| StrictJsonError::Invalid)?;
        Ok(Value::Number(number))
    }

    fn literal(&mut self, expected: &[u8]) -> Result<(), StrictJsonError> {
        if self
            .bytes
            .get(self.position..self.position + expected.len())
            != Some(expected)
        {
            return Err(StrictJsonError::Invalid);
        }
        self.position += expected.len();
        Ok(())
    }

    fn whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.position += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    fn consume(&mut self, expected: u8) -> Result<(), StrictJsonError> {
        if self.take(expected) {
            Ok(())
        } else {
            Err(StrictJsonError::Invalid)
        }
    }

    fn take(&mut self, expected: u8) -> bool {
        if self.peek() == Some(expected) {
            self.position += 1;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_duplicate_keys_trailing_data_and_nonobject() {
        assert_eq!(
            parse_strict_object(r#"{"x":1,"x":2}"#, 1024, 8),
            Err(StrictJsonError::DuplicateKey)
        );
        assert_eq!(
            parse_strict_object(r#"{"x":{"y":1,"y":2}}"#, 1024, 8),
            Err(StrictJsonError::DuplicateKey)
        );
        assert_eq!(
            parse_strict_object(r#"{"x":1} trailing"#, 1024, 8),
            Err(StrictJsonError::Invalid)
        );
        assert_eq!(
            parse_strict_object("[]", 1024, 8),
            Err(StrictJsonError::TopLevelNotObject)
        );
    }

    #[test]
    fn accepts_exact_nested_json_and_enforces_depth_and_bytes() {
        assert_eq!(
            parse_strict_object(
                r#"{"value":"fixture","nested":[true,null,-1.5e2]}"#,
                1024,
                8
            )
            .unwrap()["value"],
            "fixture"
        );
        assert_eq!(
            parse_strict_object(r#"{"a":{"b":{"c":1}}}"#, 1024, 1),
            Err(StrictJsonError::NestingLimit)
        );
        assert_eq!(
            parse_strict_object(r#"{"x":1}"#, 2, 8),
            Err(StrictJsonError::ByteLimit)
        );
    }
}
