import path from "path";

export function getUserdataDir(): string {
  return process.env.TARS_USERDATA_DIR || path.join(process.cwd(), "userdata");
}

export function getExtensionSourcePath(name: string): string {
  return path.join(getUserdataDir(), "extensions", name, "component.tsx");
}

export function getExtensionCachePath(name: string): string {
  return path.join(getUserdataDir(), "cache", "extensions", `${name}.compiled.js`);
}

export function getScriptSourcePath(name: string): string {
  return path.join(getUserdataDir(), "scripts", `${name}.ts`);
}

export function getScriptCachePath(name: string): string {
  return path.join(getUserdataDir(), "cache", "scripts", `${name}.compiled.js`);
}
