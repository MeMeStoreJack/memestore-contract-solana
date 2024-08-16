import fs from "fs";

export function parseSecretKey(path: string): Uint8Array {
  var secretKey = fs.readFileSync(path, {
    encoding: "utf-8",
  });
  secretKey = secretKey.substring(1, secretKey.length - 2);
  const dataList: number[] = secretKey.split(",").map(Number);
  console.log(dataList);
  return new Uint8Array(dataList);
}
