-- Add 'gmail' to the connector_provider enum
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction, so it runs standalone
ALTER TYPE "connector_provider" ADD VALUE IF NOT EXISTS 'gmail';
