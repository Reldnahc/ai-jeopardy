const testEnvDefaults: Record<string, string> = {
  DATABASE_URL: "postgres://test",
  OPENAI_API_KEY: "test-openai-key",
  JWT_SECRET: "test-jwt-secret",
  NODE_ENV: "test",
};

for (const [key, value] of Object.entries(testEnvDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

