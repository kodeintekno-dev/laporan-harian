// Menjalankan `vercel dev` dengan isi .env.local dimuat ke environment proses,
// karena vercel dev tidak meneruskan .env.local ke fungsi API.
// Argumen tambahan diteruskan, mis. `npm run dev:full -- --listen 3001`.
import { spawn } from "node:child_process";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.error("File .env.local tidak ditemukan. Salin dari .env.example dan isi nilainya.");
  process.exit(1);
}

const child = spawn("vercel", ["dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true, // di Windows, vercel adalah vercel.cmd
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
