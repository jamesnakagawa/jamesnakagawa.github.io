import "enable3d";
import lilGui from "lilGui";
const { THREE, Scene3D, PhysicsLoader, Project } = ENABLE3D;

const glassVertex = `
  uniform float u_incidence;
  // uniform float u_chromatic_aberration;
  uniform float u_refract_power;
  uniform float u_dir;
  uniform float u_near;
  uniform float u_far;
  
  varying vec3 worldNormal;
  varying vec3 eyeVector;
  varying vec3 refraction;
  varying vec4 worldPos;

  void main() {
    worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    eyeVector = normalize(worldPos.xyz - cameraPosition);
    vec3 transformedNormal = normalMatrix * normal;
    worldNormal = normalize(transformedNormal);

    refraction = refract(
      eyeVector,
      worldNormal, 
      u_dir / u_incidence
    ) * u_refract_power;
  }`;
const glassFragment = `
  uniform float u_incidence;
  uniform vec3 u_light;
  uniform float u_saturation;
  uniform float u_chromatic_aberration;
  // uniform float u_refract_power;
  uniform float u_shininess;
  uniform float u_diffuseness;
  uniform float u_fresnel_exp;
  uniform float u_dir;

  uniform vec2 u_mouse;
  uniform vec2 u_resolution;
  uniform vec3 u_color;
  uniform float u_time;
  uniform sampler2D u_texture;
  uniform sampler2D u_back_world_positions;

  varying vec3 worldNormal;
  varying vec3 eyeVector;
  varying vec3 refraction;
  varying vec4 worldPos;

  vec3 diagonal(mat3 matrix) {
    return vec3(matrix[0][0], matrix[1][1], matrix[2][2]);
  }
  
  vec3 sat(vec3 rgb, float intensity) {
    vec3 L = vec3(0.2125, 0.7154, 0.0721);
    vec3 grayscale = vec3(dot(rgb, L));
    return mix(grayscale, rgb, intensity);
  }

  float fresnel() {
    float fresnelFactor = abs(dot(eyeVector, worldNormal));
    float inverseFresnelFactor = 1.0 - fresnelFactor;

    return pow(inverseFresnelFactor, u_fresnel_exp);
  }

  float specular() {
    vec3 halfVector = normalize(eyeVector + u_light);

    float NdotL = dot(worldNormal, u_light);
    float NdotH =  dot(worldNormal, halfVector);
    float NdotH2 = NdotH * NdotH;

    float kDiffuse = max(0.0, NdotL);
    float kSpecular = pow(NdotH2, u_shininess);

    return kSpecular + kDiffuse * u_diffuseness;
  }
  
  void main() {
    vec3 color = vec3(0.0);
    vec2 uv = gl_FragCoord.xy / u_resolution;

    vec3 backPos = texture(u_back_world_positions, uv).xyz;
    vec3 frontPos = worldPos.xyz;
    float depth = length(frontPos - backPos) * u_chromatic_aberration;

    // gl_FragColor = vec4(depth, depth, depth, 1.0);

    // vec3 refractRGB = 
    //   refract(eyeVector, worldNormal, u_dir / u_incidence) * u_refract_power * u_chromatic_aberration;

    // refractRGB = (viewMatrix * vec4(refractRGB, 1.0)).rgb;

    /////////
    vec3 rgb = texture(u_texture, uv + refraction.xy * depth).rgb;

    color += rgb;
    // color = sat(color, u_saturation);
    color += specular();
    color.rgb += vec3(fresnel());

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

const positionVertex = `
  varying vec4 worldPos;
  void main() {
    worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
  }`;
const positionFragment = `
  varying vec4 worldPos;
  void main() {
    gl_FragColor = vec4(worldPos.xyz, 1.0);
  }
`;

const cloudsVertex = `
  varying vec4 worldPos;
  varying vec3 eyeVector;
  void main() {
    worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    eyeVector = normalize(worldPos.xyz - cameraPosition);
  }`;
const cloudsFragment = `
  precision mediump sampler3D;
  
  uniform vec2 u_mouse;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform mat4 u_prism_matrix;
  uniform sampler3D u_texture_3d;
  uniform sampler2D u_back_world_positions;

  varying vec4 worldPos;
  varying vec3 eyeVector;

  #define SAMPLES 20.0

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec3 backPos = texture(u_back_world_positions, uv).xyz;
    vec3 frontPos = worldPos.xyz;
    vec3 step = eyeVector / SAMPLES;
    vec3 totalMarch = backPos - frontPos;
    float totalLength = length(totalMarch);

    vec4 color = vec4(0.0);
    for (vec3 marcher = vec3(0.0); length(marcher) < totalLength; marcher += step) {
      vec4 pos = u_prism_matrix * vec4(marcher + frontPos, 1.0) + 0.5;
      color += texture(u_texture_3d, pos.xyz);
    }
    color /= SAMPLES * 6.0;

    gl_FragColor = color;
  }
`;

let texture3D;
{
  // create a buffer with some data
  const sizeX = 128;
  const sizeY = 128;
  const sizeZ = 128;

  const data = new Uint8Array(sizeX * sizeY * sizeZ * 4);
  let i = 0;

  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        data[i++] = 0xff - (Math.abs(x - 64) << 2);
        data[i++] = 0xff - (Math.abs(y - 64) << 2);
        data[i++] = 0xff - (Math.abs(z - 64) << 2);
        data[i++] = Math.max(data[i], data[i - 1], data[i - 2]);
      }
    }
  }

  // use the buffer to create the texture
  texture3D = new THREE.Data3DTexture(data, sizeX, sizeY, sizeZ);
  texture3D.format = THREE.RGBAFormat;
  texture3D.needsUpdate = true;
}

let hslTexture3D;
{
  const hue2rgb = function (p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hsl2rgb = function (h, s, l) {
    let r, g, b;

    if (s == 0) {
      // achromatic (grey)
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r, g, b].map((x) => Math.round(x * 255));
  };
  // create a buffer with some data
  const sizeX = 128;
  const sizeY = 128;
  const sizeZ = 128;

  const data = new Uint8Array(sizeX * sizeY * sizeZ * 4);
  let i = 0;

  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        let [r, g, b] = hsl2rgb(x / sizeX, y / sizeY, z / sizeZ);
        data[i++] = r;
        data[i++] = g;
        data[i++] = b;
        data[i++] = 255;
      }
    }
  }

  // use the buffer to create the texture
  hslTexture3D = new THREE.Data3DTexture(data, sizeX, sizeY, sizeZ);
  hslTexture3D.format = THREE.RGBAFormat;
  hslTexture3D.needsUpdate = true;
}

let defaultBackgroundPositionTexture;
{
  const data = new Float32Array(4);

  data[0] = -8;
  data[1] = -8;
  data[2] = -25;

  defaultBackgroundPositionTexture = new THREE.DataTexture(data, 1, 1);
  //   ,
  //   THREE.ClampToEdgeWrapping,
  //   THREE.ClampToEdgeWrapping,
  //   THREE.NearestFilter,
  //   THREE.NearestFilter,
  //   THREE.RGBAFormat,
  //   THREE.FloatType
  // );
  defaultBackgroundPositionTexture.type = THREE.FloatType;
  defaultBackgroundPositionTexture.needsUpdate = true;
}

const pointer = new THREE.Vector2();
const cloudsUniforms = {
  u_resolution: { value: { x: null, y: null } },
  u_time: { value: 0.0 },
  u_mouse: { value: pointer },
  u_texture_3d: { value: texture3D },
  u_prism_matrix: { value: new THREE.Matrix4() },
  u_back_world_positions: { value: null },
};

const glassUniforms = {
  u_resolution: { value: { x: null, y: null } },
  u_time: { value: 0.0 },
  u_mouse: { value: pointer },
  u_texture: { value: null },
  u_back_world_positions: { value: null },
  u_near: { value: null },
  u_far: { value: null },
  u_incidence: { value: 1.18 },
  u_chromatic_aberration: { value: 0.05 },
  u_refract_power: { value: 0.08 },
  u_saturation: { value: 1.07 },
  u_light: { value: new THREE.Vector3(1, -1, -1).normalize() },
  u_diffuseness: { value: 0.2 },
  u_shininess: { value: 40 },
  u_fresnel_exp: { value: 8 },
  u_dir: { value: 1 },
};

class MainScene extends Scene3D {
  bufferTarget1 = new THREE.WebGLRenderTarget();
  bufferTarget2 = new THREE.WebGLRenderTarget();
  bufferTarget3 = new THREE.WebGLRenderTarget();

  constructor() {
    super("MainScene");
  }

  async init() {
    this.bgTexture = new THREE.TextureLoader().load("assets/dots.png");
    this.bgTexture.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = this.bgTexture;
    this.bufferTarget3.texture.type = THREE.FloatType;

    // const prismGeometry = new THREE.BoxGeometry(3, 3, 10);
    const prismGeometry = createRoundedBox(3, 3, 10, 0.5, 36);

    this.glass = new THREE.ShaderMaterial({
      vertexShader: glassVertex,
      fragmentShader: glassFragment,
      uniforms: glassUniforms,
    });

    this.clouds = new THREE.ShaderMaterial({
      vertexShader: cloudsVertex,
      fragmentShader: cloudsFragment,
      uniforms: cloudsUniforms,
      transparent: true,
    });

    this.worldPositionMaterial = new THREE.ShaderMaterial({
      vertexShader: positionVertex,
      fragmentShader: positionFragment,
      side: THREE.BackSide,
    });

    this.prism = new THREE.Mesh(prismGeometry, this.glass);

    this.physicsPrism = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 10),
      new THREE.MeshBasicMaterial()
    );
    this.physicsPrism.clock = new THREE.Clock();

    // this.unitCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.clouds);

    this.reset();

    document.addEventListener("mousemove", (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    const raycaster = new THREE.Raycaster();
    this.renderer.domElement.addEventListener("pointerdown", () => {
      raycaster.setFromCamera(pointer, this.camera);
      const [intersect] = raycaster.intersectObject(this.prism);
      if (intersect) {
        const pos = intersect.point.sub(this.prism.position);
        this.physicsPrism.throwFrom = pos;
        this.physicsPrism.clock.start();
      }
    });
    this.renderer.domElement.addEventListener("pointerup", () => {
      if (this.physicsPrism.throwFrom) {
        const duration = this.physicsPrism.clock.getElapsedTime();
        const pos = this.physicsPrism.throwFrom;
        this.physicsPrism.body.applyImpulse({ y: duration * 6 + 2 }, pos);
      }
      this.physicsPrism.throwFrom = null;
    });

    window.addEventListener("resize", () => this.onResize());
    this.onResize();

    this.gui();
  }

  async create() {
    const { ground } = await this.warpSpeed("ground", "light", "orbitControls");
    ground.material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      opacity: 0.05,
      transparent: true,
    });
    ground.visible = false;

    this.physics.add.existing(this.physicsPrism);

    this.physicsPrism.body.setBounciness(0.2);
    this.physicsPrism.body.setFriction(0.8);
    this.physicsPrism.body.setVelocityY(-5);

    this.scene.add(this.prism);
    // this.scene.add(this.unitCube);

    this.camera.position.set(8, 8, 25);
    // this.camera.position.set(0, 0, 3);
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    glassUniforms.u_near.value = this.camera.near;
    glassUniforms.u_far.value = this.camera.far;
  }

  update() {
    this.prism.position.copy(this.physicsPrism.position);
    this.prism.rotation.copy(this.physicsPrism.rotation);
    this.prism.updateMatrix();
  }

  preRender() {
    // this.prism.material = this.worldPositionMaterial;
    // this.renderer.setRenderTarget(this.bufferTarget3);
    // this.renderer.render(this.scene, this.camera);

    // cloudsUniforms.u_back_world_positions.value = this.bufferTarget3.texture;
    // cloudsUniforms.u_prism_matrix.value
    //   .compose(
    //     this.prism.position,
    //     this.prism.quaternion,
    //     new THREE.Vector3(3, 3, 10)
    //   )
    //   .invert();

    // this.prism.geometry.clearGroups();
    // this.prism.geometry.addGroup(0, Infinity, 0);
    // this.prism.material = this.clouds;
    // this.clouds.needsUpdate = true;
    // this.renderer.setRenderTarget(null);

    glassUniforms.u_time.value = this.clock.getElapsedTime();
    this.prism.visible = false;
    this.renderer.setRenderTarget(this.bufferTarget1);
    this.renderer.render(this.scene, this.camera);

    this.prism.visible = true;
    this.prism.geometry.clearGroups();
    this.prism.geometry.addGroup(0, Infinity, 0);
    this.prism.material = this.worldPositionMaterial;
    this.renderer.setRenderTarget(this.bufferTarget3);
    this.renderer.render(this.scene, this.camera);

    glassUniforms.u_dir.value = -1;
    glassUniforms.u_texture.value = this.bufferTarget1.texture;
    glassUniforms.u_back_world_positions.value =
      defaultBackgroundPositionTexture;
    cloudsUniforms.u_back_world_positions.value = this.bufferTarget3.texture;

    this.scene.background = null;
    cloudsUniforms.u_prism_matrix.value
      .compose(
        this.prism.position,
        this.prism.quaternion,
        new THREE.Vector3(3, 3, 10)
      )
      .invert();
    this.prism.geometry.clearGroups();
    this.prism.geometry.addGroup(0, Infinity, 0);
    this.prism.geometry.addGroup(0, Infinity, 1);
    this.prism.material = [this.glass, this.clouds];
    this.glass.side = THREE.BackSide;
    this.renderer.setRenderTarget(this.bufferTarget2);
    this.renderer.render(this.scene, this.camera);

    glassUniforms.u_dir.value = 1;
    glassUniforms.u_texture.value = this.bufferTarget2.texture;
    glassUniforms.u_back_world_positions.value = this.bufferTarget3.texture;
    this.glass.side = THREE.FrontSide;
    this.prism.geometry.clearGroups();
    this.prism.geometry.addGroup(0, Infinity, 0);
    this.prism.material = this.glass;
    this.glass.needsUpdate = true;
    this.scene.background = null;
    this.renderer.setRenderTarget(null);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio;
    glassUniforms.u_resolution.value.x = w * dpr;
    glassUniforms.u_resolution.value.y = h * dpr;
    cloudsUniforms.u_resolution.value.x = w * dpr;
    cloudsUniforms.u_resolution.value.y = h * dpr;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(dpr);
    this.bufferTarget1.setSize(w * dpr, h * dpr);
    this.bufferTarget2.setSize(w * dpr, h * dpr);
    this.bufferTarget3.setSize(w * dpr, h * dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    const p = this.physicsPrism;
    p.position.set(0, 10, 0);
    p.rotation.set(Math.PI / 6, Math.PI / 4, -0.01);

    if (!p.body) return;
    p.body.setCollisionFlags(2);
    p.body.needUpdate = true;
    p.body.once.update(() => {
      p.body.setCollisionFlags(0);
      p.body.setVelocity(0, -5, 0);
      p.body.setAngularVelocity(0, 0, 0);
    });
  }

  gui() {
    let gui = new lilGui();

    let ctrl = gui.add(glassUniforms.u_chromatic_aberration, "value");
    ctrl.name("Chromatic aberration");
    ctrl.min(0).max(1).step(0.01);

    ctrl = gui.add(glassUniforms.u_refract_power, "value");
    ctrl.name("Refract exponent");
    ctrl.min(0).max(1).step(0.01);

    ctrl = gui.add(glassUniforms.u_saturation, "value");
    ctrl.name("Saturation gain/loss");
    ctrl.min(0.8).max(1.2).step(0.01);

    ctrl = gui.add(glassUniforms.u_diffuseness, "value");
    ctrl.name("Diffuseness");
    ctrl.min(0).max(1).step(0.1);

    ctrl = gui.add(glassUniforms.u_shininess, "value");
    ctrl.name("Shininess");
    ctrl.min(0).max(50).step(1);

    ctrl = gui.add(glassUniforms.u_fresnel_exp, "value");
    ctrl.name("Fresnel");
    ctrl.min(0).max(20).step(1);

    ctrl = gui.add(glassUniforms.u_incidence, "value").name("Refractive index");
    ctrl.min(1).max(1.5).step(0.01);

    gui.add(this, "reset").name("Reset");
  }
}

// set your project configs
const config = {
  gravity: { x: 0, y: -9.81, z: 0 },
  scenes: [MainScene],
  antialias: true,
};

// load the ammo.js file from the /lib folder and start the project
PhysicsLoader("./", () => new Project(config));

function createRoundedBox(width, height, depth, radius0, smoothness) {
  let shape = new THREE.Shape();
  let eps = 0.00001;
  let radius = radius0 - eps;
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, height - radius * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(
    width - radius * 2,
    height - radius * 2,
    eps,
    Math.PI / 2,
    0,
    true
  );
  shape.absarc(width - radius * 2, eps, eps, 0, -Math.PI / 2, true);
  let geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: smoothness * 2,
    bevelSize: radius,
    bevelThickness: radius0,
    curveSegments: smoothness,
  });

  geometry.center();

  return geometry;
}
