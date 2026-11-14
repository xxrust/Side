//! Bounded, private extension report transport. Artifact bytes are independent.
//! Integers and IEEE doubles keep their types; unusual Python values take a
//! strict JSON escape instead of inventing different conversion semantics.
use serde_json::{Map, Number, Value};
const LIMIT: usize = 32 * 1024 * 1024;
pub const FORMAT: &str = "agentcv-typed-report-v1";
struct Reader<'a> {
    bytes: &'a [u8],
    position: usize,
    nodes: usize,
}
impl<'a> Reader<'a> {
    fn take(&mut self, length: usize) -> Result<&'a [u8], String> {
        let end = self
            .position
            .checked_add(length)
            .filter(|end| *end <= self.bytes.len())
            .ok_or("REPORT_WIRE_TRUNCATED")?;
        let bytes = &self.bytes[self.position..end];
        self.position = end;
        Ok(bytes)
    }
    fn length(&mut self) -> Result<usize, String> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()) as usize)
    }
    fn text(&mut self) -> Result<&'a str, String> {
        let length = self.length()?;
        std::str::from_utf8(self.take(length)?).map_err(|_| "REPORT_WIRE_UTF8_INVALID".into())
    }
    fn value(&mut self, depth: usize) -> Result<Value, String> {
        self.nodes += 1;
        if self.nodes > LIMIT / 32 {
            return Err("REPORT_WIRE_NODE_LIMIT".into());
        }
        match self.take(1)?[0] {
            0 => Ok(Value::Null),
            1 => Ok(Value::Bool(false)),
            2 => Ok(Value::Bool(true)),
            3 => Ok(Value::Number(Number::from(i64::from_le_bytes(
                self.take(8)?.try_into().unwrap(),
            )))),
            4 => Ok(Value::Number(Number::from(u64::from_le_bytes(
                self.take(8)?.try_into().unwrap(),
            )))),
            5 => Number::from_f64(f64::from_le_bytes(self.take(8)?.try_into().unwrap()))
                .map(Value::Number)
                .ok_or("REPORT_WIRE_NONFINITE".into()),
            6 => Ok(Value::String(self.text()?.to_owned())),
            7 => {
                if depth >= 127 {
                    return Err("REPORT_WIRE_DEPTH_LIMIT".into());
                }
                let length = self.length()?;
                if length > self.bytes.len() - self.position || length > LIMIT / 32 - self.nodes {
                    return Err("REPORT_WIRE_LENGTH_INVALID".into());
                }
                let mut items = Vec::with_capacity(length);
                for _ in 0..length {
                    items.push(self.value(depth + 1)?);
                }
                Ok(Value::Array(items))
            }
            8 => {
                if depth >= 127 {
                    return Err("REPORT_WIRE_DEPTH_LIMIT".into());
                }
                let length = self.length()?;
                if length > (self.bytes.len() - self.position) / 5
                    || length > LIMIT / 32 - self.nodes
                {
                    return Err("REPORT_WIRE_LENGTH_INVALID".into());
                }
                // Length has passed frame/node bounds. Reserve common objects once,
                // but cap eager allocation for malformed or very large declarations.
                let mut items = Map::with_capacity(length.min(4096));
                for _ in 0..length {
                    let key = self.text()?.to_owned();
                    let value = self.value(depth + 1)?;
                    items.insert(key, value);
                }
                Ok(Value::Object(items))
            }
            9 => {
                let text = self.text()?;
                // Parsing the escape independently keeps serde_json's numeric conversion
                // and strictness. Count its container depth in the enclosing wire tree too.
                let value: Value = serde_json::from_str(text)
                    .map_err(|e| format!("REPORT_WIRE_JSON_INVALID: {e}"))?;
                fn fits(value: &Value, depth: usize) -> bool {
                    match value {
                        Value::Array(a) => depth < 127 && a.iter().all(|v| fits(v, depth + 1)),
                        Value::Object(o) => depth < 127 && o.values().all(|v| fits(v, depth + 1)),
                        _ => true,
                    }
                }
                if !fits(&value, depth) {
                    return Err("REPORT_WIRE_DEPTH_LIMIT".into());
                }
                Ok(value)
            }
            _ => Err("REPORT_WIRE_TAG_INVALID".into()),
        }
    }
}
pub fn decode(bytes: &[u8]) -> Result<Value, String> {
    if bytes.len() > LIMIT || !bytes.starts_with(b"ACVR\x01") {
        return Err("REPORT_WIRE_HEADER_INVALID".into());
    }
    let mut reader = Reader {
        bytes,
        position: 5,
        nodes: 0,
    };
    let value = reader.value(0)?;
    if reader.position != bytes.len() {
        return Err("REPORT_WIRE_TRAILING_BYTES".into());
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn wrapped(payload: &[u8]) -> Vec<u8> {
        let mut bytes = b"ACVR\x01".to_vec();
        bytes.extend_from_slice(payload);
        bytes
    }
    #[test]
    fn typed_scalars_preserve_integer_ranges_float_bits_and_utf8() {
        for number in [0., -0., f64::MIN_POSITIVE, f64::MAX, 1.2345678901234567] {
            let mut bytes = vec![5];
            bytes.extend_from_slice(&number.to_le_bytes());
            let value = decode(&wrapped(&bytes)).unwrap();
            assert!(value.as_number().unwrap().is_f64());
            assert_eq!(value.as_f64().unwrap().to_bits(), number.to_bits());
        }
        for (tag, bytes, expected) in [
            (3, i64::MIN.to_le_bytes(), Value::from(i64::MIN)),
            (4, u64::MAX.to_le_bytes(), Value::from(u64::MAX)),
        ] {
            let mut payload = vec![tag];
            payload.extend_from_slice(&bytes);
            assert_eq!(decode(&wrapped(&payload)).unwrap(), expected);
        }
        let text = "原始坐标\n\u{2028}😀";
        let mut payload = vec![6];
        payload.extend_from_slice(&(text.len() as u32).to_le_bytes());
        payload.extend_from_slice(text.as_bytes());
        assert_eq!(decode(&wrapped(&payload)).unwrap(), text);
        let mut bits = 2026111205u64;
        for _ in 0..20000 {
            bits = bits
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let number = f64::from_bits(bits);
            if !number.is_finite() {
                continue;
            }
            let mut payload = vec![5];
            payload.extend_from_slice(&number.to_le_bytes());
            let value = decode(&wrapped(&payload)).unwrap();
            assert_eq!(value.as_f64().unwrap().to_bits(), bits);
            let strict = serde_json::to_vec(&Value::from(number)).unwrap();
            let original: Value = serde_json::from_slice(&strict).unwrap();
            assert_eq!(
                serde_json::to_vec(&value).unwrap(),
                serde_json::to_vec(&original).unwrap()
            );
        }
    }
    #[test]
    fn object_capacity_preserves_order_duplicates_and_growth() {
        for length in [0usize, 2, 17, 4096, 4097] {
            let mut payload=vec![8];payload.extend_from_slice(&(length as u32).to_le_bytes());
            let mut expected=Map::new();
            for index in 0..length {
                let key=if index==1 { "key-0".to_owned() } else { format!("key-{index}") };
                payload.extend_from_slice(&(key.len() as u32).to_le_bytes());payload.extend_from_slice(key.as_bytes());
                payload.push(4);payload.extend_from_slice(&(index as u64).to_le_bytes());
                expected.insert(key,Value::from(index as u64));
            }
            let bytes=wrapped(&payload);
            assert_eq!(serde_json::to_vec(&decode(&bytes).unwrap()).unwrap(),serde_json::to_vec(&Value::Object(expected)).unwrap());
            if length>0 {assert!(decode(&bytes[..bytes.len()-1]).is_err());}
        }
    }

    #[test]
    fn malformed_frames_lengths_nonfinite_values_and_deep_escapes_are_rejected() {
        let valid = wrapped(&[7, 2, 0, 0, 0, 0, 2]);
        assert_eq!(decode(&valid).unwrap(), serde_json::json!([null, true]));
        for length in 0..valid.len() {
            assert!(decode(&valid[..length]).is_err());
        }
        let mut trailing = valid.clone();
        trailing.push(0);
        assert!(decode(&trailing).is_err());
        for payload in [
            vec![99],
            vec![7, 255, 255, 255, 255],
            vec![8, 255, 255, 255, 255],
            vec![6, 1, 0, 0, 0, 255],
        ] {
            assert!(decode(&wrapped(&payload)).is_err());
        }
        for number in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut bytes = vec![5];
            bytes.extend_from_slice(&number.to_le_bytes());
            assert!(decode(&wrapped(&bytes)).is_err());
        }
        for depth in [126, 127, 128] {
            let text = format!("{}null{}", "[".repeat(depth), "]".repeat(depth));
            let mut payload = vec![9];
            payload.extend_from_slice(&(text.len() as u32).to_le_bytes());
            payload.extend_from_slice(text.as_bytes());
            assert_eq!(
                decode(&wrapped(&payload)).is_ok(),
                serde_json::from_str::<Value>(&text).is_ok(),
                "depth {depth}"
            );
        }
    }
    #[test]
    #[ignore = "Explicit full Python-encoded report capture required"]
    fn captured_python_reports_match_complete_strict_json() {
        let directory = std::path::PathBuf::from(
            std::env::var_os("AGENTCV_REPORT_WIRE_FIXTURE").expect("fixture path required"),
        );
        let mut count = 0;
        let mut samples = Vec::new();
        for entry in std::fs::read_dir(&directory).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().and_then(|s| s.to_str()) != Some("wire") {
                continue;
            }
            let wire = std::fs::read(&path).unwrap();
            let json = std::fs::read(path.with_extension("json")).unwrap();
            let expected: Value = serde_json::from_slice(&json).unwrap();
            let expected_bytes = serde_json::to_vec(&expected).unwrap();
            let actual = decode(&wire).unwrap();
            assert_eq!(serde_json::to_vec(&actual).unwrap(), expected_bytes);
            count += 1;
            let mut pairs = Vec::new();
            for index in 0..48 {
                let mut pair = serde_json::json!({});
                for binary in if index % 2 == 0 {
                    [false, true]
                } else {
                    [true, false]
                } {
                    let start = std::time::Instant::now();
                    let value = if binary {
                        decode(&wire).unwrap()
                    } else {
                        serde_json::from_slice::<Value>(&json).unwrap()
                    };
                    let ms = start.elapsed().as_secs_f64() * 1000.;
                    assert_eq!(serde_json::to_vec(&value).unwrap(), expected_bytes);
                    pair[if binary { "wireMs" } else { "jsonMs" }] = Value::from(ms);
                }
                pairs.push(pair);
            }
            samples.push(serde_json::json!({"file":path.file_name().unwrap().to_string_lossy(),"wireBytes":wire.len(),"jsonBytes":json.len(),"samples":pairs}));
        }
        assert!(count >= 3);
        let report = serde_json::json!({"diagnosticOnly":true,"completeReports":count,"exactCanonicalBytes":true,"reports":samples});
        std::fs::write(
            directory.join("native-report-wire.json"),
            serde_json::to_vec_pretty(&report).unwrap(),
        )
        .unwrap();
    }
}
