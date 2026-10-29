import type { FastifyInstance } from 'fastify';
import type { AgentService } from '../agents/service';
import type { DashboardService } from './service';

export function dashboardRoutes(app: FastifyInstance, deps: { dashboard: DashboardService; agents: AgentService }) {
  app.get('/dashboard', { config: { access: 'system.view' } }, async () => deps.dashboard.summary());
  app.get('/office', { config: { access: 'agents.view' } }, async () => {
    await deps.agents.ensureAgents();
    return deps.dashboard.office();
  });
}
