// wgpu.js
// Copyright 2023 Notochord

// The WebGPU API is quite verbose.
// For beginners, this verbosity can make it hard to see
// the overall structure.

// For example, setting a bind group with 3 entries could
// take up 75% of the screen height on a laptop.

// This makes it hard for beginners to develop
// a mental model of what is happening, since they have
// to keep more state in their head.

// This file defines some terse wrappers around the WebGPU API.
// The wrappers stick to webgpu terminology but allow
// students to use much less code when creating 2d sims.

const setupWebGPU = async (width, height) => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  ///////////////////////
  // Initial setup of device and canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const context = canvas.getContext("webgpu");
  const format = "bgra8unorm";
  context.configure({
    device,
    format: format,
    alphaMode: "premultiplied",
  });

  ///////////////////////
  // Compile a shader and handle any errors
  const createShaderModule = async (code, file) => {
    const module = device.createShaderModule({ code: code });

    const info = await module.getCompilationInfo();
    if (info.messages.length > 0) {
      for (let message of info.messages) {
        console.warn(
          `${message.message} 
    at ${file} line ${message.lineNum}`
        );
      }
      throw new Error(`Could not compile ${file}`);
    }

    return module;
  };

  ///////////////////////
  // Allocate a rgba texture
  const createTexture = (width, height, usage) => {
    usage ||=
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT;

    return device.createTexture({
      size: {
        width: width,
        height: height,
      },
      format: "rgba8unorm",
      usage: usage,
    });
  };

  ///////////////////////
  // Allocate and set a buffer
  const createAndSetBuffer = (data, usage) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    });

    if (data instanceof Float32Array) {
      new Float32Array(buffer.getMappedRange()).set(data);
    } else if (data instanceof Uint8Array) {
      new Uint8Array(buffer.getMappedRange()).set(data);
    } else {
      console.log("unknown type", data);
    }
    buffer.unmap();
    return buffer;
  };

  const createBindGroupLayout = (params) => {
    return device.createBindGroupLayout(params);
  };

  ///////////////////////
  // Create a compute pipeline given a WGSL file and entry function
  const createComputePipeline = async (file, fn, layout) => {
    const code = await load(file);
    const sm = await createShaderModule(code, file);
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: {
        module: sm,
        entryPoint: fn,
      },
    });
    return computePipeline;
  };

  ///////////////////////
  // Create a bind group given an array of bindings
  // handles errors
  const createBindGroup = async (settings) => {
    device.pushErrorScope("validation");

    const entries = [];
    for (let i = 0; i < settings.bindings.length; i++) {
      let entry = settings.bindings[i];

      let resource;

      if (entry instanceof GPUBuffer) {
        resource = {
          buffer: entry,
          size: entry.size,
          offset: 0,
        };
      } else if (
        entry instanceof GPUTextureView ||
        entry instanceof GPUSampler
      ) {
        resource = entry;
      } else {
        console.log("unhandled", entry);
      }

      entries.push({
        binding: i,
        resource,
      });
    }

    const bg = device.createBindGroup({
      layout: settings.pipeline.getBindGroupLayout(settings.group),
      entries: entries,
    });

    let error = await device.popErrorScope();
    if (error) {
      console.warn(error.message);
      throw new Error(`Could not create bind group `);
    }

    return bg;
  };

  ///////////////////////
  // Use a render pipeline to draw a given texture
  // to the canvas
  // returns a function that can be called each frame
  const drawTextureToCanvasPass = async (texture) => {
    const quadShader = await createShaderModule(
      `
        @group(0) @binding(0) var samp : sampler;
        @group(0) @binding(1) var tex : texture_2d<f32>;
        
        struct VertexOutput {
          @builtin(position) Position : vec4f,
            @location(0) fragUV : vec2f,
        }
        
        @vertex
        fn vert(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
        
          const pos = array(
            vec2( 1.0,  1.0),
            vec2( 1.0, -1.0),
            vec2(-1.0, -1.0),
            vec2( 1.0,  1.0),
            vec2(-1.0, -1.0),
            vec2(-1.0,  1.0),
          );
        
          const uv = array(
            vec2(1.0, 0.0),
            vec2(1.0, 1.0),
            vec2(0.0, 1.0),
            vec2(1.0, 0.0),
            vec2(0.0, 1.0),
            vec2(0.0, 0.0),
          );
        
          var output : VertexOutput;
          output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
          output.fragUV = uv[VertexIndex];
          return output;
        }
        
        @fragment
        fn frag(@location(0) fragUV : vec2f) -> @location(0) vec4f {
          var color = textureSample(tex, samp, fragUV);
          return color;
        }
      `,
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
            format: format,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    const sampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
    });
    const planeBindGroup = await createBindGroup({
      pipeline: renderPipeline,
      group: 0,
      bindings: [sampler, texture.createView()],
    });

    const renderPass = (commandEncoder) => {
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, planeBindGroup);
      renderPass.draw(6, 1, 0, 0);
      renderPass.end();
    };

    return renderPass;
  };

  ///////////////////////
  // Slightly less verbose way to dispatch a compute pass
  const dispatchComputePass = (settings) => {
    // console.log(settings);
    settings.group ||= 0;
    const computePass = settings.encoder.beginComputePass();
    computePass.setPipeline(settings.pipeline);
    // todo: this doens't quite make sense, because I think i could dispatch multiple passes in a row
    computePass.setBindGroup(settings.group, settings.bindGroup);
    computePass.dispatchWorkgroups(...settings.workGroups);
    computePass.end();
  };

  ///////////////////////
  // Return an object (called wgpu in main.js) that wraps all the above functions.
  return {
    device: device,
    createBindGroup,
    createTexture,
    createAndSetBuffer,
    createBindGroupLayout,
    createComputePipeline,
    drawTextureToCanvasPass,
    dispatchComputePass,
  };
};

///////////////////////
// Async load file with error handling
// on notochord.xyz this is rewritten dynamically
const load = async (filePath) => {
  try {
    const response = await fetch(filePath);
    if (response.ok) {
      const content = await response.text();
      return content;
    } else {
      throw new Error(`Error loading WGSL file: ${filePath}`);
    }
  } catch (error) {
    console.error(error);
  }
};

export { setupWebGPU };
