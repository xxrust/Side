//! Geometry core shared by the future Rust two-boundary pipeline.
//! Pixel search and candidate generation remain separate so their evidence can
//! be ported and checked one stage at a time.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EdgeLine { pub pos: f64, pub slope: f64, pub measured: bool }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FourEdges { pub top: EdgeLine, pub bottom: EdgeLine, pub left: EdgeLine, pub right: EdgeLine }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RectModel { pub cx: f64, pub cy: f64, pub width: f64, pub height: f64, pub radius: f64, pub theta: f64 }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Side { Top, Bottom, Left, Right }

impl Side {
    fn name(self) -> &'static str { match self { Side::Top => "top", Side::Bottom => "bottom", Side::Left => "left", Side::Right => "right" } }
    fn horizontal(self) -> bool { matches!(self, Side::Top | Side::Bottom) }
    fn sign(self) -> f64 { match self { Side::Top | Side::Left => 1.0, Side::Bottom | Side::Right => -1.0 } }
}

fn gray_at(gray: &[u8], width: usize, height: usize, x: f64, y: f64) -> f64 {
    let xi = x.round().clamp(0.0, (width.saturating_sub(1)) as f64) as usize;
    let yi = y.round().clamp(0.0, (height.saturating_sub(1)) as f64) as usize;
    gray[yi * width + xi] as f64
}

pub fn locate_bbox(gray: &[u8], width: usize, height: usize, seed_level: u8) -> Option<[usize; 4]> {
    if width == 0 || height == 0 || gray.len() != width * height { return None; }
    let mut min_x = width; let mut min_y = height; let mut max_x = 0usize; let mut max_y = 0usize; let mut found = false;
    for y in 0..height { for x in 0..width { if gray[y * width + x] > seed_level { found = true; min_x = min_x.min(x); min_y = min_y.min(y); max_x = max_x.max(x); max_y = max_y.max(y); } } }
    found.then_some([min_x, min_y, max_x - min_x + 1, max_y - min_y + 1])
}

fn scan_side(gray: &[u8], width: usize, height: usize, bbox: [usize; 4], side: Side, normal_range: usize, tangent_fraction: [f64; 2], slope_range: [f64; 2], slope_step: f64) -> Vec<Value> {
    let [x, y, w, h] = bbox; let center = if side.horizontal() { x as f64 + w as f64 / 2.0 } else { y as f64 + h as f64 / 2.0 };
    let base = match side { Side::Top => y as f64, Side::Bottom => (y + h.saturating_sub(1)) as f64, Side::Left => x as f64, Side::Right => (x + w.saturating_sub(1)) as f64 };
    let tangent_start = if side.horizontal() { x as f64 + tangent_fraction[0] * w as f64 } else { y as f64 + tangent_fraction[0] * h as f64 };
    let tangent_end = if side.horizontal() { x as f64 + tangent_fraction[1] * w as f64 } else { y as f64 + tangent_fraction[1] * h as f64 };
    let tangent_count = 61usize; let normal_count = normal_range * 2 + 1;
    let mut candidates = Vec::new(); let mut slope = slope_range[0];
    while slope <= slope_range[1] + slope_step * 0.25 {
        let mut profile = vec![0.0; normal_count];
        for ti in 0..tangent_count { let tangent = tangent_start + (tangent_end - tangent_start) * ti as f64 / (tangent_count - 1) as f64;
            for ni in 0..normal_count { let offset = ni as f64 - normal_range as f64; let normal = base + offset; let (px, py) = if side.horizontal() { (tangent, normal + slope * (tangent - center)) } else { (normal + slope * (tangent - center), tangent) }; profile[ni] += gray_at(gray, width, height, px, py); }
        }
        for value in &mut profile { *value /= tangent_count as f64; }
        let mut best: Option<(usize, f64)> = None;
        for i in 2..normal_count.saturating_sub(2) { let gradient = side.sign() * (profile[i + 1] - profile[i - 1]) / 2.0; if best.map(|(_, strength)| gradient > strength).unwrap_or(true) { best = Some((i, gradient)); } }
        if let Some((index, strength)) = best { if strength > 0.0 { candidates.push(json!({"side":side.name(),"pos":base + index as f64 - normal_range as f64,"slope":slope,"strength":strength})); } }
        slope += slope_step;
    }
    candidates.sort_by(|a, b| b["strength"].as_f64().unwrap_or(0.0).partial_cmp(&a["strength"].as_f64().unwrap_or(0.0)).unwrap());
    candidates.truncate(7); candidates
}

pub fn scan_edges(gray: &[u8], width: usize, height: usize, bbox: [usize; 4]) -> Value {
    let mut result = serde_json::Map::new();
    for side in [Side::Top, Side::Bottom, Side::Left, Side::Right] { result.insert(side.name().into(), Value::Array(scan_side(gray, width, height, bbox, side, 70, [0.22, 0.78], [-0.06, 0.06], 0.01))); }
    Value::Object(result)
}

pub fn choose_joint_candidates(scan: &Value, bbox: [usize; 4], width_prior: f64, height_prior: f64, width_tolerance: f64, height_tolerance: f64) -> Value {
    let names = ["top", "bottom", "left", "right"];
    let lists: Vec<Vec<&Value>> = names.iter().map(|name| scan.get(*name).and_then(Value::as_array).map(|items| items.iter().collect()).unwrap_or_default()).collect();
    if lists.iter().any(|items| items.is_empty()) { return json!({"selected":null,"candidates":[],"reason":"one or more sides have no scan candidates"}); }
    let mut candidates = Vec::new();
    for top in &lists[0] { for bottom in &lists[1] { for left in &lists[2] { for right in &lists[3] {
        let top_pos=top["pos"].as_f64().unwrap_or(0.); let bottom_pos=bottom["pos"].as_f64().unwrap_or(0.); let left_pos=left["pos"].as_f64().unwrap_or(0.); let right_pos=right["pos"].as_f64().unwrap_or(0.);
        let measured_width=right_pos-left_pos; let measured_height=bottom_pos-top_pos;
        if measured_width<=0.0 || measured_height<=0.0 { continue; }
        let slopes=[top["slope"].as_f64().unwrap_or(0.0),bottom["slope"].as_f64().unwrap_or(0.0),-left["slope"].as_f64().unwrap_or(0.0),-right["slope"].as_f64().unwrap_or(0.0)];
        let slope_mean=slopes.iter().sum::<f64>()/slopes.len() as f64; let slope_scatter=(slopes.iter().map(|v| (v-slope_mean).powi(2)).sum::<f64>()/slopes.len() as f64).sqrt();
        let strength=[top,bottom,left,right].iter().map(|v| v["strength"].as_f64().unwrap_or(1.0).max(1.0).ln()).sum::<f64>();
        let score=strength-((measured_width-width_prior)/width_tolerance).powi(2)-((measured_height-height_prior)/height_tolerance).powi(2)-(slope_scatter/0.015).powi(2);
        candidates.push(json!({"score":score,"width":measured_width,"height":measured_height,"angleSlope":slope_mean,"angleSpread":slope_scatter,"lines":{"top":top,"bottom":bottom,"left":left,"right":right},"bbox":bbox}));
    }}}}
    candidates.sort_by(|a,b| b["score"].as_f64().unwrap_or(f64::NEG_INFINITY).partial_cmp(&a["score"].as_f64().unwrap_or(f64::NEG_INFINITY)).unwrap());
    candidates.truncate(5);
    json!({"selected":candidates.first().cloned(),"candidates":candidates,"widthPrior":width_prior,"heightPrior":height_prior,"widthTolerance":width_tolerance,"heightTolerance":height_tolerance})
}

fn refine_side(gray: &[u8], width: usize, height: usize, bbox: [usize; 4], side: Side, line: &Value, external_level: f64) -> Value {
    let [x, y, w, h] = bbox; let pos=line["pos"].as_f64().unwrap_or(0.0); let slope=line["slope"].as_f64().unwrap_or(0.0); let center=if side.horizontal(){x as f64+w as f64/2.0}else{y as f64+h as f64/2.0}; let start=if side.horizontal(){x as f64+w as f64*0.22}else{y as f64+h as f64*0.22}; let end=if side.horizontal(){x as f64+w as f64*0.78}else{y as f64+h as f64*0.78};
    let mut crossing_positions=Vec::new(); let mut gradients=Vec::new();
    for ti in 0..61 { let tangent=start+(end-start)*ti as f64/60.0; let mut profile=Vec::new(); for offset in -18..=18 { let normal=pos+offset as f64; let (px,py)=if side.horizontal(){(tangent,normal+slope*(tangent-center))}else{(normal+slope*(tangent-center),tangent)}; profile.push(gray_at(gray,width,height,px,py)); }
        let mut best_index=18usize; let mut best_gradient=f64::NEG_INFINITY;
        for i in 2..35 { let gradient=side.sign()*(profile[i+1]-profile[i-1])/2.0; if gradient>best_gradient {best_gradient=gradient;best_index=i;} }
        if best_gradient>=3.0 { crossing_positions.push(pos+(best_index as i32-18) as f64); gradients.push(best_gradient); }
    }
    if crossing_positions.len()>=9 { let refined=crossing_positions.iter().sum::<f64>()/crossing_positions.len() as f64; let contrast=gradients.iter().sum::<f64>()/gradients.len() as f64; return json!({"pos":refined,"slope":slope,"kind":"measured","method":"Rust gray8 metal/background gradient crossing","edgeIntervalPx":3.0,"separatorContrast":contrast,"supportCount":crossing_positions.len(),"externalLevel":external_level,"points":[]}); }
    let estimated=pos+side.sign()*3.0; json!({"pos":estimated,"slope":slope,"kind":"estimated","method":"Rust provisional outward offset; no resolved gray8 crossing","edgeIntervalPx":6.0,"supportCount":crossing_positions.len(),"externalLevel":external_level,"points":[]})
}

fn refine_selected_edges(gray: &[u8], width: usize, height: usize, bbox: [usize; 4], selected: &Value, external_level: f64) -> Value {
    let mut output=serde_json::Map::new(); for side in [Side::Top,Side::Bottom,Side::Left,Side::Right] { let line=selected["lines"].get(side.name()).cloned().unwrap_or(Value::Null); output.insert(side.name().into(),refine_side(gray,width,height,bbox,side,&line,external_level)); } Value::Object(output)
}

fn exterior_side(gray: &[u8], width: usize, height: usize, bbox: [usize; 4], side: Side, external_level: f64) -> Value {
    let [x,y,w,h]=bbox; let start=if side.horizontal(){x as f64+w as f64*0.22}else{y as f64+h as f64*0.22}; let end=if side.horizontal(){x as f64+w as f64*0.78}else{y as f64+h as f64*0.78}; let center=if side.horizontal(){x as f64+w as f64/2.0}else{y as f64+h as f64/2.0}; let base=match side{Side::Top=>y as f64,Side::Bottom=>(y+h.saturating_sub(1)) as f64,Side::Left=>x as f64,Side::Right=>(x+w.saturating_sub(1)) as f64}; let mut points=Vec::new();
    for ti in 0..61 { let tangent=start+(end-start)*ti as f64/60.0; let mut found=None; for oi in 0..=70 { let offset=if side.sign()>0.0{-(70-oi) as f64}else{(70-oi) as f64}; let normal=base+offset; let (px,py)=if side.horizontal(){(tangent,normal)}else{(normal,tangent)}; if gray_at(gray,width,height,px,py)>=external_level{found=Some(normal);break;} } if let Some(normal)=found {points.push((tangent,normal));} }
    if points.len()<9{return json!({"kind":"estimated","method":"no independent external gray8 crossing","supportCount":points.len(),"externalLevel":external_level,"pos":base,"slope":0.0,"points":[]});}
    let mean_t=points.iter().map(|p|p.0).sum::<f64>()/points.len() as f64; let mean_n=points.iter().map(|p|p.1).sum::<f64>()/points.len() as f64; let denom=points.iter().map(|p|(p.0-mean_t).powi(2)).sum::<f64>(); let slope=if denom>1e-9{points.iter().map(|p|(p.0-mean_t)*(p.1-mean_n)).sum::<f64>()/denom}else{0.0}; let pos=mean_n+slope*(center-mean_t); let rms=(points.iter().map(|p|(p.1-(pos+slope*(p.0-center))).powi(2)).sum::<f64>()/points.len() as f64).sqrt(); json!({"kind":"measured","method":"Rust exterior metal/background crossing","supportCount":points.len(),"externalLevel":external_level,"pos":pos,"slope":slope,"rms":rms,"points":points.iter().map(|p|json!([p.0,p.1])).collect::<Vec<_>>()})
}

fn exterior_edges(gray: &[u8], width: usize, height: usize, bbox: [usize; 4], external_level: f64) -> Value { let mut out=serde_json::Map::new(); for side in [Side::Top,Side::Bottom,Side::Left,Side::Right]{out.insert(side.name().into(),exterior_side(gray,width,height,bbox,side,external_level));} Value::Object(out) }

fn line_from_json(value: &Value) -> EdgeLine { EdgeLine { pos:value["pos"].as_f64().unwrap_or(0.0), slope:value["slope"].as_f64().unwrap_or(0.0), measured:value["kind"]=="measured" } }

pub fn reconstruct_pkg_edges(lid: &Value, exterior: &Value, width_prior: f64, height_prior: f64, min_separation: f64) -> Value {
    let sides=[Side::Top,Side::Bottom,Side::Left,Side::Right]; let mut gaps=serde_json::Map::new(); let mut visible=Vec::new();
    for side in sides { let l=line_from_json(&lid[side.name()]); let e=line_from_json(&exterior[side.name()]); let gap=(l.pos-e.pos)*side.sign(); gaps.insert(side.name().into(),json!(gap)); if gap>min_separation {visible.push(side.name());} }
    let top=line_from_json(&exterior["top"]); let bottom=line_from_json(&exterior["bottom"]); let left=line_from_json(&exterior["left"]); let right=line_from_json(&exterior["right"]);
    let horizontal=if visible.iter().any(|s|*s=="top") {"top"} else if visible.iter().any(|s|*s=="bottom") {"bottom"} else {"top"}; let vertical=if visible.iter().any(|s|*s=="left") {"left"} else if visible.iter().any(|s|*s=="right") {"right"} else {"left"};
    let mut edges=serde_json::Map::new();
    for side in sides { let name=side.name(); let direct=exterior[name].clone(); let value=if visible.contains(&name) {json!({"pos":direct["pos"],"slope":direct["slope"],"kind":"measured","method":"independent exposed pkg edge","edgeIntervalPx":3.0,"points":direct["points"]})} else {let anchor=if side.horizontal(){if horizontal=="top"{top}else{bottom}}else{if vertical=="left"{left}else{right}}; let offset=if side==Side::Top{-(height_prior)}else if side==Side::Bottom{height_prior}else if side==Side::Left{-width_prior}else{width_prior}; json!({"pos":anchor.pos+offset,"slope":anchor.slope,"kind":"estimated","method":"independent exposed pkg anchor plus dimension prior","edgeIntervalPx":11.0,"points":[]})}; edges.insert(name.into(),value); }
    json!({"edges":edges,"gaps":gaps,"visiblePkgSides":visible,"anchors":{"horizontal":horizontal,"vertical":vertical},"pkgAnchorValid":visible.iter().any(|s|*s=="top"||*s=="bottom")&&visible.iter().any(|s|*s=="left"||*s=="right"),"widthPrior":width_prior,"heightPrior":height_prior,"minSeparationPx":min_separation})
}

fn four_edges(value: &Value) -> FourEdges { FourEdges { top:line_from_json(&value["top"]), bottom:line_from_json(&value["bottom"]), left:line_from_json(&value["left"]), right:line_from_json(&value["right"]) } }

pub fn classify_geometry(lid: &Value, pkg: &Value, anchor_valid: bool, pixel_tolerance: f64, corner_radius: f64) -> Value {
    let lid_edges=four_edges(lid); let pkg_edges=four_edges(pkg); let clearance=signed_clearance(lid_edges,pkg_edges).unwrap_or([f64::NAN;4]); let min_clearance=clearance.iter().copied().fold(f64::INFINITY,f64::min); let model=pose(lid_edges,corner_radius); let finite=clearance.iter().all(|v|v.is_finite())&&model.is_some(); let status=if !anchor_valid||!finite{"UNKNOWN"}else if min_clearance < -pixel_tolerance{"SKEW"}else{"GOOD"}; json!({"status":status,"anchorValid":anchor_valid,"finite":finite,"pixelTolerancePx":pixel_tolerance,"clearancePx":{"top":clearance[0],"bottom":clearance[1],"left":clearance[2],"right":clearance[3]},"minClearancePx":min_clearance,"lidPose":model.map(|m|json!({"center":{"x":m.cx,"y":m.cy},"width":m.width,"height":m.height,"cornerRadius":m.radius,"thetaRad":m.theta})),"backend":"rust-native"})
}

pub fn overlay_svg(width: usize, height: usize, lid: &Value, pkg: &Value) -> String {
    let mut body=String::new(); let center_x=width as f64/2.0; let center_y=height as f64/2.0;
    for (group,value,color) in [("lid",lid,"#27d99a"),("pkg",pkg,"#f2a23a")] { for side in [Side::Top,Side::Bottom,Side::Left,Side::Right] { let line=&value[side.name()]; let pos=line["pos"].as_f64().unwrap_or(0.0); let slope=line["slope"].as_f64().unwrap_or(0.0); let estimated=line["kind"]=="estimated"; let (x1,y1,x2,y2)=if side.horizontal(){(0.0,pos+slope*(0.0-center_x),width as f64,pos+slope*(width as f64-center_x))}else{(pos+slope*(0.0-center_y),0.0,pos+slope*(height as f64-center_y),height as f64)}; body.push_str(&format!("<line data-group=\"{group}\" x1=\"{x1:.2}\" y1=\"{y1:.2}\" x2=\"{x2:.2}\" y2=\"{y2:.2}\" stroke=\"{color}\" stroke-width=\"2\"{} />",if estimated{" stroke-dasharray=\"7 5\""}else{""})); } }
    let svg=format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\"><rect width=\"100%\" height=\"100%\" fill=\"#152a33\" fill-opacity=\".08\"/>{body}</svg>"); format!("data:image/svg+xml;base64,{}",STANDARD.encode(svg.as_bytes()))
}

fn arc_samples(model: RectModel, radius: f64, count: usize) -> Vec<([f64;2],[f64;2])> {
    let radius=radius.max(0.5).min(model.width.min(model.height)/2.0-0.1); let c=model.theta.cos(); let s=model.theta.sin(); let half_w=model.width/2.0-radius; let half_h=model.height/2.0-radius; let corners=[(-half_w,-half_h,std::f64::consts::PI,1.5*std::f64::consts::PI),(half_w,-half_h,1.5*std::f64::consts::PI,2.0*std::f64::consts::PI),(half_w,half_h,0.0,0.5*std::f64::consts::PI),(-half_w,half_h,0.5*std::f64::consts::PI,std::f64::consts::PI)]; let mut out=Vec::new();
    for (cx,cy,a0,a1) in corners { for i in 0..count { let t=a0+(a1-a0)*i as f64/(count.saturating_sub(1).max(1)) as f64; let nx=t.cos(); let ny=t.sin(); let lx=cx+radius*nx; let ly=cy+radius*ny; let x=model.cx+c*lx-s*ly; let y=model.cy+s*lx+c*ly; let wx=c*nx-s*ny; let wy=s*nx+c*ny; out.push(([x,y],[wx,wy])); } }
    out
}

pub fn radius_trials(gray: &[u8], width: usize, height: usize, model: RectModel, tag: &str, min_radius: f64, max_radius: f64, step: f64) -> Value {
    let mut rows=Vec::new(); let mut radius=min_radius; while radius<=max_radius+step*0.25 { let samples=arc_samples(model,radius,41); let mut supported=0usize; let mut score=0.0; for (point,normal) in &samples { let mut profile=[0.0;5]; for (index,offset) in [-6.0,-3.0,0.0,3.0,6.0].into_iter().enumerate() { profile[index]=gray_at(gray,width,height,point[0]+normal[0]*offset,point[1]+normal[1]*offset); } let gradient=if tag=="pkg" {(profile[0]-profile[4])/12.0}else{(profile[4]-profile[0])/12.0}; if gradient>3.0 {supported+=1;score+=gradient.min(20.0);} } let coverage=supported as f64/samples.len() as f64; rows.push(json!({"radius":radius,"score":score/samples.len() as f64,"supportedSamples":supported,"coverage":coverage,"tag":tag})); radius+=step; }
    let selected=rows.iter().max_by(|a,b|a["score"].as_f64().unwrap_or(0.0).partial_cmp(&b["score"].as_f64().unwrap_or(0.0)).unwrap()).cloned(); json!({"tag":tag,"trials":rows,"selected":selected,"backend":"rust-native"})
}

pub fn decision_trials(geometry: &Value, score_deltas: &[f64], tolerances: &[f64]) -> Value {
    let anchor=geometry["anchorValid"].as_bool().unwrap_or(false); let finite=geometry["finite"].as_bool().unwrap_or(false); let min=geometry["minClearancePx"].as_f64().unwrap_or(f64::NAN); let mut rows=Vec::new();
    for delta in score_deltas { for tolerance in tolerances { let category=if !anchor||!finite||!min.is_finite(){"UNKNOWN"}else if min < -*tolerance{"SKEW"}else{"GOOD"}; rows.push(json!({"scoreDelta":delta,"pixelTolerancePx":tolerance,"category":category,"minClearancePx":min,"anchorValid":anchor,"finite":finite})); } }
    json!({"trials":rows,"scoreDeltas":score_deltas,"pixelTolerancesPx":tolerances,"backend":"rust-native"})
}

fn intersection(a: EdgeLine, b: EdgeLine, horizontal: bool, cx: f64, cy: f64) -> Option<[f64; 2]> {
    // Horizontal edge: y = a.slope * (x - cx) + a.pos.
    // Vertical edge:   x = b.slope * (y - cy) + b.pos.
    let (ma, pa, mb, pb) = if horizontal {
        (a.slope, a.pos - a.slope * cx, b.slope, b.pos - b.slope * cy)
    } else {
        (b.slope, b.pos - b.slope * cy, a.slope, a.pos - a.slope * cx)
    };
    let denominator = 1.0 - ma * mb;
    if denominator.abs() < 1e-9 { return None; }
    let x = (mb * pa + pb) / denominator;
    let y = ma * x + pa;
    Some([x, y])
}

pub fn corners(edges: FourEdges) -> Option<[[f64; 2]; 4]> {
    Some([
        intersection(edges.top, edges.left, true, 0.0, 0.0)?,
        intersection(edges.top, edges.right, true, 0.0, 0.0)?,
        intersection(edges.bottom, edges.right, true, 0.0, 0.0)?,
        intersection(edges.bottom, edges.left, true, 0.0, 0.0)?,
    ])
}

pub fn pose(edges: FourEdges, corner_radius: f64) -> Option<RectModel> {
    if !corner_radius.is_finite() || corner_radius < 0.0 { return None; }
    let slopes = [edges.top.slope, edges.bottom.slope, -edges.left.slope, -edges.right.slope];
    let mut sorted = slopes;
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let theta = sorted[sorted.len() / 2].atan();
    let c = theta.cos(); let s = theta.sin();
    let rotate = |p: [f64; 2]| [c * p[0] + s * p[1], -s * p[0] + c * p[1]];
    let points = corners(edges)?;
    let rotated: Vec<[f64; 2]> = points.iter().copied().map(rotate).collect();
    let min_x = rotated.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min);
    let max_x = rotated.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
    let min_y = rotated.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
    let max_y = rotated.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
    let width = max_x - min_x; let height = max_y - min_y;
    if ![width, height].iter().all(|v| v.is_finite() && *v > 0.0) { return None; }
    let center_rotated = [(min_x + max_x) / 2.0, (min_y + max_y) / 2.0];
    let center = [c * center_rotated[0] - s * center_rotated[1], s * center_rotated[0] + c * center_rotated[1]];
    Some(RectModel { cx: center[0], cy: center[1], width, height, radius: corner_radius.min(width / 2.0).min(height / 2.0), theta })
}

pub fn signed_clearance(lid: FourEdges, pkg: FourEdges) -> Option<[f64; 4]> {
    let sides = [(lid.top, pkg.top, 1.0), (lid.bottom, pkg.bottom, -1.0), (lid.left, pkg.left, 1.0), (lid.right, pkg.right, -1.0)];
    let mut out = [0.0; 4];
    for (index, (inner, outer, sign)) in sides.into_iter().enumerate() {
        let delta = (inner.pos - outer.pos) * sign;
        out[index] = delta / (1.0 + (inner.slope - outer.slope).powi(2)).sqrt();
    }
    Some(out)
}

pub fn evidence(edges: FourEdges, model: RectModel, clearance: [f64; 4]) -> Value {
    json!({
        "backend":"rust-native",
        "pose":{"center":{"x":model.cx,"y":model.cy},"width":model.width,"height":model.height,"cornerRadius":model.radius,"thetaRad":model.theta},
        "edges":{
            "top":{"pos":edges.top.pos,"slope":edges.top.slope,"measured":edges.top.measured},
            "bottom":{"pos":edges.bottom.pos,"slope":edges.bottom.slope,"measured":edges.bottom.measured},
            "left":{"pos":edges.left.pos,"slope":edges.left.slope,"measured":edges.left.measured},
            "right":{"pos":edges.right.pos,"slope":edges.right.slope,"measured":edges.right.measured}
        },
        "clearancePx":{"top":clearance[0],"bottom":clearance[1],"left":clearance[2],"right":clearance[3]}
    })
}

fn parse_edge(value: &Value, name: &str) -> Result<EdgeLine, String> {
    let object = value.as_object().ok_or_else(|| format!("two-boundary {name} edge must be an object"))?;
    let pos = object.get("pos").and_then(Value::as_f64).ok_or_else(|| format!("two-boundary {name} edge is missing pos"))?;
    let slope = object.get("slope").and_then(Value::as_f64).unwrap_or(0.0);
    let measured = object.get("measured").and_then(Value::as_bool).unwrap_or(false);
    if !pos.is_finite() || !slope.is_finite() { return Err(format!("two-boundary {name} edge is not finite")); }
    Ok(EdgeLine { pos, slope, measured })
}

pub fn execute(request: Value) -> Result<Value, String> {
    let object = request.as_object().ok_or("two-boundary geometry request must be an object")?;
    if let (Some(width), Some(height)) = (object.get("width").and_then(Value::as_u64), object.get("height").and_then(Value::as_u64)) {
        let width = width as usize; let height = height as usize;
        let pixels: Vec<u8> = if let Some(encoded)=object.get("grayBase64").and_then(Value::as_str) {
            STANDARD.decode(encoded).map_err(|_| "grayBase64 is not valid base64-u8")?
        } else if let Some(gray)=object.get("gray").and_then(Value::as_array) {
            gray.iter().map(|value| value.as_u64().ok_or("gray pixel must be an integer").and_then(|v| u8::try_from(v).map_err(|_| "gray pixel out of range"))).collect::<Result<_, _>>()?
        } else { return Err("two-boundary request is missing gray pixels".into()); };
        let seed = object.get("seedLevel").and_then(Value::as_u64).unwrap_or(65).min(255) as u8;
        let bbox = locate_bbox(&pixels, width, height, seed).ok_or("two-boundary search found no support above seed level")?;
        let edge_candidates=scan_edges(&pixels,width,height,bbox);
        let width_prior=object.get("widthPrior").and_then(Value::as_f64).unwrap_or((bbox[2] as f64)*1.02);
        let height_prior=object.get("heightPrior").and_then(Value::as_f64).unwrap_or(bbox[3] as f64);
        let joint=choose_joint_candidates(&edge_candidates,bbox,width_prior,height_prior,object.get("widthTolerance").and_then(Value::as_f64).unwrap_or(10.0),object.get("heightTolerance").and_then(Value::as_f64).unwrap_or(12.0));
        let external_level=object.get("externalLevel").and_then(Value::as_f64).unwrap_or(80.0); let refined=joint["selected"].as_object().map(|_| refine_selected_edges(&pixels,width,height,bbox,&joint["selected"],external_level)).unwrap_or(Value::Null); let external=exterior_edges(&pixels,width,height,bbox,external_level); let pkg=if refined.is_object(){Some(reconstruct_pkg_edges(&refined,&external,object.get("pkgWidth").and_then(Value::as_f64).unwrap_or(width_prior),object.get("pkgHeight").and_then(Value::as_f64).unwrap_or(height_prior),object.get("minSeparationPx").and_then(Value::as_f64).unwrap_or(4.0)))}else{None}; let geometry=pkg.as_ref().and_then(|p|refined.as_object().map(|_|classify_geometry(&refined,&p["edges"],p["pkgAnchorValid"].as_bool().unwrap_or(false),object.get("pixelTolerancePx").and_then(Value::as_f64).unwrap_or(4.0),object.get("cornerRadius").and_then(Value::as_f64).unwrap_or(65.0)))); let trials=geometry.as_ref().and_then(|g|g["lidPose"].as_object().map(|_|{let m=pose(four_edges(&refined),object.get("cornerRadius").and_then(Value::as_f64).unwrap_or(65.0)).unwrap(); json!({"lid":radius_trials(&pixels,width,height,m,"lid",2.0,m.width.min(m.height)/2.0-0.5,2.0),"pkg":radius_trials(&pixels,width,height,m,"pkg",2.0,m.width.min(m.height)/2.0-0.5,2.0)})})); let decision=geometry.as_ref().map(|g|{let deltas=object.get("scoreDeltas").and_then(Value::as_array).map(|a|a.iter().filter_map(Value::as_f64).collect::<Vec<_>>()).filter(|a|!a.is_empty()).unwrap_or_else(||vec![0.5,1.0,2.0,3.0]);let tolerances=object.get("toleranceTrialsPx").and_then(Value::as_array).map(|a|a.iter().filter_map(Value::as_f64).collect::<Vec<_>>()).filter(|a|!a.is_empty()).unwrap_or_else(||vec![0.0,3.0,4.0,5.0]);decision_trials(g,&deltas,&tolerances)});
        return Ok(json!({"backend":"rust-native","search":{"bbox":bbox,"seedLevel":seed,"edgeCandidates":edge_candidates,"jointCandidates":joint,"refinedEdges":refined,"exteriorEdges":external,"pkgReconstruction":pkg,"geometry":geometry,"radiusTrials":trials,"decisionTrials":decision}}));
    }
    let edges = FourEdges {
        top: parse_edge(object.get("top").ok_or("two-boundary request is missing top")?, "top")?,
        bottom: parse_edge(object.get("bottom").ok_or("two-boundary request is missing bottom")?, "bottom")?,
        left: parse_edge(object.get("left").ok_or("two-boundary request is missing left")?, "left")?,
        right: parse_edge(object.get("right").ok_or("two-boundary request is missing right")?, "right")?,
    };
    let radius = object.get("cornerRadius").and_then(Value::as_f64).unwrap_or(0.0);
    let model = pose(edges, radius).ok_or("two-boundary geometry cannot reconstruct a finite pose")?;
    let clearance = signed_clearance(edges, FourEdges {
        top: parse_edge(object.get("pkgTop").ok_or("two-boundary request is missing pkgTop")?, "pkgTop")?,
        bottom: parse_edge(object.get("pkgBottom").ok_or("two-boundary request is missing pkgBottom")?, "pkgBottom")?,
        left: parse_edge(object.get("pkgLeft").ok_or("two-boundary request is missing pkgLeft")?, "pkgLeft")?,
        right: parse_edge(object.get("pkgRight").ok_or("two-boundary request is missing pkgRight")?, "pkgRight")?,
    }).ok_or("two-boundary clearance could not be computed")?;
    Ok(evidence(edges, model, clearance))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconstructs_axis_aligned_edges_and_clearance() {
        let lid = FourEdges { top: EdgeLine { pos: 10.0, slope: 0.0, measured: true }, bottom: EdgeLine { pos: 90.0, slope: 0.0, measured: true }, left: EdgeLine { pos: 20.0, slope: 0.0, measured: true }, right: EdgeLine { pos: 180.0, slope: 0.0, measured: true } };
        let pkg = FourEdges { top: EdgeLine { pos: 0.0, slope: 0.0, measured: true }, bottom: EdgeLine { pos: 100.0, slope: 0.0, measured: true }, left: EdgeLine { pos: 0.0, slope: 0.0, measured: true }, right: EdgeLine { pos: 200.0, slope: 0.0, measured: true } };
        let model = pose(lid, 10.0).unwrap();
        assert!((model.width - 160.0).abs() < 1e-9);
        assert!((model.height - 80.0).abs() < 1e-9);
        assert_eq!(signed_clearance(lid, pkg).unwrap(), [10.0, 10.0, 20.0, 20.0]);
    }

    #[test]
    fn preserves_rotated_pose_without_using_a_bounding_box_model() {
        let edges = FourEdges { top: EdgeLine { pos: 8.0, slope: 0.2, measured: true }, bottom: EdgeLine { pos: 88.0, slope: 0.2, measured: true }, left: EdgeLine { pos: 20.0, slope: -0.2, measured: true }, right: EdgeLine { pos: 180.0, slope: -0.2, measured: true } };
        let model = pose(edges, 12.0).unwrap();
        assert!(model.theta.abs() > 0.1);
        assert!(model.width > 100.0 && model.height > 50.0);
        let corners = corners(edges).unwrap();
        assert!(corners.iter().all(|p| p.iter().all(|v| v.is_finite())));
        let value = evidence(edges, model, [1.0, 2.0, 3.0, 4.0]);
        assert_eq!(value["backend"], "rust-native");
        assert_eq!(value["clearancePx"]["right"], 4.0);
    }

    #[test]
    fn command_request_returns_rust_geometry_evidence() {
        let edge = |pos| json!({"pos":pos,"slope":0.0,"measured":true});
        let request = json!({"top":edge(10.0),"bottom":edge(90.0),"left":edge(20.0),"right":edge(180.0),"pkgTop":edge(0.0),"pkgBottom":edge(100.0),"pkgLeft":edge(0.0),"pkgRight":edge(200.0),"cornerRadius":10.0});
        let result = execute(request).unwrap();
        assert_eq!(result["backend"], "rust-native");
        assert_eq!(result["pose"]["width"], 160.0);
        assert_eq!(result["clearancePx"]["left"], 20.0);
    }

    #[test]
    fn command_request_scans_gray8_support_before_geometry() {
        let mut gray = vec![0u8; 64 * 48];
        for y in 10..38 { for x in 12..52 { gray[y * 64 + x] = 220; } }
        let request = json!({"width":64,"height":48,"gray":gray,"seedLevel":65});
        let result = execute(request).unwrap();
        assert_eq!(result["backend"], "rust-native");
        assert_eq!(result["search"]["bbox"], json!([12, 10, 40, 28]));
        assert!(result["search"]["edgeCandidates"]["top"].as_array().unwrap().len() > 0);
        assert!(result["search"]["jointCandidates"]["selected"].is_object());
        assert_eq!(result["search"]["refinedEdges"]["top"]["kind"], "measured");
        assert!(result["search"]["refinedEdges"]["top"]["supportCount"].as_u64().unwrap() >= 9);
        assert_eq!(result["search"]["exteriorEdges"]["top"]["kind"], "measured");
        assert!(result["search"]["exteriorEdges"]["top"]["supportCount"].as_u64().unwrap() >= 9);
        assert!(result["search"]["radiusTrials"]["lid"]["selected"].is_object());
        assert!(result["search"]["radiusTrials"]["pkg"]["trials"].as_array().unwrap().len() > 0);
        assert_eq!(result["search"]["decisionTrials"]["trials"].as_array().unwrap().len(), 16);
    }

    #[test]
    fn reconstructs_missing_pkg_sides_from_independent_anchor_and_dimensions() {
        let edge=|pos,kind|json!({"pos":pos,"slope":0.0,"kind":kind,"points":[]});
        let lid=json!({"top":edge(10.0,"measured"),"bottom":edge(90.0,"measured"),"left":edge(20.0,"measured"),"right":edge(180.0,"measured")});
        let exterior=json!({"top":edge(0.0,"measured"),"bottom":edge(90.0,"measured"),"left":edge(0.0,"measured"),"right":edge(180.0,"measured")});
        let result=reconstruct_pkg_edges(&lid,&exterior,200.0,100.0,4.0);
        assert!(result["pkgAnchorValid"].as_bool().unwrap());
        assert_eq!(result["edges"]["bottom"]["kind"],"estimated");
        assert_eq!(result["edges"]["right"]["kind"],"estimated");
    }

    #[test]
    fn classifies_clearance_without_turning_missing_support_into_good() {
        let edge=|pos,kind|json!({"pos":pos,"slope":0.0,"kind":kind,"points":[]});
        let lid=json!({"top":edge(10.0,"measured"),"bottom":edge(90.0,"measured"),"left":edge(20.0,"measured"),"right":edge(180.0,"measured")});
        let pkg=json!({"top":edge(0.0,"measured"),"bottom":edge(100.0,"measured"),"left":edge(0.0,"measured"),"right":edge(200.0,"measured")});
        assert_eq!(classify_geometry(&lid,&pkg,true,4.0,10.0)["status"],"GOOD");
        assert_eq!(classify_geometry(&lid,&pkg,false,4.0,10.0)["status"],"UNKNOWN");
        let tight=json!({"top":edge(0.0,"measured"),"bottom":edge(85.0,"measured"),"left":edge(0.0,"measured"),"right":edge(200.0,"measured")});
        assert_eq!(classify_geometry(&lid,&tight,true,4.0,10.0)["status"],"SKEW");
    }
}
