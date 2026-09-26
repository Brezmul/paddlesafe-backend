import crypto from "crypto";

export function decryptApiKey(encryptedKeyName) {
  const encrypted = process.env[encryptedKeyName];
  const masterKey = process.env.MASTER_KEY;

  if (!encrypted || !masterKey) {
    const missingKey = masterKey ? encryptedKeyName : "MASTER_KEY";
    throw new Error(`Missing required environment variable: ${missingKey}`);
  }

  const key = crypto.createHash("sha256").update(masterKey).digest();
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}