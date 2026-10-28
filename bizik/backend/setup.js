const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const backendDir = 'D:\\BiZik\\application\\backend';
if (!fs.existsSync(backendDir)) fs.mkdirSync(backendDir, { recursive: true });
process.chdir(backendDir);

const modules = [
  'auth', 'kyc', 'compliance', 'user', 'contract', 'file', 
  'escrow', 'payment', 'wallet', 'fx', 'dispute', 
  'notification', 'admin', 'reporting'
];

// Initialize package.json
const packageJson = {
  name: "bizik-backend",
  version: "1.0.0",
  main: "src/index.ts",
  scripts: {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  dependencies: {
    "express": "^4.18.2",
    "zod": "^3.21.4",
    "@prisma/client": "^5.14.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  devDependencies: {
    "typescript": "^5.0.0",
    "ts-node": "^10.9.1",
    "ts-node-dev": "^2.0.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.17",
    "@types/cors": "^2.8.13",
    "prisma": "^5.14.0"
  }
};
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));

// Initialize tsconfig.json
const tsConfig = {
  compilerOptions: {
    target: "es2022",
    module: "commonjs",
    outDir: "./dist",
    rootDir: "./src",
    strict: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: true
  },
  include: ["src/**/*"]
};
fs.writeFileSync('tsconfig.json', JSON.stringify(tsConfig, null, 2));

// Initialize Prisma
if (!fs.existsSync('prisma')) fs.mkdirSync('prisma');
const prismaSchema = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n// Example models based on modules\nmodel User {\n  id        String   @id @default(uuid())\n  email     String   @unique\n  role      String   @default("FREELANCER")\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n}\n`;
fs.writeFileSync('prisma/schema.prisma', prismaSchema);

// Create .env
fs.writeFileSync('.env', 'DATABASE_URL="postgresql://user:password@localhost:5432/bizik?schema=public"\nPORT=3000\n');

// Create src folder and modules
const srcDir = path.join(backendDir, 'src');
if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);

modules.forEach(mod => {
  const modDir = path.join(srcDir, mod);
  if (!fs.existsSync(modDir)) fs.mkdirSync(modDir, { recursive: true });
  
  const files = [
    `${mod}.routes.ts`,
    `${mod}.validation.ts`,
    `${mod}.controller.ts`,
    `${mod}.service.ts`,
    `${mod}.repository.ts`
  ];
  
  files.forEach(file => {
    let content = `// ${file}\n`;
    const modCapitalized = mod.charAt(0).toUpperCase() + mod.slice(1);
    if (file.endsWith('.routes.ts')) {
      content = `import { Router } from 'express';\nimport { ${modCapitalized}Controller } from './${mod}.controller';\n\nconst router = Router();\n\n// router.get('/', ${modCapitalized}Controller.get);\n\nexport default router;\n`;
    } else if (file.endsWith('.controller.ts')) {
      content = `import { Request, Response } from 'express';\nimport { ${modCapitalized}Service } from './${mod}.service';\n\nexport const ${modCapitalized}Controller = {\n  // get: async (req: Request, res: Response) => {}\n};\n`;
    } else if (file.endsWith('.service.ts')) {
      content = `import { ${modCapitalized}Repository } from './${mod}.repository';\n\nexport const ${modCapitalized}Service = {\n  // doSomething: async () => {}\n};\n`;
    } else if (file.endsWith('.repository.ts')) {
      content = `// Repository handles database operations via Prisma\nimport { PrismaClient } from '@prisma/client';\n\nconst prisma = new PrismaClient();\n\nexport const ${modCapitalized}Repository = {\n  // find: async () => {}\n};\n`;
    } else if (file.endsWith('.validation.ts')) {
      content = `import { z } from 'zod';\n\nexport const ${modCapitalized}Schema = z.object({\n  // field: z.string()\n});\n`;
    }
    
    fs.writeFileSync(path.join(modDir, file), content);
  });
});

// Create entry point index.ts
let indexTs = `import express from 'express';\nimport cors from 'cors';\nimport dotenv from 'dotenv';\n\n`;
modules.forEach(mod => {
  indexTs += `import ${mod}Routes from './${mod}/${mod}.routes';\n`;
});

indexTs += `\ndotenv.config();\n\nconst app = express();\n\napp.use(cors());\napp.use(express.json());\n\n// Register routes\n`;
modules.forEach(mod => {
  indexTs += `app.use('/api/v1/${mod}', ${mod}Routes);\n`;
});

indexTs += `\nconst PORT = process.env.PORT || 3000;\n\napp.listen(PORT, () => {\n  console.log(\`BiZik Backend Server running on port \${PORT}\`);\n});\n`;

fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTs);

console.log('Installing npm packages... This might take a minute.');
execSync('npm install', { stdio: 'inherit' });
console.log('Backend setup complete!');
