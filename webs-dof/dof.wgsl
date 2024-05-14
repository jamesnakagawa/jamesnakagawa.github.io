// https://www.pcg-random.org/
fn random(n: u32) -> f32 {
    var h = n * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    h = (h >> 22u) ^ h;
    return f32(h) / f32(0xffffffff);
}

fn normalRandom(n: u32) -> f32 {
  // box muller algorithm
  let u1 = random(n);
  let u2 = random(n + 1);
  let rSquared = -2.0 * log(u1);
  let theta = 2.0 * 3.141592654 * u2;
  return sqrt(rSquared) * cos(theta);
}

fn rndCircle(s: u32, r: f32) -> vec2f {
  return vec2(r * normalRandom(s), r * normalRandom(s + 1));
}

fn lerp(start: vec3f, end: vec3f, i: f32) -> vec3f {
  let delta = end - start;
  let step = delta * i;
  return start + step;
}

fn index(coords : vec2i) -> i32 {
  return coords.x + coords.y * i32(params.dimensions.x);
}

fn hsvToRgb(c: vec3f) -> vec3f {
  let K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(), vec3f(1.0)), c.y);
}

struct Params {
  dimensions: vec2f,
  frame: f32,
}

@group(0) @binding(0)
  var<uniform> params : Params;

@group(0) @binding(1)
  var<storage, read_write> colorBuffer : array<vec4f>;

struct dofSettings {
  e : f32,
  f : f32,
  m : f32,
  i : f32,
  o : f32,
  hs: f32,
  he: f32,
  ss: f32,
  se: f32,
}

@group(0) @binding(2)
  var<uniform> dofs : dofSettings;

struct cameraMats {
  projectionMat : mat4x4f,
  worldMatInv : mat4x4f,
  position : vec3f,
}

@group(0) @binding(3)
  var<uniform> camera : cameraMats;

struct lineStruct {
  start : vec4f,
  end : vec4f
}

@group(0) @binding(4)
  var<storage, read_write> linesBuffer : array<lineStruct>;

@compute @workgroup_size(64)
fn dof(@builtin(global_invocation_id) id: vec3u) {
  let seed = u32(params.frame) + id.x;
  let focusWave = dofs.f + sin(params.frame / 300) * 0.3;
  // https://inconvergent.net/2019/depth-of-field/
  var line = linesBuffer[id.x];
  var delta = line.end - line.start;
  var iterations = u32(length(delta) * dofs.i);

  for (var i = 0u; i < iterations; i++) {
    let lerped = lerp(line.start.xyz, line.end.xyz, random(seed + i));
    let cameraDistance = distance(camera.position, lerped);
    let radius = dofs.m * pow(abs(focusWave - cameraDistance), dofs.e);

    // with orthographic camera, no z-divide is needed
    let projected = camera.projectionMat * camera.worldMatInv * vec4(lerped, 1.0);
    let coord = (projected.xy + vec2f(1.0)) / 2.0;
    let rndVec2 = rndCircle(seed + i, radius);
    let newPos = (coord + rndVec2) * params.dimensions.x;
    let pDir = normalize(projected.xy);
    let x = pDir.x * rndVec2.y - pDir.y * rndVec2.x; // cross product
    let rr = pow(abs(radius) / dofs.hs, dofs.he);

    var hueStart = 0.833;
    if (x < 0) {
      hueStart = 0.5;
    }

    let hue = clamp(hueStart + rr, 0.0, 1.0);
    let sat = clamp(pow(abs(x) / dofs.ss, dofs.se), 0.0, 1.0);
    let rgb = hsvToRgb(vec3(hue, sat, dofs.o));

    colorBuffer[index(vec2i(newPos))] += vec4f(rgb, 1.0);
  }
}

@group(0) @binding(1)  
  var<storage, read_write> buffer : array<vec4f>;

@group(0) @binding(2) var outTex : texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16) 
fn copy(@builtin(global_invocation_id) id: vec3u) {
  var color = buffer[index(vec2i(id.xy))];
  textureStore(outTex, id.xy, color);
}

@compute @workgroup_size(16, 16) 
fn reset(@builtin(global_invocation_id) id: vec3u) {
  buffer[index(vec2i(id.xy))] = vec4(0.0, 0.0, 0.0, 1.0);
}

