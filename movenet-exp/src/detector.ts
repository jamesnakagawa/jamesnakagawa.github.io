import {
  Keypoint,
  HandDetector,
  createDetector,
  SupportedModels,
} from "@tensorflow-models/hand-pose-detection";

let last: Keypoint[] = [];
const fingers = "index_finger middle_finger ring_finger pinky".split(" ");
const fingertips = fingers.map((f) => `${f}_tip`);

export async function init(): Promise<HandDetector> {
  // const detectorConfig: poseDetection.MoveNetModelConfig = {
  //   modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  //   enableSmoothing: true,
  // };
  // const detector = await poseDetection.createDetector(
  //   poseDetection.SupportedModels.MoveNet,
  //   detectorConfig
  // );

  const handDetectorConfig = {
    runtime: "mediapipe" as const,
    modelType: "lite" as const,
    solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands/",
  };
  return await createDetector(
    SupportedModels.MediaPipeHands,
    handDetectorConfig
  );
}

export const getVelocities = (
  width: number,
  height: number,
  fingers: Keypoint[]
) => {
  let retval: {
    [key: string]: {
      delta: { x: number; y: number };
      point: { x: number; y: number };
    };
  } = {};
  for (const fingertip of fingertips) {
    const newCoord = fingers.find((f) => f.name == fingertip);
    const oldCoord = last.find((f) => f.name == fingertip);
    if (newCoord && oldCoord) {
      const delta = {
        x: (newCoord.x - oldCoord.x) / width,
        y: (newCoord.y - oldCoord.y) / height,
      };
      retval[fingertip] = { delta, point: newCoord };
    }
  }
  last = fingers;
  return retval;
};
