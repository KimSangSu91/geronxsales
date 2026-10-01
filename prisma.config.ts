import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js와 같은 .env.local을 사용
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // 마이그레이션은 Session pooler(5432) 사용. 앱 실행은 src/lib/prisma.ts에서 DATABASE_URL(6543) 사용
  datasource: {
    url: env("DIRECT_URL"),
  },
});
