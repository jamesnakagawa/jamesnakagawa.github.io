import "enable3d";
import lilGui from "lilGui";
const { THREE, Scene3D, PhysicsLoader, Project } = ENABLE3D;

const vShader = `
  varying vec3 worldNormal;
  varying vec3 eyeVector;
  void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
      eyeVector = normalize(worldPos.xyz - cameraPosition);
      vec3 transformedNormal = normalMatrix * normal;
      worldNormal = normalize(transformedNormal);
  }`;
const fShader = `
  uniform vec3 u_incidence1;
  uniform vec3 u_incidence2;
  uniform vec3 u_light;
  uniform float u_saturation;
  uniform float u_chromatic_aberration;
  uniform float u_refract_power;
  uniform float u_shininess;
  uniform float u_diffuseness;
  uniform float u_fresnel_exp;
  uniform float u_dir;

  uniform vec2 u_mouse;
  uniform vec2 u_resolution;
  uniform vec3 u_color;
  uniform float u_time;
  uniform sampler2D u_texture;

  varying vec3 worldNormal;
  varying vec3 eyeVector;

  #define LOOP 20

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

    mat3 invertMixColor = mat3(-1.0, 2.0, 2.0, 2.0, -1.0, 2.0, 2.0, 2.0, -1.0) / 3.0;
    vec3 slideOffset = vec3(1.0, 2.0, 3.0);
    vec3 slideOffset2 = vec3(2.5, 1.0, 1.0);

    mat3 refractRGB = mat3(
      refract(eyeVector, worldNormal, u_dir / u_incidence1.x),
      refract(eyeVector, worldNormal, u_dir / u_incidence1.y),
      refract(eyeVector, worldNormal, u_dir / u_incidence1.z)
    );
    mat3 refractCMY = mat3(
      refract(eyeVector, worldNormal, u_dir / u_incidence2.x),
      refract(eyeVector, worldNormal, u_dir / u_incidence2.y),
      refract(eyeVector, worldNormal, u_dir / u_incidence2.z)
    );

    #pragma unroll_loop_start
    for ( int i = 0; i < LOOP; i ++ ) {
      float slide = float(i) / float(LOOP) * 0.1;
      vec3 rFactorRGB = ((slideOffset * slide) + u_refract_power) * u_chromatic_aberration;
      vec3 rFactorCMY = ((slideOffset2 * slide) + u_refract_power) * u_chromatic_aberration;

      vec3 rgb = 
        diagonal(
          mat3(
            texture(u_texture, uv + refractRGB[0].xy * rFactorRGB.r),
            texture(u_texture, uv + refractRGB[1].xy * rFactorRGB.g),
            texture(u_texture, uv + refractRGB[2].xy * rFactorRGB.b)
          )
        );

      vec3 rgbFromCMY = 
        invertMixColor *
        diagonal(
          invertMixColor * 
          mat3(
            texture(u_texture, uv + refractCMY[0].xy * rFactorCMY.x).rgb,
            texture(u_texture, uv + refractCMY[1].xy * rFactorCMY.y).rgb,
            texture(u_texture, uv + refractCMY[2].xy * rFactorCMY.z).rgb
          )
        );

      color += (rgb + rgbFromCMY) / 2.0;
      color = sat(color, u_saturation);
    }
    #pragma unroll_loop_send

    color /= float(LOOP);
    color += specular();
    color.rgb += vec3(fresnel());

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

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

const pointer = new THREE.Vector2();
const uniforms = {
  u_resolution: { value: { x: null, y: null } },
  u_time: { value: 0.0 },
  u_mouse: { value: pointer },
  u_texture: { value: null },
  u_incidence1: { value: { x: 1.15, y: 1.16, z: 1.18 } },
  u_incidence2: { value: { x: 1.22, y: 1.22, z: 1.22 } },
  u_chromatic_aberration: { value: 0.2 },
  u_refract_power: { value: 0.4 },
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

  constructor() {
    super("MainScene");
  }

  async init() {
    this.bgTexture = new THREE.TextureLoader().load("assets/dots.png");
    this.bgTexture.mapping = THREE.EquirectangularReflectionMapping;

    const prismGeometry = createRoundedBox(3, 3, 10, 0.5, 36);
    const glass = (this.glass = new THREE.ShaderMaterial({
      vertexShader: vShader,
      fragmentShader: fShader,
      uniforms,
    }));

    this.prism = new THREE.Mesh(prismGeometry, glass);

    const physicsGeometry = new THREE.BoxGeometry(3, 3, 10);
    this.physicsPrism = new THREE.Mesh(
      physicsGeometry,
      new THREE.MeshBasicMaterial()
    );
    this.physicsPrism.clock = new THREE.Clock();

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

    // this.physics.debug.enable();
    this.physics.add.existing(this.physicsPrism);

    this.physicsPrism.body.setBounciness(0.2);
    this.physicsPrism.body.setFriction(0.8);
    this.physicsPrism.body.setVelocityY(-5);

    this.scene.add(this.prism);

    this.camera.position.set(8, 8, 25);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
  }

  update() {
    this.prism.position.copy(this.physicsPrism.position);
    this.prism.rotation.copy(this.physicsPrism.rotation);
    this.prism.updateMatrix();
  }

  preRender() {
    uniforms.u_time.value = this.clock.getElapsedTime();
    this.prism.visible = false;
    this.scene.background = this.bgTexture;
    this.renderer.setRenderTarget(this.bufferTarget1);
    this.renderer.render(this.scene, this.camera);

    uniforms.u_dir.value = -1;
    uniforms.u_texture.value = this.bufferTarget1.texture;
    this.prism.visible = true;
    this.glass.side = THREE.BackSide;
    this.renderer.setRenderTarget(this.bufferTarget2);
    this.renderer.render(this.scene, this.camera);

    uniforms.u_dir.value = 1;
    uniforms.u_texture.value = this.bufferTarget2.texture;
    this.glass.side = THREE.FrontSide;
    this.scene.background = null;
    this.renderer.setRenderTarget(null);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    uniforms.u_resolution.value.x = w * window.devicePixelRatio;
    uniforms.u_resolution.value.y = h * window.devicePixelRatio;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.bufferTarget1.setSize(w, h);
    this.bufferTarget2.setSize(w, h);
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

    let ctrl = gui.add(uniforms.u_chromatic_aberration, "value");
    ctrl.name("Chromatic aberration");
    ctrl.min(0).max(1).step(0.01);

    ctrl = gui.add(uniforms.u_refract_power, "value");
    ctrl.name("Refract exponent");
    ctrl.min(0).max(1).step(0.01);

    ctrl = gui.add(uniforms.u_saturation, "value");
    ctrl.name("Saturation gain/loss");
    ctrl.min(0.8).max(1.2).step(0.01);

    ctrl = gui.add(uniforms.u_diffuseness, "value");
    ctrl.name("Diffuseness");
    ctrl.min(0).max(1).step(0.1);

    ctrl = gui.add(uniforms.u_shininess, "value");
    ctrl.name("Shininess");
    ctrl.min(0).max(50).step(1);

    ctrl = gui.add(uniforms.u_fresnel_exp, "value");
    ctrl.name("Fresnel");
    ctrl.min(0).max(20).step(1);

    gui.add(this, "reset").name("Reset");

    const refraction = gui.addFolder("Refractive indices");

    ctrl = refraction.add(uniforms.u_incidence1.value, "x").name("R");
    ctrl.min(1).max(1.5).step(0.01);
    ctrl = refraction.add(uniforms.u_incidence2.value, "z").name("Y");
    ctrl.min(1).max(1.5).step(0.01);
    ctrl = refraction.add(uniforms.u_incidence1.value, "y").name("G");
    ctrl.min(1).max(1.5).step(0.01);
    ctrl = refraction.add(uniforms.u_incidence2.value, "x").name("C");
    ctrl.min(1).max(1.5).step(0.01);
    ctrl = refraction.add(uniforms.u_incidence1.value, "z").name("B");
    ctrl.min(1).max(1.5).step(0.01);
    ctrl = refraction.add(uniforms.u_incidence2.value, "y").name("M");
    ctrl.min(1).max(1.5).step(0.01);
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
