-- Data migration: upsert admin user with a strong pre-hashed password.
-- Plain-text password: Runlet$Admin2025!
-- Hash generated with bcrypt cost 12 (bcryptjs).
-- ON CONFLICT (email) covers both: new installs (INSERT) and existing rows
-- where password_hash is NULL because the column was added after the user
-- was first created (migration 0001 added the column with no backfill).

INSERT INTO users (id, email, name, password_hash, email_verified)
VALUES (
  'user_seed_001',
  'admin@runlet.ai',
  'Runlet Admin',
  '$2b$12$4omfAIma18MD4wNgTZh.CO83NAsllASQf63kBVg8UIQp3vKjR2yfy',
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = '$2b$12$4omfAIma18MD4wNgTZh.CO83NAsllASQf63kBVg8UIQp3vKjR2yfy',
  email_verified = COALESCE(users.email_verified, NOW());
