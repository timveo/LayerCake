import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import * as request from 'supertest';

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export interface TestProject {
  id: string;
  name: string;
  ownerId: string;
}

/**
 * Create test application
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();

  return app;
}

/**
 * Clean up database after tests
 */
export async function cleanupDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);

  // Delete in correct order to avoid foreign key constraints
  await prisma.handoffDeliverable.deleteMany();
  await prisma.handoff.deleteMany();
  await prisma.proofArtifact.deleteMany();
  await prisma.errorHistory.deleteMany();
  await prisma.blocker.deleteMany();
  await prisma.query.deleteMany();
  await prisma.escalation.deleteMany();
  await prisma.risk.deleteMany();
  await prisma.note.deleteMany();
  await prisma.deliverable.deleteMany();
  await prisma.sessionContext.deleteMany();
  await prisma.usageMetric.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.gate.deleteMany();
  await prisma.specification.deleteMany();
  await prisma.document.deleteMany();
  await prisma.phaseHistory.deleteMany();
  await prisma.projectState.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Create test user and get JWT token
 */
export async function createTestUser(
  app: INestApplication,
  email = 'test@example.com',
  password = 'Test123!@#',
): Promise<TestUser> {
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      email,
      password,
      name: 'Test User',
    })
    .expect(201);

  return {
    id: response.body.user.id,
    email: response.body.user.email,
    token: response.body.token,
  };
}

/**
 * Create test project
 */
export async function createTestProject(
  app: INestApplication,
  token: string,
  projectData: Partial<any> = {},
): Promise<TestProject> {
  const response = await request(app.getHttpServer())
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Test Project',
      description: 'Test project description',
      type: 'fullstack_saas',
      ...projectData,
    })
    .expect(201);

  return response.body;
}

/**
 * Execute agent and return result
 */
export async function executeTestAgent(
  app: INestApplication,
  token: string,
  projectId: string,
  agentType: string,
  userPrompt = 'Test prompt',
): Promise<any> {
  const response = await request(app.getHttpServer())
    .post('/agents/execute')
    .set('Authorization', `Bearer ${token}`)
    .send({
      projectId,
      agentType,
      userPrompt,
      model: 'claude-sonnet-4-20250514',
    })
    .expect(201);

  return response.body;
}

/**
 * Approve gate
 */
export async function approveTestGate(
  app: INestApplication,
  token: string,
  gateId: string,
  reviewNotes = 'Test approval',
): Promise<any> {
  const response = await request(app.getHttpServer())
    .post(`/gates/${gateId}/approve`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      approved: true,
      reviewNotes,
    })
    .expect(200);

  return response.body;
}

/**
 * Create mock agent output with code blocks
 */
export function createMockAgentOutput(files: Array<{ path: string; content: string }>): string {
  return files
    .map(
      (file) => `\`\`\`typescript:${file.path}
${file.content}
\`\`\``,
    )
    .join('\n\n');
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Create test workspace directory
 */
export async function createTestWorkspace(projectId: string): Promise<string> {
  const fs = require('fs-extra');
  const path = require('path');
  const workspacePath = path.join(process.cwd(), 'test-workspaces', projectId);

  await fs.ensureDir(workspacePath);

  return workspacePath;
}

/**
 * Clean up test workspace
 */
export async function cleanupTestWorkspace(projectId: string): Promise<void> {
  const fs = require('fs-extra');
  const path = require('path');
  const workspacePath = path.join(process.cwd(), 'test-workspaces', projectId);

  await fs.remove(workspacePath);
}
