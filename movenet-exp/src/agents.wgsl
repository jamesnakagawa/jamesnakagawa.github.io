// // https://www.pcg-random.org/
// fn random(n: u32) -> f32 {
//     var h = n * 747796405u + 2891336453u;
//     h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
//     h = (h >> 22u) ^ h;
//     return f32(h) / f32(0xffffffff);
// }

// fn normalRandom(n: u32) -> f32 {
//   // box muller algorithm
//   let u1 = random(n);
//   let u2 = random(n + 1);
//   let rSquared = -2.0 * log(u1);
//   let theta = 2.0 * 3.141592654 * u2;
//   return sqrt(rSquared) * cos(theta);
// }

// fn rndCircle(s: u32, r: f32) -> vec2f {
//   return vec2(r * normalRandom(s), r * normalRandom(s + 1));
// }

// fn lerp(start: vec3f, end: vec3f, i: f32) -> vec3f {
//   let delta = end - start;
//   let step = delta * i;
//   return start + step;
// }

// fn hsvToRgb(c: vec3f) -> vec3f {
//   let K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
//   let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
//   return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(), vec3f(1.0)), c.y);
// }

fn index(coords : vec2i) -> i32 {
  return coords.x + coords.y * i32(params.dimensions.x);
}

struct Params {
  dimensions: vec2f,
  frame: f32,
}

@group(0) @binding(0)
  var<uniform> params : Params;

@group(0) @binding(1)
  var<storage, read_write> colorBuffer : array<vec4f>;

@group(0) @binding(2)
  var<storage, read_write> agents : array<vec2f>;

@compute @workgroup_size(64)
fn compute(@builtin(global_invocation_id) id: vec3u) {
  let seed = u32(params.frame) + id.x;
  let agent = agents[id.x];

  if (agent.x < 0.0 || agent.y < 0.0) {
    return;
  }

  colorBuffer[index(vec2i(i32(agent.x), i32(agent.y)))] = vec4f(1.0, 0.0, 0.0, 1.0);
}

@group(0) @binding(3) var outTex : texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16) 
fn copy(@builtin(global_invocation_id) id: vec3u) {
  var color = colorBuffer[index(vec2i(id.xy))];
  textureStore(outTex, id.xy, color);
}

// @compute @workgroup_size(16, 16) 
// fn reset(@builtin(global_invocation_id) id: vec3u) {
//   colorBuffer[index(vec2i(id.xy))] = vec4(0.0, 0.0, 0.0, 1.0);
// }

