export const createShaderModule = async (
  device: GPUDevice,
  code: string,
  file: string
) => {
  const module = device.createShaderModule({ code });

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
