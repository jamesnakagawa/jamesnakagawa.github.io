// https://www.pcg-random.org/
fn random(n: u32) -> f32 {
    var h = n * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    h = (h >> 22u) ^ h;
    return f32(h) / f32(0xffffffff);
}

fn randVec2(seed: u32) -> vec2f {
  return vec2(random(seed), random(seed + 1));
}

fn rndSphere(s: u32, radius: f32) -> vec3f {
  var r = radius * sqrt(random(s + 4));
  var theta = random(s + 2) * 2 * 3.141592654;
  var upsilon = random(s + 3) * 2 * 3.141592654;
  var cosu = cos(upsilon);
  var sinu = sin(upsilon);
  var circ = vec3(r * cos(theta), r * sin(theta), 0);
  var zrot = mat3x3f(1.0, 0, 0, 0, cosu, -sinu, 0, sinu, cosu);
  return zrot * circ;
}

fn lerp(start: vec3f, end: vec3f, i: f32) -> vec3f {
  let delta = end - start;
  let step = delta * i;
  return start + step;
}

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

struct dofSettings {
  dofE : f32,
  dofF : f32,
  dofM : f32,
  dofI : f32,
  dofO : f32,
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
  // https://inconvergent.net/2019/depth-of-field/
  var line = linesBuffer[id.x];
  var delta = line.end - line.start;
  var iterations = u32(length(delta) * dofs.dofI);

  for (var i = 0u; i < iterations; i++) {
    let lerped = lerp(line.start.xyz, line.end.xyz, random(seed + i));
    let cameraDistance = distance(camera.position, lerped);
    let radius = dofs.dofM * pow(abs(dofs.dofF - cameraDistance), dofs.dofE);
    let newPos = vec4f(lerped + rndSphere(seed + i, radius), 1.0);

    // with orthographic camera, no z-divide is needed
    let projected = camera.projectionMat * camera.worldMatInv * newPos;
    let coord = (projected.xy + vec2f(1.0, 1.0)) / 2.0 * params.dimensions;
    colorBuffer[index(vec2i(coord))] += vec4f(vec3f(dofs.dofO), 1.0);
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

