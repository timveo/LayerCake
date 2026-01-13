-- pgvector extension and CodeEmbedding table
-- Skipped for local development without pgvector installed
-- To enable: install pgvector extension and uncomment the lines below

-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE TABLE "CodeEmbedding" (
--   id TEXT PRIMARY KEY,
--   "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE,
--   "filePath" TEXT NOT NULL,
--   content TEXT NOT NULL,
--   language TEXT,
--   embedding vector(1536),
--   "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   "updatedAt" TIMESTAMP(3) NOT NULL,
--   UNIQUE("projectId", "filePath")
-- );
-- CREATE INDEX "CodeEmbedding_embedding_idx" ON "CodeEmbedding" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
-- CREATE INDEX "CodeEmbedding_projectId_idx" ON "CodeEmbedding"("projectId");

SELECT 1; -- No-op migration for local dev
