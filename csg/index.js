import lilGui from "lilGui";
import * as THREE from "three";
import QuadMesh from "three/addons/objects/QuadMesh.js";
import { vertex, fragment } from "./raymarcher.glsl.js";

function addRGB(vec) {
  Object.defineProperties(vec, {
    r: {
      enumerable: false,
      get() {
        return vec.x;
      },
      set(r) {
        vec.x = r;
      },
    },
    g: {
      enumerable: false,
      get() {
        return vec.y;
      },
      set(g) {
        vec.y = g;
      },
    },
    b: {
      enumerable: false,
      get() {
        return vec.z;
      },
      set(b) {
        vec.z = b;
      },
    },
  });
  return vec;
}

function hexToRGB(hex) {
  const rgb = parseInt(hex, 16);
  const r = ((rgb >> 16) & 0xff) / 0xff;
  const g = ((rgb >> 8) & 0xff) / 0xff;
  const b = (rgb & 0xff) / 0xff;
  return new THREE.Vector3(r, g, b);
}

const pointer = new THREE.Vector2();
const color1 = addRGB(hexToRGB`97a00d`);
const color2 = addRGB(hexToRGB`a77291`);
const color3 = addRGB(hexToRGB`a16c26`);

const uniforms = {
  u_resolution: { value: { x: null, y: null } },
  u_time: { value: 0.0 },
  u_mouse: { value: pointer },
  u_sin_base: { value: 2 },
  u_sin_min: { value: 4 },
  u_sin_max: { value: 15 },
  u_color1: { value: color1 },
  u_color2: { value: color2 },
  u_color3: { value: color3 },
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1);
camera.position.z = 1;
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer();
const clock = new THREE.Clock();

document.body.appendChild(renderer.domElement);

const quad = new QuadMesh(
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
  })
);
quad.position.set(0, 0, 0);

console.log(quad);
scene.add(quad);

document.addEventListener("mousemove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener("resize", onResize);
onResize();

function draw() {
  requestAnimationFrame(draw);
  uniforms.u_time.value = clock.getElapsedTime();
  renderer.render(scene, camera);
}
draw();

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  uniforms.u_resolution.value.x = w * window.devicePixelRatio;
  uniforms.u_resolution.value.y = h * window.devicePixelRatio;
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  // camera.aspect = w / h;
  // camera.updateProjectionMatrix();
}

function gui() {
  let gui = new lilGui();

  let ctrl = gui.add(uniforms.u_sin_base, "value");
  ctrl.name("Sine base");
  ctrl.min(0).max(2).step(0.1);

  ctrl = gui.add(uniforms.u_sin_min, "value");
  ctrl.name("Sine min height");
  ctrl.min(0).max(10).step(0.1);

  ctrl = gui.add(uniforms.u_sin_max, "value");
  ctrl.name("Sine max height");
  ctrl.min(0).max(20).step(0.1);

  ctrl = gui.addColor(uniforms.u_color1, "value");
  ctrl.name("Color 1");

  ctrl = gui.addColor(uniforms.u_color2, "value");
  ctrl.name("Color 2");

  ctrl = gui.addColor(uniforms.u_color3, "value");
  ctrl.name("Color 3");
}
gui();
