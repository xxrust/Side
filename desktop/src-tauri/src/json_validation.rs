//! Consume the same serde_json value grammar without a Value tree.
//! Do not use IgnoredAny: its fast skipping does not perform the same numeric checks.
use serde::de::{self,Deserialize,Deserializer,Visitor,SeqAccess,MapAccess};
use std::fmt;
struct Checked;
impl<'de> Deserialize<'de> for Checked {
 fn deserialize<D:Deserializer<'de>>(deserializer:D)->Result<Self,D::Error>{deserializer.deserialize_any(CheckedVisitor)}
}
struct CheckedVisitor;
impl<'de> Visitor<'de> for CheckedVisitor {
 type Value=Checked;
 fn expecting(&self,f:&mut fmt::Formatter)->fmt::Result{f.write_str("a JSON value")}
 fn visit_unit<E:de::Error>(self)->Result<Checked,E>{Ok(Checked)}
 fn visit_bool<E:de::Error>(self,_:bool)->Result<Checked,E>{Ok(Checked)}
 fn visit_i64<E:de::Error>(self,_:i64)->Result<Checked,E>{Ok(Checked)}
 fn visit_u64<E:de::Error>(self,_:u64)->Result<Checked,E>{Ok(Checked)}
 fn visit_f64<E:de::Error>(self,value:f64)->Result<Checked,E>{if value.is_finite(){Ok(Checked)}else{Err(E::custom("non-finite JSON number"))}}
 fn visit_str<E:de::Error>(self,_:&str)->Result<Checked,E>{Ok(Checked)}
 fn visit_seq<A:SeqAccess<'de>>(self,mut seq:A)->Result<Checked,A::Error>{while seq.next_element::<Checked>()?.is_some(){} Ok(Checked)}
 fn visit_map<A:MapAccess<'de>>(self,mut map:A)->Result<Checked,A::Error>{while map.next_entry::<Checked,Checked>()?.is_some(){} Ok(Checked)}
}
pub fn validate(bytes:&[u8])->Result<(),serde_json::Error>{serde_json::from_slice::<Checked>(bytes).map(|_|())}
#[cfg(test)]
mod tests {
 use super::*;
 fn parity(raw:&[u8]){assert_eq!(validate(raw).is_ok(),serde_json::from_slice::<serde_json::Value>(raw).is_ok(),"input {:?}",String::from_utf8_lossy(raw));}
 #[test] fn scalar_string_and_container_boundaries(){
  for raw in ["null","true","false","0","-0","1.5","1e-9999","1e9999","18446744073709551616","-9223372036854775809","NaN","Infinity","[1,]","{\"a\":1,}","{\"a\":1,\"a\":2}","{\"__proto__\":{\"x\":1}}","{1:2}","\"\\ud800\"","\"\\udc00\"","\"\\ud800\\udc00\"","\"\\u0000\"","\"a\nb\"","[] true",""," ","01","1.","1e+","+1","[{},[null,true,1.1,\"中文😀\"]]"]{parity(raw.as_bytes());}
  for raw in [&b"\"\xff\""[..],&b"{\"\xff\":1}"[..],&b"\"\xc0\xaf\""[..],&b"\"\xed\xa0\x80\""[..],&b"\"a\x00b\""[..]]{parity(raw);}
 }
 #[test] fn depth_matches_value_parser(){for depth in 0..140{parity(format!("{}0{}","[".repeat(depth),"]".repeat(depth)).as_bytes());parity(format!("{}0{}","{\"x\":".repeat(depth),"}".repeat(depth)).as_bytes());}}
 #[test] fn exponent_and_integer_boundaries_match_value_parser(){
  for exponent in -400..=400{for mantissa in ["0","-0","1","-1","1.7976931348623157","2.2250738585072014","4.9406564584124654"]{parity(format!("{mantissa}e{exponent}").as_bytes());}}
  for digits in 1..=400{parity("9".repeat(digits).as_bytes());parity(format!("-{}","9".repeat(digits)).as_bytes());}
 }
 #[test] fn mutations_and_truncations_match_value_parser(){
  let base=br#"{"x":[1.234e-10,-0,18446744073709551615],"s":"a\u0041\n","nested":{"a":true,"b":null}}"#;
  for end in 0..=base.len(){parity(&base[..end]);}
  for i in 0..base.len(){for replacement in 0..=255u8{let mut raw=base.to_vec();raw[i]=replacement;parity(&raw);}}
 }
}
