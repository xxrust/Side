//! Deterministic Rust-native CV backend for the built-in typed operator graph.
//! Arbitrary programmable algorithms remain on the Python extension path.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::time::Instant;

fn object(value: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    value.as_object().ok_or_else(|| "Rust 原生算法請求必須是 JSON object".into())
}
fn gray_image(image: &Value) -> Result<(usize, usize, Vec<u8>), String> {
    let image = object(image)?;
    let width = image.get("width").and_then(Value::as_u64).ok_or("缺少影像寬度")? as usize;
    let height = image.get("height").and_then(Value::as_u64).ok_or("缺少影像高度")? as usize;
    if width == 0 || height == 0 || width.checked_mul(height).is_none() || width * height > 16_000_000 {
        return Err("Rust 原生算法影像尺寸無效或超過 1600 萬像素".into());
    }
    let gray = if image.get("grayEncoding").and_then(Value::as_str)==Some("base64-u8") {
        let encoded=image.get("grayBase64").and_then(Value::as_str).ok_or("Rust 原生算法缺少 grayBase64")?;
        STANDARD.decode(encoded).map_err(|_| "grayBase64 不是有效的 base64-u8 資料".to_string())?
    } else {
        let values = image.get("gray").and_then(Value::as_array).ok_or("Rust 原生算法需要 gray 像素")?;
        let mut gray = Vec::with_capacity(values.len());
        for value in values {
            let number = value.as_u64().ok_or("gray 像素必須是 0–255 整數")?;
            if number > 255 { return Err("gray 像素超出 0–255".into()); }
            gray.push(number as u8);
        }
        gray
    };
    if gray.len() != width * height { return Err("gray 像素數量與影像尺寸不一致".into()); }
    Ok((width, height, gray))
}
fn pixel_sha(width: usize, height: usize, gray: &[u8]) -> String {
    let header = format!("{width}x{height}:gray8:");
    let mut bytes = header.into_bytes(); bytes.extend_from_slice(gray);
    format!("{:x}", Sha256::digest(bytes))
}
fn rle(mask: &[u8]) -> Vec<Value> {
    let mut result = Vec::new(); let mut start: Option<usize> = None;
    for index in 0..=mask.len() {
        if index < mask.len() && mask[index] != 0 { if start.is_none() { start = Some(index); } }
        else if let Some(begin) = start.take() { result.push(json!(begin)); result.push(json!(index - begin)); }
    }
    result
}
fn boundary_points(mask: &[u8], width: usize, height: usize) -> Vec<(f64, f64)> {
    let mut points = Vec::new();
    for y in 0..height { for x in 0..width { let at=y*width+x; if mask[at]==0 { continue; } let edge=x==0||y==0||x+1==width||y+1==height||(x>0&&mask[at-1]==0)||(x+1<width&&mask[at+1]==0)||(y>0&&mask[at-width]==0)||(y+1<height&&mask[at+width]==0); if edge { points.push((x as f64+0.5,y as f64+0.5)); } } }
    points
}
fn solve3(mut matrix: [[f64;4];3]) -> Option<[f64;3]> {
    for pivot in 0..3 { let mut best=pivot; for row in pivot+1..3 { if matrix[row][pivot].abs()>matrix[best][pivot].abs(){best=row;} } if matrix[best][pivot].abs()<1e-9{return None;} matrix.swap(pivot,best); let div=matrix[pivot][pivot]; for col in pivot..4 {matrix[pivot][col]/=div;} for row in 0..3 {if row==pivot{continue;} let factor=matrix[row][pivot]; for col in pivot..4 {matrix[row][col]-=factor*matrix[pivot][col];}} }
    Some([matrix[0][3],matrix[1][3],matrix[2][3]])
}
fn fit_circle(points: &[(f64,f64)]) -> Option<Value> {
    if points.len()<3{return None;} let mut xx=0.;let mut xy=0.;let mut x=0.;let mut yy=0.;let mut y=0.;let mut n=0.;let mut bx=0.;let mut by=0.;let mut b=0.;
    for (px,py) in points {let q=px*px+py*py;xx+=px*px;xy+=px*py;x+=px;yy+=py*py;y+=py;n+=1.;bx+=px*q;by+=py*q;b+=q;}
    let matrix=[[xx,xy,x,bx],[xy,yy,y,by],[x,y,n,b]]; let solution=solve3(matrix)?; let cx=solution[0]/2.;let cy=solution[1]/2.;let radius_sq=solution[2]+cx*cx+cy*cy;if !radius_sq.is_finite()||radius_sq<=0.{return None;}let radius=radius_sq.sqrt();let residuals:Vec<f64>=points.iter().map(|(px,py)|((px-cx).powi(2)+(py-cy).powi(2)).sqrt()-radius).collect();let rms=(residuals.iter().map(|v|v*v).sum::<f64>()/residuals.len() as f64).sqrt();let max_abs=residuals.iter().map(|v|v.abs()).fold(0.,f64::max);let mut angles:Vec<f64>=points.iter().map(|(px,py)|(py-cy).atan2(px-cx).rem_euclid(std::f64::consts::TAU)).collect();angles.sort_by(|a,b|a.partial_cmp(b).unwrap());let max_gap=angles.windows(2).map(|w|w[1]-w[0]).chain(std::iter::once(angles[0]+std::f64::consts::TAU-angles[angles.len()-1])).fold(0.,f64::max);let coverage=(std::f64::consts::TAU-max_gap).to_degrees();Some(json!({"center":{"x":cx,"y":cy},"radius":radius,"diameter":radius*2.,"supportCount":points.len(),"rmsResidual":rms,"maxAbsResidual":max_abs,"angularCoverageDeg":coverage}))
}
fn node_op(node: &Value) -> Result<&str, String> { object(node)?.get("op").and_then(Value::as_str).ok_or("Rust 原生節點缺少 op".into()) }

pub fn execute(request: Value) -> Result<Value, String> {
    let root = object(&request)?;
    let plan = root.get("plan").ok_or("Rust 原生算法缺少 plan")?;
    let plan_object = object(plan)?;
    let nodes = plan_object.get("nodes").and_then(Value::as_array).ok_or("Rust 原生算法 plan 缺少 nodes")?;
    if nodes.is_empty() { return Err("Rust 原生算法 plan 不可為空".into()); }
    for node in nodes { let op = node_op(node)?; if !matches!(op, "image.grayscale" | "segment.otsu" | "regions.components" | "topology.holes" | "geometry.annulus" | "geometry.two_boundary" | "rules.evaluate") { return Err("此方案含尚未移植到 Rust 的內建算子".into()); } }
    let (width, height, gray) = gray_image(root.get("image").ok_or("Rust 原生算法缺少 image")?)?;
    let started = Instant::now();
    let plan_id = plan_object.get("id").cloned().unwrap_or(Value::Null);
    let revision = plan_object.get("revision").cloned().unwrap_or(Value::Null);
    let plan_fingerprint = root.get("planFingerprint").cloned().unwrap_or(Value::Null);
    let input_identity = root.get("inputIdentity").cloned().unwrap_or(Value::Null);
    let pixel_fingerprint = root.get("pixelFingerprint").cloned().unwrap_or(Value::Null);
    let image_sha = pixel_sha(width, height, &gray);
    let source_sha = object(root.get("image").ok_or("Rust 原生算法缺少 image")?)?.get("sha256").cloned().unwrap_or(Value::Null);
    let run_id = format!("rust-{}", uuid_like(&image_sha, started.elapsed().as_nanos()));
    let mut traces = Vec::new(); let mut artifacts = Vec::new(); let mut measurements = serde_json::Map::new();
    let mut threshold: Option<u8> = None; let mut current_mask: Option<Vec<u8>> = None; let mut classification = json!({"status":"UNKNOWN","reason":"SPEC_MISSING","rules":[]});
    for node in nodes {
        let node_id = object(node)?.get("id").cloned().unwrap_or(Value::Null);
        let op = node_op(node)?; let node_started = Instant::now(); let mut node_artifacts = Vec::new();
        let params = object(node)?.get("params").cloned().unwrap_or_else(|| json!({}));
        let parameter_sources = object(node)?.get("parameterSources").cloned().unwrap_or_else(|| json!({}));
        let output_summary;
        match op {
            "image.grayscale" => {
                node_artifacts.push(json!({"id":"grayscale-image","type":"image","source":"sourceImage","colorMode":"grayscale","width":width,"height":height,"backend":"rust-native"}));
                node_artifacts.push(json!({"id":"grayscale-conversion","type":"evidence","data":{"executionMode":"pass-through","backend":"rust-native","formula":"provided gray8 pixels"}}));
                output_summary = json!({"width":width,"height":height,"fullResolution":true,"colorMode":"grayscale","executionMode":"pass-through","backend":"rust-native"});
            }
            "segment.otsu" => {
                let mut histogram = vec![0u64; 256]; for value in &gray { histogram[*value as usize] += 1; }
                let mut total = 0f64; for (value, count) in histogram.iter().enumerate() { total += value as f64 * *count as f64; }
                let mut lower_count = 0f64; let mut lower_sum = 0f64; let mut best = -1f64; let mut best_threshold = 0u8;
                for value in 0..256 { lower_count += histogram[value] as f64; lower_sum += value as f64 * histogram[value] as f64; let upper = gray.len() as f64 - lower_count; if lower_count <= 0.0 || upper <= 0.0 { continue; } let mean_difference = lower_sum / lower_count - (total - lower_sum) / upper; let score = lower_count * upper * mean_difference * mean_difference; if score > best { best = score; best_threshold = value as u8; } }
                let configured = object(&params)?.get("threshold").and_then(Value::as_u64).map(|v| v.min(255) as u8); let selected = configured.unwrap_or(best_threshold); threshold = Some(selected);
                let polarity = object(&params)?.get("polarity").and_then(Value::as_str).unwrap_or("auto");
                let mut border_dark = 0usize; let mut border_count = 0usize;
                for x in 0..width { border_dark += usize::from(gray[x] <= selected); border_count += 1; if height > 1 { border_dark += usize::from(gray[(height - 1) * width + x] <= selected); border_count += 1; } }
                for y in 1..height.saturating_sub(1) { border_dark += usize::from(gray[y * width] <= selected); border_count += 1; if width > 1 { border_dark += usize::from(gray[y * width + width - 1] <= selected); border_count += 1; } }
                let border_ratio = if border_count == 0 { 0.0 } else { border_dark as f64 / border_count as f64 };
                let resolved = if polarity == "auto" { if (border_ratio - 0.5).abs() < 0.05 { "ambiguous" } else if border_ratio > 0.5 { "bright" } else { "dark" } } else { polarity };
                if resolved == "ambiguous" { return Err("Rust Otsu 無法自動判定前景極性；請明確指定 polarity".into()); }
                let mut mask = vec![0u8; gray.len()]; let mut foreground = 0usize;
                for (index, value) in gray.iter().enumerate() { let foreground_pixel = if resolved == "bright" { *value > selected } else { *value <= selected }; mask[index] = u8::from(foreground_pixel); foreground += usize::from(mask[index]); }
                let histogram_values: Vec<Value> = histogram.iter().map(|v| json!(v)).collect();
                node_artifacts.push(json!({"id":"otsu-histogram","type":"histogram","values":histogram_values,"threshold":selected,"backend":"rust-native"}));
                node_artifacts.push(json!({"id":"otsu-polarity","type":"evidence","data":{"threshold":selected,"borderDarkRatio":border_ratio,"configuredPolarity":polarity,"polarity":resolved,"backend":"rust-native"}}));
                node_artifacts.push(json!({"id":"segmented-mask","type":"mask","width":width,"height":height,"encoding":"rle","runs":rle(&mask),"foregroundValue":1,"backend":"rust-native"}));
                output_summary = json!({"width":width,"height":height,"threshold":selected,"polarity":resolved,"borderDarkRatio":border_ratio,"foregroundPixels":foreground,"fullResolution":true,"backend":"rust-native"});
                current_mask = Some(mask);
            }
            "regions.components" => {
                let mask = current_mask.clone().ok_or("Rust 元件選擇需要先執行 segment.otsu")?;
                let params_object = object(&params)?; let min_area = params_object.get("minArea").and_then(Value::as_u64).unwrap_or(12) as usize;
                let exclude_boundary = params_object.get("excludeBoundary").and_then(Value::as_bool).unwrap_or(true);
                let selection = params_object.get("selection").and_then(Value::as_str).unwrap_or("unique");
                let requested_id = params_object.get("componentId").and_then(Value::as_u64).map(|v| v as usize);
                let mut labels = vec![0usize; mask.len()]; let mut candidates = Vec::new(); let mut label = 0usize;
                for start in 0..mask.len() {
                    if mask[start] == 0 || labels[start] != 0 { continue; }
                    label += 1; let mut queue = vec![start]; labels[start] = label; let mut area = 0usize; let mut sum_x = 0f64; let mut sum_y = 0f64;
                    let mut min_x = width; let mut min_y = height; let mut max_x = 0usize; let mut max_y = 0usize; let mut touches = false;
                    let mut head = 0usize;
                    while head < queue.len() {
                        let at = queue[head]; head += 1; let x = at % width; let y = at / width; area += 1; sum_x += x as f64 + 0.5; sum_y += y as f64 + 0.5;
                        min_x = min_x.min(x); min_y = min_y.min(y); max_x = max_x.max(x); max_y = max_y.max(y); touches |= x == 0 || y == 0 || x + 1 == width || y + 1 == height;
                        for dy in -1i32..=1 { for dx in -1i32..=1 { if dx == 0 && dy == 0 { continue; } let nx = x as i32 + dx; let ny = y as i32 + dy; if nx < 0 || ny < 0 || nx >= width as i32 || ny >= height as i32 { continue; } let next = ny as usize * width + nx as usize; if mask[next] != 0 && labels[next] == 0 { labels[next] = label; queue.push(next); } } }
                    }
                    let eligible = area >= min_area && (!exclude_boundary || !touches);
                    candidates.push(json!({"id":label,"area":area,"bounds":{"x":min_x,"y":min_y,"width":max_x-min_x+1,"height":max_y-min_y+1},"centroid":{"x":sum_x/area as f64,"y":sum_y/area as f64},"touchesBorder":touches,"eligible":eligible,"selectionStatus":if eligible {"eligible-unselected"} else {"rejected"}}));
                }
                let eligible_ids: Vec<usize> = candidates.iter().filter(|candidate| candidate["eligible"].as_bool()==Some(true)).filter_map(|candidate| candidate["id"].as_u64().map(|id| id as usize)).collect();
                let selected = match selection {
                    "largest" => eligible_ids.iter().copied().max_by_key(|id| candidates.iter().find(|candidate| candidate["id"].as_u64()==Some(*id as u64)).and_then(|candidate| candidate["area"].as_u64()).unwrap_or(0)),
                    "component" => requested_id.filter(|id| eligible_ids.contains(id)),
                    _ if eligible_ids.len() == 1 => eligible_ids.first().copied(),
                    _ => None,
                }.ok_or_else(|| if eligible_ids.is_empty() { "Rust 找不到符合面積與邊界條件的前景物件".to_string() } else { format!("Rust 找到 {} 個前景候選，需明確選擇物件", eligible_ids.len()) })?;
                let selected_mask: Vec<u8> = labels.iter().map(|id| u8::from(*id == selected)).collect();
                let candidates_data: Vec<Value> = candidates.into_iter().map(|mut candidate| { if candidate["id"].as_u64()==Some(selected as u64) { candidate["selectionStatus"] = json!("selected"); } candidate }).collect();
                let candidate_count = candidates_data.len();
                let evidence = json!({"candidateCount":candidate_count,"eligibleCount":eligible_ids.len(),"selection":selection,"requestedComponentId":requested_id,"selectedComponentId":selected,"connectivity":{"foreground":8,"background":4},"candidates":candidates_data});
                node_artifacts.push(json!({"id":"component-candidates","type":"evidence","data":evidence,"backend":"rust-native"}));
                node_artifacts.push(json!({"id":"selected-region","type":"mask","width":width,"height":height,"encoding":"rle","runs":rle(&selected_mask),"foregroundValue":1,"backend":"rust-native"}));
                output_summary = json!({"candidateCount":candidate_count,"eligibleCount":eligible_ids.len(),"selectedComponentId":selected,"selection":selection,"fullResolution":true,"backend":"rust-native"});
                current_mask = Some(selected_mask);
            }
            "topology.holes" => {
                let mask = current_mask.clone().ok_or("Rust 孔洞拓樸需要先取得選中區域")?;
                let params_object = object(&params)?; let min_area = params_object.get("minHoleArea").and_then(Value::as_u64).unwrap_or(0) as usize;
                let tolerance = params_object.get("positionTolerancePx").and_then(Value::as_f64).unwrap_or(3.0); if !tolerance.is_finite() || tolerance <= 0.0 { return Err("Rust 孔洞位置容差必須為正數".into()); }
                let mut exterior = vec![0u8; mask.len()]; let mut queue = Vec::new();
                let enqueue = |at: usize, exterior: &mut Vec<u8>, queue: &mut Vec<usize>| { if mask[at] == 0 && exterior[at] == 0 { exterior[at] = 1; queue.push(at); } };
                for x in 0..width { enqueue(x, &mut exterior, &mut queue); if height > 1 { enqueue((height-1)*width+x, &mut exterior, &mut queue); } }
                for y in 0..height { enqueue(y*width, &mut exterior, &mut queue); if width > 1 { enqueue(y*width+width-1, &mut exterior, &mut queue); } }
                let mut head = 0usize; while head < queue.len() { let at=queue[head]; head+=1; let x=at%width; let y=at/width; if x>0 { enqueue(at-1,&mut exterior,&mut queue); } if x+1<width { enqueue(at+1,&mut exterior,&mut queue); } if y>0 { enqueue(at-width,&mut exterior,&mut queue); } if y+1<height { enqueue(at+width,&mut exterior,&mut queue); } }
                let mut seen = vec![0u8; mask.len()]; let mut holes = Vec::new();
                for start in 0..mask.len() { if mask[start] != 0 || exterior[start] != 0 || seen[start] != 0 { continue; } let mut region = vec![start]; seen[start]=1; let mut h=0usize; let mut sx=0f64; let mut sy=0f64; let mut head=0usize;
                    while head<region.len() { let at=region[head]; head+=1; let x=at%width; let y=at/width; h+=1; sx+=x as f64+0.5; sy+=y as f64+0.5; if x>0 { let n=at-1; if mask[n]==0&&exterior[n]==0&&seen[n]==0 {seen[n]=1;region.push(n);} } if x+1<width { let n=at+1; if mask[n]==0&&exterior[n]==0&&seen[n]==0 {seen[n]=1;region.push(n);} } if y>0 { let n=at-width; if mask[n]==0&&exterior[n]==0&&seen[n]==0 {seen[n]=1;region.push(n);} } if y+1<height { let n=at+width; if mask[n]==0&&exterior[n]==0&&seen[n]==0 {seen[n]=1;region.push(n);} } }
                    if h>=min_area { holes.push(json!({"id":format!("hole-{}", holes.len()+1),"area":h,"center":{"x":sx/h as f64,"y":sy/h as f64},"centerSource":"Centroid of enclosed background pixels."})); }
                }
                let expected = params_object.get("expectedPositions").and_then(Value::as_array); let mut comparisons=Vec::new(); let mut matched=0usize; let mut missing=0usize; let mut open=0usize;
                if let Some(expected) = expected { for (index, site) in expected.iter().enumerate() { let site_object=object(site)?; let x=site_object.get("x").and_then(Value::as_f64).ok_or("expectedPositions 缺少 x")?; let y=site_object.get("y").and_then(Value::as_f64).ok_or("expectedPositions 缺少 y")?; let mut best: Option<(usize,f64)>=None; for (hole_index,hole) in holes.iter().enumerate() { let center=&hole["center"]; let dx=center["x"].as_f64().unwrap_or(0.0)-x; let dy=center["y"].as_f64().unwrap_or(0.0)-y; let distance=(dx*dx+dy*dy).sqrt(); if distance<=tolerance&&best.map(|(_,prior)|distance<prior).unwrap_or(true){best=Some((hole_index,distance));} } let id=site_object.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(||format!("expected-{}",index+1)); if let Some((hole_index,distance))=best { matched+=1; comparisons.push(json!({"expectedId":id,"expected":site,"status":"CLOSED","holeId":holes[hole_index]["id"],"measuredCenter":holes[hole_index]["center"],"distancePx":distance})); } else { let ix=x.floor() as isize; let iy=y.floor() as isize; let in_image=ix>=0&&iy>=0&&(ix as usize)<width&&(iy as usize)<height; let status=if !in_image {"UNKNOWN"} else { let at=iy as usize*width+ix as usize; if mask[at]!=0 {missing+=1;"MISSING"} else if exterior[at]!=0 {open+=1;"OPEN_TO_EXTERIOR"} else {"UNKNOWN"} }; comparisons.push(json!({"expectedId":id,"expected":site,"status":status})); } } }
                let closed_count=holes.len(); measurements.insert("closedHoleCount".into(),json!(closed_count)); if expected.is_some(){measurements.insert("matchedHoleCount".into(),json!(matched));measurements.insert("missingHoleCount".into(),json!(missing));measurements.insert("openHoleCount".into(),json!(open));}
                let evidence=json!({"holes":holes,"expectedPositionComparisons":comparisons,"connectivity":4,"minHoleArea":min_area,"backend":"rust-native"}); node_artifacts.push(json!({"id":"feature-evidence","type":"evidence","data":evidence,"backend":"rust-native"}));
                output_summary=json!({"closedHoleCount":closed_count,"matchedHoleCount":matched,"missingHoleCount":missing,"openHoleCount":open,"fullResolution":true,"backend":"rust-native"});
            }
            "geometry.two_boundary" => {
                let request=json!({"width":width,"height":height,"grayEncoding":"base64-u8","grayBase64":STANDARD.encode(&gray),"seedLevel":params["seedLevel"].as_u64().unwrap_or(65),"externalLevel":params["externalLevel"].as_f64().unwrap_or(80.0),"widthPrior":params["widthPrior"].as_f64().unwrap_or(width as f64),"heightPrior":params["heightPrior"].as_f64().unwrap_or(height as f64),"pkgWidth":params["pkgWidth"].as_f64().unwrap_or(params["widthPrior"].as_f64().unwrap_or(width as f64)),"pkgHeight":params["pkgHeight"].as_f64().unwrap_or(params["heightPrior"].as_f64().unwrap_or(height as f64)),"widthTolerance":params["widthTolerance"].as_f64().unwrap_or(10.0),"heightTolerance":params["heightTolerance"].as_f64().unwrap_or(12.0),"minSeparationPx":params["minSeparationPx"].as_f64().unwrap_or(4.0),"pixelTolerancePx":params["pixelTolerancePx"].as_f64().unwrap_or(4.0),"cornerRadius":params["cornerRadius"].as_f64().unwrap_or(65.0),"scoreDeltas":params["scoreDeltas"].clone(),"toleranceTrialsPx":params["toleranceTrialsPx"].clone()}); let analysis=crate::two_boundary::execute(request)?; let search=analysis["search"].clone(); let geometry=search["geometry"].clone(); let status=geometry["status"].as_str().unwrap_or("UNKNOWN"); let min_clearance=geometry["minClearancePx"].as_f64(); if let Some(value)=min_clearance{measurements.insert("minClearancePx".into(),json!(value));} measurements.insert("pkgAnchorValid".into(),geometry["anchorValid"].clone()); node_artifacts.push(json!({"id":"feature-evidence","type":"evidence","data":analysis,"backend":"rust-native"})); node_artifacts.push(json!({"id":"feature-overlay","type":"image","dataURL":crate::two_boundary::overlay_svg(width,height,&search["refinedEdges"],&search["pkgReconstruction"]["edges"]),"width":width,"height":height,"mime":"image/svg+xml","backend":"rust-native"})); node_artifacts.push(json!({"id":"feature-curves","type":"curves","data":{"radiusTrials":search["radiusTrials"],"decisionTrials":search["decisionTrials"],"backend":"rust-native"},"backend":"rust-native"})); node_artifacts.push(json!({"id":"feature-contours","type":"contours","data":{"refinedEdges":search["refinedEdges"],"exteriorEdges":search["exteriorEdges"],"pkgReconstruction":search["pkgReconstruction"],"backend":"rust-native"},"backend":"rust-native"})); node_artifacts.push(json!({"id":"feature-points","type":"points","data":{"edgeCandidates":search["edgeCandidates"],"jointCandidates":search["jointCandidates"],"backend":"rust-native"},"backend":"rust-native"})); node_artifacts.push(json!({"id":"feature-circles","type":"circles","data":{"lidPose":geometry["lidPose"],"backend":"rust-native"},"backend":"rust-native"})); output_summary=json!({"status":status,"featureStatus":if status=="GOOD"{"MEASURED"}else{"UNKNOWN"},"measurements":{"minClearancePx":geometry["minClearancePx"],"pkgAnchorValid":geometry["anchorValid"]},"backend":"rust-native"});
            }
            "geometry.annulus" => {
                let mask=current_mask.clone().ok_or("Rust 圓環幾何需要先取得選中區域")?; let params_object=object(&params)?; let max_relative=params_object.get("maxRelativeResidual").and_then(Value::as_f64).unwrap_or(0.025); let max_residual=params_object.get("maxResidualPx").and_then(Value::as_f64).unwrap_or(1.0); let min_coverage=params_object.get("minAngularCoverageDeg").and_then(Value::as_f64).unwrap_or(300.0); if !(max_relative>0.&&max_relative<0.5&&max_residual>0.&&min_coverage>0.&&min_coverage<=360.){return Err("Rust 圓環擬合品質參數無效".into());}
                let mut exterior=vec![0u8;mask.len()];let mut queue=Vec::new();let enqueue=|at:usize,exterior:&mut Vec<u8>,queue:&mut Vec<usize>|{if mask[at]==0&&exterior[at]==0{exterior[at]=1;queue.push(at);}};for x in 0..width{enqueue(x,&mut exterior,&mut queue);if height>1{enqueue((height-1)*width+x,&mut exterior,&mut queue);}}for y in 0..height{enqueue(y*width,&mut exterior,&mut queue);if width>1{enqueue(y*width+width-1,&mut exterior,&mut queue);}}let mut head=0;while head<queue.len(){let at=queue[head];head+=1;let x=at%width;let y=at/width;if x>0{enqueue(at-1,&mut exterior,&mut queue);}if x+1<width{enqueue(at+1,&mut exterior,&mut queue);}if y>0{enqueue(at-width,&mut exterior,&mut queue);}if y+1<height{enqueue(at+width,&mut exterior,&mut queue);}}
                let mut outer_points=Vec::new(); for y in 0..height { for x in 0..width { let at=y*width+x; if mask[at]==0 { continue; } let touches_exterior=x==0||y==0||x+1==width||y+1==height||(x>0&&exterior[at-1]!=0)||(x+1<width&&exterior[at+1]!=0)||(y>0&&exterior[at-width]!=0)||(y+1<height&&exterior[at+width]!=0); if touches_exterior { outer_points.push((x as f64+0.5,y as f64+0.5)); } } }
                let outer=fit_circle(&outer_points).ok_or("Rust 圓環缺少有效外邊界")?;
                let mut seen=vec![0u8;mask.len()];let mut hole_masks=Vec::new();for start in 0..mask.len(){if mask[start]!=0||exterior[start]!=0||seen[start]!=0{continue;}let mut cells=vec![start];seen[start]=1;let mut h=0;let mut q=0;while q<cells.len(){let at=cells[q];q+=1;h+=1;let x=at%width;let y=at/width;if x>0{let n=at-1;if mask[n]==0&&exterior[n]==0&&seen[n]==0{seen[n]=1;cells.push(n);}}if x+1<width{let n=at+1;if mask[n]==0&&exterior[n]==0&&seen[n]==0{seen[n]=1;cells.push(n);}}if y>0{let n=at-width;if mask[n]==0&&exterior[n]==0&&seen[n]==0{seen[n]=1;cells.push(n);}}if y+1<height{let n=at+width;if mask[n]==0&&exterior[n]==0&&seen[n]==0{seen[n]=1;cells.push(n);}}}if h>0{let mut hole=vec![0u8;mask.len()];for at in cells{hole[at]=1;}hole_masks.push(hole);}}
                let inner=if hole_masks.len()==1{let points=boundary_points(&hole_masks[0],width,height);fit_circle(&points)}else{None};let quality=|circle:&Value|{let radius=circle["radius"].as_f64().unwrap_or(0.);let rms=circle["rmsResidual"].as_f64().unwrap_or(f64::INFINITY);let max_abs=circle["maxAbsResidual"].as_f64().unwrap_or(f64::INFINITY);let support=circle["supportCount"].as_u64().unwrap_or(0);let coverage=circle["angularCoverageDeg"].as_f64().unwrap_or(0.);let allowance=max_residual.max(radius*max_relative);let accepted=radius>=1.&&support>=8&&coverage>=min_coverage&&rms<=allowance&&max_abs<=allowance*3.;json!({"accepted":accepted,"rmsAllowancePx":allowance,"maxAbsAllowancePx":allowance*3.,"supportCount":support,"angularCoverageDeg":coverage})};let outer_quality=quality(&outer);let inner_value=inner.clone().unwrap_or(Value::Null);let inner_quality=if inner.is_some(){quality(&inner_value)}else{json!({"accepted":false,"reason":"An annulus requires exactly one enclosed hole."})};let outer_center=&outer["center"];let inner_center=inner.as_ref().map(|v|&v["center"]);let center_distance=inner_center.map(|center|{let dx=center["x"].as_f64().unwrap_or(0.)-outer_center["x"].as_f64().unwrap_or(0.);let dy=center["y"].as_f64().unwrap_or(0.)-outer_center["y"].as_f64().unwrap_or(0.);(dx*dx+dy*dy).sqrt()});let contained=inner.as_ref().map(|v|center_distance.unwrap_or(f64::INFINITY)+v["radius"].as_f64().unwrap_or(f64::INFINITY)<outer["radius"].as_f64().unwrap_or(0.)).unwrap_or(false);let measured=outer_quality["accepted"]==true&&inner_quality["accepted"]==true&&contained;measurements.insert("closedHoleCount".into(),json!(hole_masks.len()));if let Some(inner)=inner.as_ref(){measurements.insert("outerDiameter".into(),outer["diameter"].clone());measurements.insert("innerDiameter".into(),inner["diameter"].clone());measurements.insert("centerDistance".into(),json!(center_distance));measurements.insert("centerOffset".into(),json!({"x":inner["center"]["x"].as_f64().unwrap_or(0.)-outer_center["x"].as_f64().unwrap_or(0.),"y":inner["center"]["y"].as_f64().unwrap_or(0.)-outer_center["y"].as_f64().unwrap_or(0.)}));}let evidence=json!({"outerCircle":outer.clone(),"innerCircle":inner_value.clone(),"outerQuality":outer_quality,"innerQuality":inner_quality,"contained":contained,"backend":"rust-native"});node_artifacts.push(json!({"id":"feature-circles","type":"circles","data":evidence,"backend":"rust-native"}));node_artifacts.push(json!({"id":"feature-evidence","type":"evidence","data":evidence,"backend":"rust-native"}));output_summary=json!({"status":if measured{"MEASURED"}else{"UNKNOWN"},"closedHoleCount":hole_masks.len(),"outerCircle":outer,"innerCircle":inner_value,"backend":"rust-native"});if !measured{return Err("Rust 圓環外圓或內孔未通過擬合品質閘值".into());}
            }
            "rules.evaluate" => {
                let params_object=object(&params)?; let rules=params_object.get("rules").and_then(Value::as_array).cloned().unwrap_or_default(); let mut evaluated=Vec::new();
                for rule in &rules { let rule_object=object(rule)?; let measurement=rule_object.get("measurement").and_then(Value::as_str).ok_or("Rust 規則缺少 measurement")?; let actual=measurements.get(measurement).cloned(); let status=if actual.is_none(){"UNKNOWN"}else{let value=actual.as_ref().and_then(Value::as_f64);if let Some(expected)=rule_object.get("equals"){if actual.as_ref()==Some(expected){"PASS"}else{"FAIL"}}else if let Some(value)=value{let min_ok=rule_object.get("min").and_then(Value::as_f64).map(|min|value>=min).unwrap_or(true);let max_ok=rule_object.get("max").and_then(Value::as_f64).map(|max|value<=max).unwrap_or(true);if min_ok&&max_ok{"PASS"}else{"FAIL"}}else{"UNKNOWN"}}; evaluated.push(json!({"id":rule_object.get("id"),"measurement":measurement,"actual":actual,"status":status,"reason":if status=="UNKNOWN"{"MEASUREMENT_MISSING"}else{"SUPPLIED_RULE_EVALUATED"}})); }
                let overall=if evaluated.iter().any(|row|row["status"]=="UNKNOWN"){("UNKNOWN","MEASUREMENT_MISSING")}else if evaluated.iter().all(|row|row["status"]=="PASS"){("PASS","ALL_SUPPLIED_RULES_PASS")}else{("FAIL","SUPPLIED_RULE_FAILED")}; classification=json!({"status":overall.0,"reason":overall.1,"rules":evaluated}); node_artifacts.push(json!({"id":"rule-evaluation","type":"evidence","data":{"rules":classification["rules"],"backend":"rust-native"},"backend":"rust-native"})); output_summary=json!({"status":overall.0,"ruleCount":rules.len(),"backend":"rust-native"});
            }
            _ => unreachable!(),
        }
        for artifact in node_artifacts.iter_mut() { if let Some(map) = artifact.as_object_mut() { let local = map.get("id").cloned().unwrap_or(Value::Null); map.insert("id".into(), json!(format!("{}:{}", node_id.as_str().unwrap_or("node"), local.as_str().unwrap_or("artifact")))); map.insert("nodeId".into(), node_id.clone()); map.insert("runId".into(), json!(run_id)); } }
        artifacts.extend(node_artifacts.clone()); traces.push(json!({"id":node_id,"op":op,"version":object(node)?.get("version").cloned().unwrap_or(json!(1)),"inputs":object(node)?.get("inputs").cloned().unwrap_or_else(||json!({})),"status":"OK","durationMs":node_started.elapsed().as_secs_f64()*1000.0,"parameters":params,"parameterSources":parameter_sources,"artifacts":node_artifacts,"outputSummary":output_summary,"backend":"rust-native"}));
    }
    if let Some(value) = threshold { measurements.insert("threshold".into(), json!(value)); }
    Ok(json!({"schema":"agentcv-pipeline-result-1","pipelineId":plan_id,"pipelineRevision":revision,"planFingerprint":plan_fingerprint,"runId":run_id,"startedAt":chrono_like_now(),"completedAt":chrono_like_now(),"status":"OK","inputIdentity":input_identity,"image":{"width":width,"height":height,"sha256":image_sha,"sourceSha256":source_sha,"pixelFingerprint":pixel_fingerprint},"measurements":measurements,"classification":classification,"nodes":traces,"artifacts":artifacts,"limitations":["Rust-native backend currently covers grayscale, Otsu, connected components, hole topology, annulus geometry and supplied rule evaluation."],"deliveryAudit":{"status":"DIAGNOSTIC_ONLY","delivered":false,"backend":"rust-native"},"backend":"rust-native","durationMs":started.elapsed().as_secs_f64()*1000.0}))
}
fn uuid_like(hash: &str, suffix: u128) -> String { format!("{}-{:x}", &hash[..hash.len().min(16)], suffix) }
fn chrono_like_now() -> String { format!("rust+{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rust_native_grayscale_and_otsu_return_verified_mask() {
        let gray: Vec<Value> = [0u8, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255].into_iter().map(|v| json!(v)).collect();
        let request = json!({
            "image":{"width":4,"height":3,"gray":gray,"sha256":"source"},
            "plan":{"id":"native","revision":1,"nodes":[
                {"id":"gray","op":"image.grayscale","version":1,"inputs":{"image":"$image"},"params":{}},
                {"id":"segment","op":"segment.otsu","version":1,"inputs":{"image":"gray.image"},"params":{"polarity":"bright"}},
                {"id":"components","op":"regions.components","version":1,"inputs":{"binary":"segment.binary"},"params":{"selection":"largest","minArea":1,"excludeBoundary":false}},
                {"id":"holes","op":"topology.holes","version":1,"inputs":{"region":"components.region"},"params":{"minHoleArea":1,"positionTolerancePx":3}},
                {"id":"rules","op":"rules.evaluate","version":1,"inputs":{"analysis":"holes.analysis"},"params":{"rules":[{"id":"holes-zero","measurement":"closedHoleCount","equals":0}]}}
            ]},"planFingerprint":"plan","pixelFingerprint":"pixels","inputIdentity":{"imageId":"one"}
        });
        let result = execute(request).unwrap();
        assert_eq!(result["backend"], "rust-native");
        assert_eq!(result["nodes"].as_array().unwrap().len(), 5);
        assert!(result["artifacts"].as_array().unwrap().iter().any(|artifact| artifact["id"] == "segment:segmented-mask"));
        assert!(result["artifacts"].as_array().unwrap().iter().find(|artifact| artifact["id"] == "segment:segmented-mask").unwrap()["runs"].as_array().unwrap().len() > 0);
        assert!(result["artifacts"].as_array().unwrap().iter().any(|artifact| artifact["id"] == "components:selected-region"));
        assert!(result["artifacts"].as_array().unwrap().iter().any(|artifact| artifact["id"] == "holes:feature-evidence"));
        assert_eq!(result["classification"]["status"], "PASS");
    }

    #[test]
    fn rust_native_accepts_compact_base64_gray8_transport() {
        let request = json!({
            "image":{"width":4,"height":1,"grayEncoding":"base64-u8","grayBase64":"AP8A/w=="},
            "plan":{"id":"compact","revision":1,"nodes":[
                {"id":"gray","op":"image.grayscale","version":1,"inputs":{"image":"$image"},"params":{}}
            ]}
        });
        let result = execute(request).unwrap();
        assert_eq!(result["image"]["width"], 4);
        assert_eq!(result["image"]["height"], 1);
        assert_eq!(result["backend"], "rust-native");
    }

    #[test]
    fn rust_native_annulus_returns_two_circle_measurement() {
        let width = 17usize;
        let height = 17usize;
        let mut gray = Vec::with_capacity(width * height);
        for y in 0..height {
            for x in 0..width {
                let dx = x as i32 - 8;
                let dy = y as i32 - 8;
                let d2 = dx * dx + dy * dy;
                gray.push(json!(if (20..=49).contains(&d2) { 255 } else { 0 }));
            }
        }
        let request = json!({
            "image":{"width":width,"height":height,"gray":gray},
            "plan":{"id":"annulus","revision":1,"nodes":[
                {"id":"gray","op":"image.grayscale","version":1,"inputs":{"image":"$image"},"params":{}},
                {"id":"segment","op":"segment.otsu","version":1,"inputs":{"image":"gray.image"},"params":{"polarity":"bright"}},
                {"id":"components","op":"regions.components","version":1,"inputs":{"binary":"segment.binary"},"params":{"selection":"largest","minArea":1,"excludeBoundary":false}},
                {"id":"annulus","op":"geometry.annulus","version":1,"inputs":{"region":"components.region"},"params":{"maxRelativeResidual":0.25,"maxResidualPx":2,"minAngularCoverageDeg":200}}
            ]}
        });
        let result = execute(request).unwrap();
        assert_eq!(result["backend"], "rust-native");
        assert_eq!(result["nodes"].as_array().unwrap().len(), 4);
        assert_eq!(result["nodes"][3]["outputSummary"]["status"], "MEASURED");
        assert!(result["measurements"]["outerDiameter"].as_f64().unwrap() > result["measurements"]["innerDiameter"].as_f64().unwrap());
        assert!(result["artifacts"].as_array().unwrap().iter().any(|artifact| artifact["id"] == "annulus:feature-circles"));
    }

    #[test]
    fn rust_native_two_boundary_pipeline_returns_search_and_decision_artifacts() {
        let width = 64usize; let height = 48usize; let mut gray = Vec::with_capacity(width * height);
        for y in 0..height { for x in 0..width { gray.push(json!(if (10..38).contains(&y) && (12..52).contains(&x) { 220 } else { 0 })); } }
        let request = json!({
            "image":{"width":width,"height":height,"gray":gray},
            "plan":{"id":"two-boundary-native","revision":1,"nodes":[
                {"id":"boundary","op":"geometry.two_boundary","version":1,"inputs":{"image":"$image"},"params":{"seedLevel":65,"externalLevel":80,"widthPrior":40,"heightPrior":28,"widthTolerance":10,"heightTolerance":12,"minSeparationPx":4,"pixelTolerancePx":4,"cornerRadius":8},"justification":{"tool":{"reason":"用 Rust gray8 搜尋與四側幾何核心建立兩層邊界候選。","expectedEvidence":[{"kind":"artifact","type":"evidence","id":"feature-evidence"}]},"parameters":[],"boundaries":[{"condition":"需要可辨識的 gray8 前景支持。","check":{"kind":"execution-status","allowed":["OK"]},"onFailure":"UNKNOWN"}]}}
            ]}
        });
        let result = execute(request).unwrap();
        assert_eq!(result["backend"], "rust-native");
        assert_eq!(result["nodes"][0]["op"], "geometry.two_boundary");
        assert_eq!(result["nodes"][0]["backend"], "rust-native");
        assert!(result["artifacts"].as_array().unwrap().iter().any(|artifact| artifact["id"] == "boundary:feature-evidence"));
        assert!(result["artifacts"].as_array().unwrap().iter().any(|artifact| artifact["id"] == "boundary:feature-curves"));
        let overlay=result["artifacts"].as_array().unwrap().iter().find(|artifact| artifact["id"]=="boundary:feature-overlay").unwrap();
        assert!(overlay["dataURL"].as_str().unwrap().starts_with("data:image/svg+xml;base64,"));
        assert!(result["nodes"][0]["outputSummary"]["measurements"]["pkgAnchorValid"].is_boolean());
    }
}
