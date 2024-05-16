// import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgpu";
import * as HandDectection from "./detector";
import * as Agents from "./agents";

tf.setBackend("webgpu");

const S = {
  width: 640,
  height: 360,
  frame: 0,
};

const vgaConstraints = {
  video: {
    width: { exact: S.width },
    height: { exact: S.height },
  },
};

function createDrawingContext(parent: Element) {
  const canvas = document.createElement("canvas");
  canvas.width = vgaConstraints.video.width.exact;
  canvas.height = vgaConstraints.video.height.exact;
  canvas.style.position = "absolute";
  canvas.style.left = "-320px";
  canvas.style.top = "-160px";
  parent.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  // mirror mode, flip horizontal
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  return ctx;
}

function createGPUContext(parent: Element) {
  const canvas = document.createElement("canvas");
  canvas.width = vgaConstraints.video.width.exact;
  canvas.height = vgaConstraints.video.height.exact;
  canvas.style.position = "absolute";
  canvas.style.left = "-320px";
  canvas.style.top = "-160px";
  parent.appendChild(canvas);
  const ctx = canvas.getContext("webgpu")!;
  return ctx;
}

(async function () {
  try {
    const localMediaStream = await navigator.mediaDevices.getUserMedia(
      vgaConstraints
    );
    const video = document.querySelector("video")!;
    video.srcObject = localMediaStream;
    video.style.display = "none";

    const mainDiv = document.querySelector("main")!;
    const videoImage = createDrawingContext(mainDiv);
    const overlayCanvas = createGPUContext(mainDiv);
    const detector = await HandDectection.init();
    const agents = await Agents.init(S.width, S.height, overlayCanvas);

    async function draw() {
      // const poses = await detector.estimatePoses(video);
      const hands = await detector.estimateHands(video);

      videoImage.drawImage(
        video,
        0,
        0,
        S.width,
        S.height,
        0,
        0,
        S.width,
        S.height
      );

      // for (const pose of poses) {
      //   for (const point of pose.keypoints) {
      //     if (point.score! > 0.3) {
      //       // do stuff here
      //     }
      //   }
      // }

      let hand = hands[0] || { keypoints: [] };
      let velocities = HandDectection.getVelocities(
        S.width,
        S.height,
        hand.keypoints
      );

      for (let velocity of Object.values(velocities)) {
        const lengthSq = velocity.delta.x ** 2 + velocity.delta.y ** 2;
        const isUp = velocity.delta.y < 0;
        if (lengthSq > 0.08 ** 2 && isUp) {
          agents.addAgent(S.width - velocity.point.x, velocity.point.y);
        }
      }

      agents.run();

      requestAnimationFrame(draw);
    }
    draw();
  } catch (error) {
    console.log("Rejected!", error);
  }
})();
