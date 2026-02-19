import os from "os";

export function getPrivateIps(): string[] {
  const ips: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const info of iface) {
      if (!info.internal && info.family === "IPv4") {
        ips.push(info.address);
      }
    }
  }
  return ips;
}
