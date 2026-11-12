// Membuat hash bcrypt untuk ADMIN_PASSWORD_HASH. Password diketik langsung di terminal dan tidak ditampilkan.
import bcrypt from "bcryptjs";

const MIN_LENGTH = 12;
const MAX_BYTES = 72;

function readHidden(prompt) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
      return;
    }
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buffer = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(buffer);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") buffer = buffer.slice(0, -1);
        else buffer += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await readHidden("Password Admin: ");
const confirm = process.stdin.isTTY ? await readHidden("Ulangi password: ") : password;

if (password !== confirm) {
  console.error("Password tidak sama.");
  process.exit(1);
}
if (password.length < MIN_LENGTH) {
  console.error(`Password Admin minimal ${MIN_LENGTH} karakter.`);
  process.exit(1);
}
if (Buffer.byteLength(password, "utf8") > MAX_BYTES) {
  console.error(`Password terlalu panjang (maksimal ${MAX_BYTES} byte).`);
  process.exit(1);
}

console.log("\nSalin baris ini ke ADMIN_PASSWORD_HASH:\n");
console.log(await bcrypt.hash(password, 10));
