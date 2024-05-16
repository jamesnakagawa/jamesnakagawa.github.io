import * as WGPU from "./wgpu";
import quadShaderCode from "./quad.wgsl?raw";
import agentShaderCode from "./agents.wgsl?raw";

export async function init(
  width: number,
  height: number,
  context: GPUCanvasContext
) {
  const initColorBuffer = (device: GPUDevice) => {
    const count = width * height;
    const stride = 4;
    const colors = new Float32Array(count * stride);
    // for (let i = 0; i < count; i++) {
    //   colors[i * stride + 0] = 0;
    //   colors[i * stride + 1] = 0;
    //   colors[i * stride + 2] = 0;
    //   colors[i * stride + 3] = 0;
    // }

    const buffer = device.createBuffer({
      size: colors.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });

    new Float32Array(buffer.getMappedRange()).set(colors);
    buffer.unmap();
    return buffer;
  };

  const uniforms = new Float32Array([width, height, 3, 0]);
  const initUniformBuffer = (device: GPUDevice) => {
    const buffer = device.createBuffer({
      size: uniforms.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(buffer.getMappedRange()).set(uniforms);
    buffer.unmap();
    return buffer;
  };

  const agents = new Float32Array(
    Array.from(new Array(256 * 2)).map((x) => -1)
  );
  let currentAgentsLength = 0;
  const initAgentsBuffer = (device: GPUDevice) => {
    const buffer = device.createBuffer({
      size: agents.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(buffer.getMappedRange()).set(agents);
    buffer.unmap();
    return buffer;
  };

  const adapter = (await navigator.gpu.requestAdapter())!;
  const hasBGRA8unormStorage = adapter.features.has("bgra8unorm-storage");
  const device = await adapter.requestDevice({
    requiredFeatures: hasBGRA8unormStorage ? ["bgra8unorm-storage"] : [],
  })!;
  const format = hasBGRA8unormStorage
    ? navigator.gpu.getPreferredCanvasFormat()
    : "rgba8unorm";

  let adjustedAgentShaderCode = agentShaderCode;
  if (hasBGRA8unormStorage) {
    adjustedAgentShaderCode = agentShaderCode.replace(
      "@group(0) @binding(3) var outTex : texture_storage_2d<rgba8unorm, write>;",
      "@group(0) @binding(3) var outTex : texture_storage_2d<bgra8unorm, write>;"
    );
  }

  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  const colorBuffer = initColorBuffer(device);
  const uniformBuffer = initUniformBuffer(device);
  const agentsBuffer = initAgentsBuffer(device);

  const outTexture = device.createTexture({
    size: {
      width,
      height,
    },
    format,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const visibility = GPUShaderStage.COMPUTE;

  const agentsBufferLayout = device.createBindGroupLayout({
    label: "agentsLayout",
    entries: [
      { visibility, binding: 0, buffer: { type: "uniform" } },
      { visibility, binding: 1, buffer: { type: "storage" } },
      { visibility, binding: 2, buffer: { type: "storage" } },
    ],
  });

  const shaderModule = await WGPU.createShaderModule(
    device,
    adjustedAgentShaderCode,
    "agents.wgsl"
  );
  const compute = device.createComputePipeline({
    label: "AgentsPipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [agentsBufferLayout],
    }),
    compute: {
      module: shaderModule,
      entryPoint: "compute",
    },
  });

  const computeBindGroup = await device.createBindGroup({
    layout: compute.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          size: uniformBuffer.size,
          offset: 0,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: colorBuffer,
          size: colorBuffer.size,
          offset: 0,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: agentsBuffer,
          size: agentsBuffer.size,
          offset: 0,
        },
      },
    ],
  });

  const copyBufferLayout = device.createBindGroupLayout({
    label: "copyLayout",
    entries: [
      { visibility, binding: 0, buffer: { type: "uniform" } },
      { visibility, binding: 1, buffer: { type: "storage" } },
      {
        visibility,
        binding: 3,
        storageTexture: { format },
      },
    ],
  });

  const copy = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [copyBufferLayout],
    }),
    compute: {
      module: shaderModule,
      entryPoint: "copy",
    },
  });
  const copyBindGroup = await device.createBindGroup({
    layout: copy.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          size: uniformBuffer.size,
          offset: 0,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: colorBuffer,
          size: colorBuffer.size,
          offset: 0,
        },
      },
      { binding: 3, resource: outTexture.createView() },
    ],
  });

  try {
    let error = await device.popErrorScope();
    if (error) {
      throw new Error(`Could not create bind group: ${error.message}`);
    }
  } catch (e) {
    console.warn(e);
  }

  // const resetBufferLayout = wgpu.createBindGroupLayout({
  //   entries: [
  //     { visibility, binding: 0, buffer: { type: "uniform" } },
  //     { visibility, binding: 1, buffer: { type: "storage" } },
  //   ],
  // });
  // const reset = await wgpu.createComputePipeline(
  //   "dof.wgsl",
  //   "reset",
  //   resetBufferLayout
  // );
  // const resetBindGroup = await wgpu.createBindGroup({
  //   pipeline: reset,
  //   group: 0,
  //   bindings: [uniformBuffer, colorBuffer],
  // });

  const quadShader = await WGPU.createShaderModule(
    device,
    quadShaderCode,
    "quad.wgsl"
  );

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: quadShader,
      entryPoint: "vert",
    },
    fragment: {
      module: quadShader,
      entryPoint: "frag",
      targets: [
        {
          format,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const planeBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: device.createSampler({
          magFilter: "nearest",
          minFilter: "nearest",
        }),
      },
      {
        binding: 1,
        resource: outTexture.createView(),
      },
    ],
  });

  return {
    addAgent(x: number, y: number) {
      agents.set([x, y], currentAgentsLength++);
      device.queue.writeBuffer(agentsBuffer, 0, agents);
    },
    run() {
      const encoder = device.createCommandEncoder();

      let computePass = encoder.beginComputePass();
      computePass.setPipeline(compute);
      computePass.setBindGroup(0, computeBindGroup);
      computePass.dispatchWorkgroups(Math.ceil(agents.length / 64), 1, 1);
      computePass.end();

      computePass = encoder.beginComputePass();
      computePass.setPipeline(copy);
      computePass.setBindGroup(0, copyBindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(width / 16),
        Math.ceil(height / 16),
        1
      );
      computePass.end();

      const renderPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, planeBindGroup);
      renderPass.draw(6, 1, 0, 0);
      renderPass.end();

      // GO!
      device.queue.submit([encoder.finish()]);

      uniforms[2]++; // update frame
      device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    },
  };
}
