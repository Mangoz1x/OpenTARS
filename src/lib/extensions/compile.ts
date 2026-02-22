import fs from "fs";
import path from "path";
import os from "os";
import { build, type Plugin } from "esbuild";

/**
 * esbuild plugin that maps `import React from 'react'` and
 * `import ReactDOM from 'react-dom'` to the corresponding window globals.
 * This lets extension authors write normal `import` statements while
 * the compiled IIFE references the globals set by the host page.
 */
const tarsExternalsPlugin: Plugin = {
  name: "tars-externals",
  setup(build) {
    const externals: Record<string, string> = {
      react: "React",
      "react-dom": "ReactDOM",
      "react-dom/client": "ReactDOM",
      "react/jsx-runtime": "React",
    };

    // Mark these specifiers as external-like by intercepting resolve + load
    build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => {
      const key = args.path;
      if (key in externals) {
        return { path: key, namespace: "tars-external" };
      }
      return undefined;
    });

    build.onLoad({ filter: /.*/, namespace: "tars-external" }, (args) => {
      const globalName = externals[args.path];
      return {
        contents: `module.exports = ${globalName};`,
        loader: "js",
      };
    });
  },
};

/**
 * Compile an extension from a file path on disk.
 * Uses esbuild.build() with bundling so `import` statements are resolved.
 */
export async function compileExtension(sourcePath: string): Promise<string> {
  const result = await build({
    entryPoints: [sourcePath],
    bundle: true,
    format: "iife",
    globalName: "__tarsExt",
    target: "es2020",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    // Prevent esbuild from reading the project tsconfig.json, which has
    // "jsx": "react-jsx" — that overrides our jsx:"transform" and causes
    // the compiled output to use jsx()/jsxs() from react/jsx-runtime
    // instead of React.createElement().
    tsconfigRaw: "{}",
    write: false,
    plugins: [tarsExternalsPlugin],
  });
  return result.outputFiles![0].text;
}

/**
 * Compile extension source provided as a string (e.g. from MongoDB).
 * Writes to a temp file, runs build(), then cleans up.
 */
export async function compileExtensionFromSource(
  source: string,
  name: string
): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), "tars-ext-compile");
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpFile = path.join(tmpDir, `${name}.tsx`);
  fs.writeFileSync(tmpFile, source);

  try {
    return await compileExtension(tmpFile);
  } finally {
    fs.unlinkSync(tmpFile);
  }
}
