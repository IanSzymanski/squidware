import { requireProcess } from './process.mjs';

// Running the JS entry point also works on Windows, where .cmd is not spawnable.
export function pnpmCommand(args) {
  if (!process.env.npm_execpath) throw new Error('Run this command through pnpm.');
  return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
}

export function runPnpm(args, options) {
  const invocation = pnpmCommand(args);
  return requireProcess(invocation.command, invocation.args, options);
}
