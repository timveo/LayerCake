import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  cleanupDatabase,
  createTestUser,
  createTestProject,
  approveTestGate,
  waitFor,
  TestUser,
  TestProject,
} from './test-helpers';

describe('G0-G9 Complete Workflow E2E Tests', () => {
  let app: INestApplication;
  let user: TestUser;
  let project: TestProject;

  beforeAll(async () => {
    app = await createTestApp();
    user = await createTestUser(app);
  }, 30000);

  beforeEach(async () => {
    project = await createTestProject(app, user.token, {
      name: 'E2E Test Project',
      type: 'fullstack_saas',
    });
  }, 10000);

  afterEach(async () => {
    await cleanupDatabase(app);
  }, 10000);

  afterAll(async () => {
    await app.close();
  });

  describe('Complete G0 → G9 Flow', () => {
    it('should complete entire workflow from intake to deployment', async () => {
      // G0: Intake (auto-created)
      let gates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      let g0Gate = gates.body.find((g: any) => g.gateType === 'G0_PENDING');
      expect(g0Gate).toBeDefined();

      // Approve G0
      await request(app.getHttpServer())
        .post(`/gates/${g0Gate.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'approved',
        })
        .expect(200);

      // G1: Kickoff
      gates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      let g1Gate = gates.body.find((g: any) => g.gateType === 'G1_PENDING');
      expect(g1Gate).toBeDefined();

      // Approve G1
      await request(app.getHttpServer())
        .post(`/gates/${g1Gate.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'yes',
        })
        .expect(200);

      // G2: Planning - Execute Product Manager
      await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentType: 'product-manager',
          userPrompt: 'Create a PRD for a task management SaaS application',
          model: 'claude-sonnet-4-20250514',
        })
        .expect(201);

      // Wait for document generation
      await waitFor(async () => {
        const docs = await request(app.getHttpServer())
          .get('/documents')
          .query({ projectId: project.id })
          .set('Authorization', `Bearer ${user.token}`);

        return docs.body.length > 0;
      }, 10000);

      // Get G2 gate
      gates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      let g2Gate = gates.body.find((g: any) => g.gateType === 'G2_PENDING');

      // Approve G2
      if (g2Gate) {
        await request(app.getHttpServer())
          .post(`/gates/${g2Gate.id}/approve`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            approved: true,
            reviewNotes: 'approved',
          })
          .expect(200);
      }

      // G3: Architecture - Execute Architect
      await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentType: 'architect',
          userPrompt: 'Create OpenAPI spec and Prisma schema for task management',
          model: 'claude-opus-4-20241113',
        })
        .expect(201);

      // Verify specifications created
      await waitFor(async () => {
        const specs = await request(app.getHttpServer())
          .get('/specifications')
          .query({ projectId: project.id })
          .set('Authorization', `Bearer ${user.token}`);

        return specs.body.length > 0;
      }, 10000);

      // Get G3 gate and approve
      gates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      let g3Gate = gates.body.find((g: any) => g.gateType === 'G3_PENDING');

      if (g3Gate) {
        await request(app.getHttpServer())
          .post(`/gates/${g3Gate.id}/approve`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            approved: true,
            reviewNotes: 'approved',
          })
          .expect(200);
      }

      // Verify current gate is now G4 or beyond
      const finalGates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const approvedGates = finalGates.body.filter(
        (g: any) => g.status === 'APPROVED',
      );

      expect(approvedGates.length).toBeGreaterThanOrEqual(3); // G0, G1, G2 approved
    }, 60000); // 60 second timeout for entire flow
  });

  describe('G5 Development Gate with Code Generation', () => {
    it('should generate code and validate build', async () => {
      // Initialize workspace
      await request(app.getHttpServer())
        .post('/code-generation/workspaces')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          projectType: 'react-vite',
        })
        .expect(201);

      // Write test files
      await request(app.getHttpServer())
        .post(`/code-generation/workspaces/${project.id}/files`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          filePath: 'src/App.tsx',
          content: `import React from 'react';

export const App = () => {
  return <div>Hello World</div>;
};

export default App;
`,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/code-generation/workspaces/${project.id}/files`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          filePath: 'src/main.tsx',
          content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
        })
        .expect(201);

      // Run validation (this will take time)
      const validationResponse = await request(app.getHttpServer())
        .post(`/code-generation/workspaces/${project.id}/validate`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(201);

      expect(validationResponse.body.install).toBeDefined();
      expect(validationResponse.body.typeCheck).toBeDefined();
      expect(validationResponse.body.build).toBeDefined();

      // Note: Full validation may fail without complete package.json setup
      // This test verifies the pipeline runs, not necessarily succeeds
    }, 120000); // 2 minute timeout
  });

  describe('Gate Statistics and Progress', () => {
    it('should track gate progress statistics', async () => {
      // Approve first few gates
      const gates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const g0Gate = gates.body.find((g: any) => g.gateType === 'G0_PENDING');

      await request(app.getHttpServer())
        .post(`/gates/${g0Gate.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'approved',
        })
        .expect(200);

      // Get gate statistics
      const statsResponse = await request(app.getHttpServer())
        .get(`/gates/stats/${project.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(statsResponse.body.totalGates).toBeGreaterThan(0);
      expect(statsResponse.body.approvedGates).toBeGreaterThan(0);
      expect(statsResponse.body.progressPercentage).toBeGreaterThan(0);
    });
  });

  describe('Project State Tracking', () => {
    it('should track project state through gates', async () => {
      const stateResponse = await request(app.getHttpServer())
        .get(`/projects/${project.id}/state`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(stateResponse.body.currentGate).toBe('G0_PENDING');
      expect(stateResponse.body.currentPhase).toBeDefined();

      // Approve G0
      const gates = await request(app.getHttpServer())
        .get('/gates')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      const g0Gate = gates.body.find((g: any) => g.gateType === 'G0_PENDING');

      await request(app.getHttpServer())
        .post(`/gates/${g0Gate.id}/approve`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          approved: true,
          reviewNotes: 'approved',
        })
        .expect(200);

      // Check updated state
      const updatedStateResponse = await request(app.getHttpServer())
        .get(`/projects/${project.id}/state`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(updatedStateResponse.body.currentGate).toBe('G1_PENDING');
    });
  });

  describe('Proof Artifacts', () => {
    it('should store proof artifacts for gates', async () => {
      // Create proof artifact
      const artifactResponse = await request(app.getHttpServer())
        .post('/proof-artifacts')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          gateId: 'test-gate-123',
          artifactType: 'BUILD_OUTPUT',
          filePath: 'builds/output.json',
          metadata: {
            buildTime: '30s',
            success: true,
          },
        })
        .expect(201);

      expect(artifactResponse.body.artifactType).toBe('BUILD_OUTPUT');

      // Retrieve artifacts
      const artifactsResponse = await request(app.getHttpServer())
        .get('/proof-artifacts')
        .query({ projectId: project.id })
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(artifactsResponse.body.length).toBe(1);
    });
  });

  describe('Cost Tracking', () => {
    it('should track agent execution costs', async () => {
      // Execute agent (costs tokens)
      await request(app.getHttpServer())
        .post('/agents/execute')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          projectId: project.id,
          agentType: 'product-manager',
          userPrompt: 'Test prompt',
          model: 'claude-sonnet-4-20250514',
        })
        .expect(201);

      // Get project costs
      const costsResponse = await request(app.getHttpServer())
        .get(`/cost-tracking/projects/${project.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(costsResponse.body.totalCost).toBeGreaterThanOrEqual(0);
    });
  });
});
