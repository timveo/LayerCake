import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  cleanupDatabase,
  createTestUser,
  createTestProject,
  TestUser,
  TestProject,
} from './test-helpers';

describe('Agent Workflow Integration Tests', () => {
  let app: INestApplication;
  let user: TestUser;
  let project: TestProject;

  beforeAll(async () => {
    app = await createTestApp();
    user = await createTestUser(app);
  });

  beforeEach(async () => {
    project = await createTestProject(app, user.token);
  });

  afterEach(async () => {
    await cleanupDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Agent Execution', () => {
    it('should execute agent and return result', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentType: 'product-manager',
          userPrompt: 'Create a PRD for a task management app',
          model: 'claude-sonnet-4-20250514',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.output).toBeDefined();
    });

    it('should reject execution for non-owner', async () => {
      const otherUser = await createTestUser(app, 'other@example.com');

      const response = await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${otherUser.token}`)
        .send({
          projectId: project.id,
          agentType: 'product-manager',
          userPrompt: 'Test',
        });

      expect(response.status).toBe(403);
    });

    it('should track agent execution in database', async () => {
      await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentType: 'product-manager',
          userPrompt: 'Test prompt',
        })
        .expect(201);

      // Get agent history
      const historyResponse = await request(app.getHttpServer())
        .get(`/agents/history/${project.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(historyResponse.body.length).toBe(1);
      expect(historyResponse.body[0].agentType).toBe('product-manager');
    });

    it('should increment monthly execution count', async () => {
      const initialUser = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const initialCount = initialUser.body.monthlyAgentExecutions || 0;

      await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentType: 'product-manager',
          userPrompt: 'Test',
        })
        .expect(201);

      const updatedUser = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(updatedUser.body.monthlyAgentExecutions).toBe(initialCount + 1);
    });
  });

  describe('Code Generation Integration', () => {
    it('should extract and write code files from agent output', async () => {
      const mockOutput = `Here is the code:

\`\`\`typescript:src/components/Button.tsx
import React from 'react';

export const Button: React.FC = () => {
  return <button className="btn-primary">Click Me</button>;
};
\`\`\`

\`\`\`typescript:src/App.tsx
import React from 'react';
import { Button } from './components/Button';

export const App = () => {
  return (
    <div>
      <h1>My App</h1>
      <Button />
    </div>
  );
};
\`\`\``;

      // Parse code
      const parseResponse = await request(app.getHttpServer())
        .post('/code-generation/parse')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ agentOutput: mockOutput })
        .expect(201);

      expect(parseResponse.body.files.length).toBe(2);
      expect(parseResponse.body.files[0].path).toBe('src/components/Button.tsx');
      expect(parseResponse.body.files[1].path).toBe('src/App.tsx');
    });

    it('should initialize workspace for project', async () => {
      const response = await request(app.getHttpServer())
        .post('/code-generation/workspaces')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          projectType: 'react-vite',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.workspacePath).toContain(project.id);
    });

    it('should write file to workspace', async () => {
      // Initialize workspace
      await request(app.getHttpServer())
        .post('/code-generation/workspaces')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          projectType: 'react-vite',
        })
        .expect(201);

      // Write file
      const response = await request(app.getHttpServer())
        .post(`/code-generation/workspaces/${project.id}/files`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          filePath: 'src/test.ts',
          content: 'export const test = true;',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Gate Workflow', () => {
    it('should create G0 gate on project creation', async () => {
      const gatesResponse = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const g0Gate = gatesResponse.body.find((g: any) => g.gateType === 'G0_PENDING');
      expect(g0Gate).toBeDefined();
    });

    it('should transition gates sequentially', async () => {
      // Get G0 gate
      const gatesResponse = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const g0Gate = gatesResponse.body.find((g: any) => g.gateType === 'G0_PENDING');

      // Approve G0
      const approveResponse = await request(app.getHttpServer())
        .post(`/gates/${g0Gate.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'Test approval',
        })
        .expect(200);

      expect(approveResponse.body.status).toBe('APPROVED');
      expect(approveResponse.body.nextGateType).toBe('G1_PENDING');

      // Verify G1 created
      const updatedGatesResponse = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const g1Gate = updatedGatesResponse.body.find(
        (g: any) => g.gateType === 'G1_PENDING',
      );
      expect(g1Gate).toBeDefined();
    });

    it('should reject approval with invalid keyword', async () => {
      const gatesResponse = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const g0Gate = gatesResponse.body.find((g: any) => g.gateType === 'G0_PENDING');

      // Try to approve with "ok" (invalid)
      const response = await request(app.getHttpServer())
        .post(`/gates/${g0Gate.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'ok',  // Invalid keyword
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('not a clear approval');
    });

    it('should block gate approval if previous gate not approved', async () => {
      // Create G2 gate manually (skipping G1)
      const g2Response = await request(app.getHttpServer())
        .post('/gates')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          gateType: 'G2_PENDING',
        })
        .expect(201);

      // Try to approve G2 without approving G1
      const approveResponse = await request(app.getHttpServer())
        .post(`/gates/${g2Response.body.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'approved',
        });

      expect(approveResponse.status).toBe(403);
      expect(approveResponse.body.message).toContain('Previous gate');
    });
  });

  describe('Error Tracking', () => {
    it('should create error history on build failure', async () => {
      const errorResponse = await request(app.getHttpServer())
        .post('/error-history')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentId: 'test-agent-123',
          errorType: 'build_error',
          errorMessage: 'TypeScript compilation failed',
          context: {
            filePath: 'src/index.ts',
            lineNumber: 10,
          },
        })
        .expect(201);

      expect(errorResponse.body.errorType).toBe('build_error');

      // Verify error can be retrieved
      const historyResponse = await request(app.getHttpServer())
        .get('/error-history')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(historyResponse.body.length).toBe(1);
    });

    it('should mark errors as resolved', async () => {
      // Create error
      const errorResponse = await request(app.getHttpServer())
        .post('/error-history')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          errorType: 'build_error',
          errorMessage: 'Test error',
        })
        .expect(201);

      // Resolve error
      const resolveResponse = await request(app.getHttpServer())
        .post(`/error-history/${errorResponse.body.id}/resolve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          resolution: 'Fixed by agent retry',
        })
        .expect(200);

      expect(resolveResponse.body.resolvedAt).toBeDefined();
    });
  });
});
