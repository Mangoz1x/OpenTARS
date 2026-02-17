import { timingSafeEqual } from "crypto";

export function verifyPassword(input: string): boolean {
  const expected = process.env.TARS_PASSWORD;
  if (!expected) {
    throw new Error("TARS_PASSWORD environment variable is not set");
  }

  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}
