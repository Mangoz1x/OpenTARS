import { transform } from "esbuild";

/**
 * Compile TSX/JSX source code to plain JS.
 * No filesystem needed — works entirely from strings.
 */
export async function compileExtension(source: string): Promise<string> {
  const result = await transform(source, {
    loader: "tsx",
    format: "iife",
    target: "es2020",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  });
  return result.code;
}
