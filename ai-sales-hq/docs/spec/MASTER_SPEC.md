MASTER PROJECT SPECIFICATION

UNUTILMAS TA’M AI SALES HEADQUARTERS

You are acting as a Principal Software Architect, Senior Full-Stack Engineer, AI Systems Engineer, DevOps Engineer, Database Architect, Security Engineer, and Premium UI/UX Designer.

Your task is to design and implement a production-oriented AI Sales Headquarters for the Unutilmas Ta’m food brand.

This is NOT a demo, a static dashboard, a landing page, or a simple chatbot.

It is an operational AI-assisted sales platform with a premium virtual office interface, a multi-agent orchestration system, direct integration with the existing product website, customer discovery workflows, sales communication workflows, order preparation, and a powerful Director Control Center.

You must work incrementally, understand the repository before modifying it, build and test one phase at a time, and prepare the finished application for GitHub-based deployment to Hostmaster hosting.

Do not attempt to implement the entire platform in one uncontrolled code-generation step.

==================================================

1. BUSINESS OBJECTIVE
    ==================================================

Build a system that helps Unutilmas Ta’m discover potential business customers throughout Surxondaryo region, Uzbekistan.

Target customers include:

* Supermarkets.
* Grocery stores.
* Minimarkets.
* Food retailers.
* Wholesale food distributors.
* Other relevant businesses that may sell frozen semi-finished food products.

The platform should be capable of:

1. Retrieving accurate product information from the official Unutilmas Ta’m website.
2. Discovering potential business customers using permitted data sources.
3. Analyzing and prioritizing prospects.
4. Managing customer research and sales tasks.
5. Preparing and sending approved sales communications through supported channels.
6. Responding to product questions using verified information.
7. Managing sales conversations within configurable business rules.
8. Collecting order details.
9. Preparing orders for human review and delivery.
10. Sending order-ready notifications to the owner.
11. Providing the owner with control over all agents, tasks, schedules, permissions, and operational status.

The owner personally handles product delivery.

The system must prepare orders and hand them over to the owner. It must not claim that delivery has happened when it has not.

The system must not autonomously invent prices, discounts, product specifications, stock availability, delivery promises, or contractual commitments.

The Director AI coordinates the workflow but cannot override system security policies or owner-defined restrictions.

==================================================
2. MANDATORY WORKING METHOD

Follow this sequence strictly.

PHASE 0 — REPOSITORY INSPECTION

Before changing any code:

* Inspect the entire existing repository structure.
* Read package.json, lockfiles, README, configuration files, environment examples, and existing documentation.
* Identify the existing framework, package manager, build process, test tools, and deployment assumptions.
* Detect whether the repository already contains an application.
* Identify reusable components and existing integrations.
* Check for secrets, unsafe configurations, exposed API keys, and hardcoded credentials.
* Do not overwrite an existing project blindly.
* Do not delete existing user code without explicit justification.
* Do not assume the current working directory is empty.
* Do not assume access to the production website or hosting credentials.

Produce:

* docs/PROJECT_AUDIT.md
* docs/IMPLEMENTATION_PLAN.md
* docs/ARCHITECTURE.md
* docs/DECISIONS.md

Explain which architecture you selected and why.

If the repository is empty, initialize the project using the architecture described below.

If the repository contains a partially implemented application, adapt it carefully rather than replacing everything without inspection.

After the audit, begin Phase 1 unless a genuine blocker requires clarification.

PHASE 1 — FOUNDATION

Implement:

* Project structure.
* Frontend application shell.
* Backend application shell.
* Configuration validation.
* Logging.
* Health endpoints.
* Database connection layer.
* Authentication foundation.
* Authorization foundation.
* Error handling.
* Environment configuration.
* Initial tests.

Run available checks and fix errors before proceeding.

PHASE 2 — PREMIUM INTERFACE

Implement the design system and responsive virtual office.

Use realistic data only where clearly marked as sample data.

PHASE 3 — DATABASE AND PRODUCT INTEGRATION

Implement the database schema, product synchronization interfaces, product catalog, and integration health monitoring.

PHASE 4 — DIRECTOR CONTROL CENTER

Implement agent lifecycle controls, schedules, permissions, operational settings, and audit logs.

PHASE 5 — AI ORCHESTRATION

Implement agent roles, task execution, job queues, cancellation, retries, limits, and observability.

PHASE 6 — CUSTOMER DISCOVERY

Implement prospect research, data normalization, deduplication, source tracking, scoring, and manual review.

PHASE 7 — SALES WORKFLOWS

Implement permitted communication adapters, sales conversations, product FAQs, negotiation limits, and approval workflows.

PHASE 8 — ORDER PREPARATION

Implement order drafts, price verification, availability checks, customer confirmation, order review, and owner handoff.

PHASE 9 — TESTING AND HARDENING

Run unit, integration, authorization, workflow, and end-to-end tests.

PHASE 10 — DEPLOYMENT PREPARATION

Prepare GitHub documentation, environment examples, production build instructions, database migrations, deployment scripts, backup procedures, and Hostmaster deployment instructions.

Do not claim that deployment succeeded unless deployment was actually performed and verified.

At the end of each phase:

1. Summarize completed work.
2. List files created or modified.
3. Run appropriate tests and build checks.
4. Fix all critical failures.
5. Document unresolved issues.
6. Update docs/IMPLEMENTATION_PLAN.md.
7. Continue to the next phase when safe.

Do not stop after producing documentation alone. Implement the project.

If a critical external dependency is unavailable, create a clearly defined adapter and a safe mock implementation for development. Do not falsely claim that the real integration works.

Do not repeatedly ask the owner questions that can be resolved through repository inspection or safe architectural defaults.

Record unresolved business decisions explicitly and use conservative defaults until the owner configures them.

==================================================
3. REQUIRED TECHNICAL ARCHITECTURE

Use a modular monolith initially, with clear internal module boundaries.

Do not introduce microservices unless a documented technical requirement justifies them.

Preferred stack, subject to repository compatibility:

Frontend:

* Next.js with TypeScript.
* React.
* Tailwind CSS.
* Accessible component primitives.
* A consistent design system.
* Progressive Web App capabilities.
* Responsive layouts for mobile, tablet, and desktop.
* Installable PWA manifest.
* Appropriate service worker configuration.
* Strict TypeScript.

Backend:

* Node.js with TypeScript.
* A structured server framework compatible with the selected repository.
* REST API with versioned routes.
* OpenAPI documentation.
* Schema-based request validation.
* Centralized authorization and error handling.

Database:

* PostgreSQL as the primary operational database.
* Prisma ORM or another well-supported ORM compatible with the chosen stack.
* Version-controlled migrations.
* Foreign keys, unique constraints, and transactional updates.
* UTC timestamps with appropriate display-time conversion.

Background processing:

* A persistent job queue compatible with the hosting environment.
* Scheduled tasks.
* Retry policies with exponential backoff.
* Idempotent job handlers.
* Job cancellation and graceful shutdown.
* Bounded concurrency.
* Dead-letter or failed-job inspection.

If the selected Hostmaster hosting plan does not support persistent Node.js processes, PostgreSQL, or background workers, do not pretend that these capabilities are available.

Document the limitation and select a compatible deployment topology before production deployment.

A suitable alternative may involve:

* A frontend deployment compatible with the hosting plan.
* A separately hosted API and worker.
* A managed PostgreSQL database.
* A compatible persistent queue.

Do not silently replace reliable background processing with browser timers or localStorage.

Use localStorage only for non-sensitive UI preferences where appropriate.

Use the database as the authoritative source for customers, products, tasks, conversations, orders, permissions, and audit history.

Keep the frontend and backend in a monorepo if practical.

Suggested repository structure:

unutilmas-ai-office/
apps/
web/
api/
worker/
packages/
shared/
validation/
ui/
config/
prisma/
schema.prisma
migrations/
docs/
PROJECT_AUDIT.md
IMPLEMENTATION_PLAN.md
ARCHITECTURE.md
DECISIONS.md
SECURITY.md
PRODUCT_INTEGRATION.md
AGENTS.md
SALES_WORKFLOW.md
DATABASE.md
DEPLOYMENT_HOSTMASTER.md
OPERATIONS.md
scripts/
tests/
.github/
workflows/
.env.example
.gitignore
README.md

Adapt this structure if the existing repository makes a different structure more appropriate.

Do not create unnecessary packages or duplicate abstractions.

==================================================
4. PRODUCT WEBSITE INTEGRATION

The official Unutilmas Ta’m website is the authoritative product information source.

The application must provide a dedicated integration settings page:

“Sayt bilan integratsiya”

Required capabilities:

* Configure the official website base URL.
* Configure API authentication securely.
* Test the connection.
* Synchronize products.
* Display the last successful synchronization.
* Display synchronization errors.
* Display integration status.
* Trigger manual synchronization.
* Support scheduled synchronization.
* Record product data provenance.
* Detect products that were removed or deactivated.
* Avoid creating duplicate products during repeated synchronization.

First inspect the existing website and its actual technology.

Do not assume the website already has a usable API.

If an API exists, document its actual endpoints and authentication requirements.

If an API does not exist, implement a secure integration contract and document the website-side changes required.

Prefer authenticated server-to-server API integration.

Use webhooks for updates where supported and periodic synchronization as a fallback.

Never place integration secrets in frontend JavaScript, PWA bundles, public environment variables, or GitHub.

Never scrape authenticated or private data without authorization.

Never use fragile HTML scraping as the primary integration when a reliable API can be implemented.

If the website has no trustworthy stock information, mark availability as unknown instead of inventing stock.

If the website does not provide wholesale pricing, treat wholesale prices as unconfigured.

Product data model should support:

* External product ID.
* Internal product ID.
* Product name.
* Description.
* SKU if available.
* Package weight.
* Price.
* Currency.
* Product image URLs.
* Frozen-product classification.
* Availability status.
* Last synchronization timestamp.
* Source website.
* Active/inactive status.
* Verified product attributes.
* Optional owner-approved sales description.

Do not invent missing product attributes.

==================================================
5. INITIAL PRODUCT CATALOG

The initial business catalog provided by the owner is:

1. CHUCHVARA 500 g — 25,000 UZS
2. CHUCHVARA 300 g — 16,000 UZS
3. TABIIY RANGLI CHUCHVARA 500 g — 27,000 UZS
4. TABIIY RANGLI CHUCHVARA 300 g — 17,000 UZS
5. TEFTIL 300 g — 24,000 UZS
6. SOMSA XAMIRI DONA 850 g — 18,000 UZS
7. SOMSA XAMIRI RULON 1000 g — 20,000 UZS
8. LAG’MON 1000 g — 15,000 UZS
9. LAG’MON 500 g — 7,500 UZS
10. UGRI 250 g — 8,000 UZS
11. GALUPTSI 1000 g — 40,000 UZS
12. QAT-QAT PATIR — 12,000 UZS

These prices were described as retail prices.

All products are sold frozen.

The delivery coverage is Surxondaryo region, Uzbekistan.

These values may be used for initial development seed data, clearly identified as owner-provided data awaiting verification against the live website.

Once the website integration is operational, the website takes precedence for fields it authoritatively provides.

Do not invent wholesale prices, minimum order quantities, discounts, payment terms, delivery fees, storage conditions, expiry dates, certifications, ingredients, or production capacity.

If a field is unknown, represent it as unknown.

==================================================
6. PREMIUM DESIGN REQUIREMENTS

The visual quality is a major product requirement.

Build a sophisticated, premium, modern AI headquarters rather than a generic admin dashboard.

Design direction:

* Deep graphite.
* Midnight navy.
* Restrained champagne-gold accents.
* Premium typography.
* Strong visual hierarchy.
* Generous spacing.
* Refined surfaces and subtle shadows.
* Carefully controlled animations.
* High-quality icons.
* Smooth responsive transitions.
* Elegant empty states.
* Clear loading, error, and success states.

Avoid:

* Excessive cards.
* Unnecessary gradients.
* Random decorative widgets.
* Excessive neon colors.
* Constant animations.
* Cluttered sidebars.
* Fake statistics.
* Unnecessary charts.
* Decorative features that interfere with actual work.
* Generic template appearance.

The interface language must be Uzbek Latin by default.

Use correct Uzbek labels and consistent terminology.

Keep all user-facing text centralized for future localization.

The application must be usable on:

* Desktop browsers.
* Tablets.
* iPhone-sized mobile screens.
* Installable PWA mode.

Desktop should emphasize the virtual office and operational overview.

Mobile should use a compact, touch-friendly layout with a practical navigation pattern.

Provide light and dark themes if they can be implemented consistently without compromising quality.

Meet reasonable accessibility requirements:

* Keyboard navigation.
* Visible focus.
* Accessible color contrast.
* Reduced-motion support.
* Proper labels.
* Responsive text and controls.

==================================================
7. VIRTUAL OFFICE

Create a premium interactive virtual office.

The office is an operational interface, not a separate game.

Required areas:

* Main headquarters.
* Director’s office.
* Market research workspace.
* Sales workspace.
* Customer communication workspace.
* Order management workspace.

Additional decorative spaces may be added only if they improve the experience without creating unnecessary development complexity.

Every operational room must have a real purpose.

Clicking a room opens its associated agent or operational view.

Show:

* Agent name and role.
* Current state.
* Current task.
* Work schedule.
* Recent completed tasks.
* Relevant performance metrics.
* Start, pause, and stop controls where authorized.
* Links to related customers, conversations, or orders.

Use a responsive visual representation.

A polished isometric or pseudo-3D visual is acceptable if it remains performant and maintainable.

Do not require a heavy real-time 3D engine unless there is a compelling reason.

The office must remain functional on ordinary mobile hardware.

==================================================
8. DIRECTOR CONTROL CENTER

The Director Control Center is the highest-priority operational module.

Create a clear agent management interface.

For each agent support:

* View details.
* Start.
* Pause.
* Resume.
* Stop.
* Configure working days.
* Configure start and end time.
* Configure daily working-hour limits.
* Configure permitted responsibilities.
* Configure task limits.
* Configure communication permissions.
* Configure spending or AI usage limits where supported.
* View execution history.
* View failures.
* View performance.
* Disable.
* Re-enable a previously disabled agent.

Use explicit agent lifecycle states:

* DRAFT
* STOPPED
* SCHEDULED
* RUNNING
* PAUSING
* PAUSED
* ERROR
* DISABLED

Do not confuse an agent’s presence in the UI with a real running process.

Every lifecycle operation must change backend state and be enforced by the worker.

The UI must not simulate a running agent if no backend execution is occurring.

Use safe semantics:

* Pause prevents new tasks and pauses future scheduling.
* Stop prevents new work and requests graceful cancellation of cancellable work.
* Disable blocks new task execution until an authorized administrator re-enables the agent.
* Termination or deletion must never erase historical sales records or audit logs.

Long-running tasks must periodically check cancellation and lifecycle state.

Use owner-controlled authorization for all lifecycle operations.

Record who changed the state, when it happened, and the result.

==================================================
9. AI AGENT ROLES

Implement a small set of specialized logical agents orchestrated by the backend.

Do not require a separate AI model for every role.

Required roles:

A. DIRECTOR AI

* Coordinates workflows.
* Assigns tasks to specialized agents.
* Reviews task outcomes.
* Reports to the owner.
* Cannot bypass authorization, communication restrictions, or approval rules.

B. MARKET RESEARCH AGENT

* Searches permitted sources for relevant businesses.
* Collects publicly available business information.
* Stores source URLs and observation timestamps.
* Avoids duplicate prospects.
* Records uncertainty and evidence.
* Does not bypass authentication, paywalls, CAPTCHAs, or access restrictions.

C. BUSINESS ANALYST AGENT

* Evaluates customer relevance.
* Prioritizes prospects.
* Explains the reasons for a prospect score.
* Uses evidence instead of fabricated assumptions.

D. SALES AGENT

* Prepares product recommendations.
* Uses verified catalog data.
* Explains available products and configured prices.
* Follows owner-approved sales policies.
* Never invents wholesale pricing or special terms.

E. COMMUNICATION AGENT

* Handles conversations through explicitly configured and supported integrations.
* Answers product questions using verified information.
* Tracks messages and delivery outcomes where supported.
* Respects platform rules, consent, opt-outs, and rate limits.

F. ORDER MANAGER AGENT

* Collects requested products and quantities.
* Validates the order structure.
* Checks available authoritative information.
* Calculates totals using deterministic application code.
* Creates an order draft.
* Flags missing information.
* Submits the draft to the owner for review.

The backend must enforce these roles using permissions and task schemas.

Do not rely on natural-language prompts alone to enforce security or financial rules.

==================================================
10. CUSTOMER DISCOVERY AND DATA QUALITY

Create a customer prospect management system.

Store:

* Business name.
* Business category.
* Region and locality.
* Address, when lawfully available.
* Public business contact details, when lawfully collected.
* Source URL.
* Source type.
* Date discovered.
* Last verified timestamp.
* Evidence notes.
* Prospect score.
* Sales status.
* Assigned agent.
* Contact history.
* Opt-out or do-not-contact status.

Deduplicate prospects using normalized identifiers and configurable matching logic.

Avoid creating false certainty.

If an email, phone number, or messaging account is not verified, label it appropriately.

Respect applicable privacy requirements and the terms of source platforms.

Public visibility does not automatically authorize automated messaging.

Do not mass-message unverified lists.

Support suppression lists, contact frequency limits, and a do-not-contact status.

Track source provenance for every imported prospect.

==================================================
11. SALES COMMUNICATIONS

Build a provider-independent communication architecture.

Define an interface for each channel, such as:

* Email provider adapter.
* Telegram Bot API adapter.
* Official WhatsApp Business integration adapter, where approved and available.
* Other messaging integrations only where legitimate API access is available.

Do not assume that IMO or any other messaging platform provides an authorized automation API.

Before implementing a channel, verify that the provider supports the intended use case.

If a provider is unavailable, create an adapter interface and show the integration as NOT CONFIGURED.

Never display a false CONNECTED status.

For initial production operation:

* Research can run automatically within configured limits.
* Sales messages can be drafted automatically.
* Initial outreach must follow the owner’s configured approval policy.
* Automated replies may be enabled only for approved channels and defined use cases.
* Price exceptions and special terms require owner approval.
* Customer opt-outs must immediately suppress future marketing communications.

Store:

* Conversation ID.
* Customer ID.
* Channel.
* Direction.
* Message content.
* Delivery status when available.
* Provider message ID when available.
* Timestamp.
* Agent responsible.
* Approval status.
* Error information.

Never expose provider credentials to the browser.

==================================================
12. ORDER PREPARATION AND OWNER HANDOFF

The goal is to hand over a customer who is genuinely ready to purchase.

Implement an order pipeline:

PROSPECT
-> QUALIFIED
-> CONTACT_PENDING
-> CONTACTED
-> INTERESTED
-> NEGOTIATION
-> ORDER_DRAFT
-> CUSTOMER_CONFIRMATION_PENDING
-> READY_FOR_OWNER_REVIEW
-> APPROVED_FOR_DELIVERY
-> DELIVERED
-> CLOSED

Additional statuses may be introduced when necessary, such as:

* REJECTED.
* CANCELLED.
* ON_HOLD.
* NEEDS_INFORMATION.

Do not mark an order DELIVERED automatically.

The owner manually records delivery completion.

An order draft must include:

* Customer and business details.
* Products.
* Quantities.
* Unit prices.
* Subtotals.
* Total amount.
* Currency.
* Pricing source.
* Availability verification status.
* Customer confirmation status.
* Delivery address if provided.
* Contact details.
* Negotiation notes.
* Missing information.
* Approval history.

Use decimal-safe or integer-minor-unit money handling.

For UZS amounts, do not use floating-point arithmetic for financial totals.

Recalculate totals on the server.

Do not trust frontend-submitted totals.

A price change must be validated against authoritative data.

If current availability cannot be verified, mark it UNKNOWN and require owner review.

The owner receives a notification when an order reaches READY_FOR_OWNER_REVIEW.

Notification channels should be configurable.

Provide a reliable in-app notification center even if external notifications are not configured.

==================================================
13. NEGOTIATION AND BUSINESS RULES

Create owner-configurable sales policies.

Possible settings:

* Approved retail prices.
* Approved wholesale prices, if provided.
* Minimum order quantity, if configured.
* Minimum order value, if configured.
* Approved discount limits, if configured.
* Products that can be promoted.
* Geographic restrictions.
* Communication working hours.
* Escalation rules.
* Conditions requiring human approval.

Until the owner provides wholesale pricing and discount policies:

* Use retail prices only as informational catalog prices.
* Do not claim they are wholesale prices.
* Do not invent discounts.
* Do not promise special terms.
* Escalate price negotiations to the owner.

The AI may explain known product information but must clearly disclose unknown details.

==================================================
14. DATABASE DESIGN

Design a normalized database schema with migrations.

Include appropriate models for:

* User.
* Role.
* Permission.
* Session or authentication records.
* Agent.
* AgentSchedule.
* AgentConfiguration.
* AgentRun.
* AgentTask.
* TaskEvent.
* Product.
* ProductSyncRun.
* Integration.
* Prospect.
* ProspectSource.
* ContactPoint.
* SuppressionRecord.
* Conversation.
* Message.
* SalesOpportunity.
* Order.
* OrderItem.
* Approval.
* Notification.
* AuditLog.
* SystemSetting.
* AIUsageRecord.

Use relational constraints and appropriate indexes.

Store financial amounts in an integer-safe representation.

Record creation and update timestamps.

Use soft deletion where it is operationally appropriate.

Never cascade-delete historical orders or audit records merely because an agent or customer is disabled.

Add tenant boundaries only if multi-tenant functionality is actually required.

Do not build a complex multi-tenant billing system unless explicitly requested.

==================================================
15. SECURITY

Security is a mandatory release requirement.

Implement:

* Secure authentication.
* Role-based authorization.
* Server-side authorization for every privileged operation.
* Secure password hashing if password-based authentication is used.
* Secure session management.
* CSRF protection where applicable.
* Rate limiting.
* Input validation.
* Output encoding.
* Protection against common injection attacks.
* Secure CORS configuration.
* Secure headers.
* Secret management through server environment variables.
* Redacted logs.
* Audit logs for privileged actions.
* Dependency vulnerability checks.
* Backup and restore documentation.

Do not expose secrets in:

* Git history.
* Frontend bundles.
* Public runtime configuration.
* API responses.
* Logs.
* Error pages.

Do not use a client-side “isAdmin” flag as authorization.

Do not trust AI-generated tool arguments without schema validation and permission checks.

Require authentication and authorization before changing agent states, configuring integrations, viewing sensitive customer records, approving orders, or changing business rules.

Implement least privilege for integration credentials.

==================================================
16. AI PROVIDER ABSTRACTION

Create a provider-independent AI service interface.

Potential providers include OpenAI and Anthropic, subject to available credentials and configuration.

The exact provider must be configurable server-side.

Required behavior:

* Structured outputs where supported.
* Strict schema validation.
* Timeouts.
* Retry limits.
* Token or usage budgets.
* Error handling.
* Provider health monitoring.
* Model configuration through environment variables or protected settings.
* Task and usage logging.
* Safe fallback when an AI provider is unavailable.

Do not hardcode a model name throughout the application.

Do not expose AI provider API keys to the client.

Use deterministic application logic for calculations, authorization, scheduling, order totals, and state transitions.

AI must not be the final authority for financial arithmetic or security decisions.

==================================================
17. DIRECTOR DASHBOARD

The main dashboard must prioritize operationally useful information.

Display:

* Agents currently running.
* Agents paused or disabled.
* Tasks in progress.
* Tasks requiring attention.
* New prospects discovered.
* Qualified prospects.
* Active sales conversations.
* Orders awaiting owner review.
* Verified value of order drafts.
* Recent agent failures.
* Website integration status.
* AI provider status.
* Last successful product synchronization.

Do not show fabricated statistics.

Do not label projected revenue as actual revenue.

Clearly distinguish:

* Draft order value.
* Approved order value.
* Delivered sales.
* Revenue, only when supported by actual recorded transactions.

All dashboard figures must be computed from persisted backend data.

==================================================
18. NOTIFICATIONS

Implement in-app notifications for:

* A new order ready for review.
* A customer requesting special terms.
* A prospect requiring manual verification.
* Product synchronization failure.
* AI provider failure.
* Agent task failure.
* Daily or scheduled sales reports.
* Critical integration errors.

Notifications should link to the relevant record.

External Telegram notifications can be implemented through a configured bot.

Do not require Telegram to use the core application.

==================================================
19. TESTING REQUIREMENTS

Write automated tests for critical behavior.

Unit tests:

* Price calculations.
* Product synchronization normalization.
* Prospect deduplication.
* Agent state transitions.
* Permission checks.
* Order validation.
* Schedule calculations.
* Retry and cancellation behavior.

Integration tests:

* Database persistence.
* Product synchronization.
* API authentication.
* Agent lifecycle endpoints.
* Job processing.
* Order creation.
* Approval workflows.
* Notification persistence.

End-to-end tests:

* Administrator signs in.
* Administrator starts an agent.
* Agent discovers a test prospect using a mock provider.
* Prospect is reviewed.
* A mock sales conversation is recorded.
* An order draft is created.
* The owner reviews the order.
* The order becomes ready for delivery.
* The owner records delivery completion.

Security tests:

* Unauthorized users cannot access administrator endpoints.
* Disabled agents cannot execute new tasks.
* Invalid provider credentials do not reveal secrets.
* Duplicate jobs do not duplicate orders or messages.
* Unapproved discounts are rejected.
* Customer opt-outs prevent new marketing messages.

Never use real customer data in automated tests.

Never send real marketing messages from tests.

Use mocked external services in CI.

==================================================
20. OBSERVABILITY AND OPERATIONS

Provide:

* Structured application logs.
* Correlation IDs.
* Task execution history.
* Error categorization.
* Health and readiness endpoints.
* Integration status.
* AI usage tracking.
* Queue status.
* Retry history.
* Graceful shutdown.
* Backup and restore instructions.

Do not log passwords, access tokens, API keys, or unnecessary personal data.

Distinguish temporary failures from permanent failures.

Prevent infinite retry loops.

==================================================
21. GITHUB WORKFLOW

Prepare the project for GitHub.

Implement CI workflows that run:

* Dependency installation using the repository’s package manager.
* Type checking.
* Linting.
* Unit tests.
* Integration tests where appropriate.
* Production build.
* Dependency security checks where practical.

Use a reproducible lockfile.

Create:

* README.md.
* .env.example.
* .gitignore.
* CONTRIBUTING.md if useful.
* GitHub Actions workflows.
* Database migration instructions.
* Development setup instructions.

Never commit .env files, private keys, production credentials, or database passwords.

Do not push code to GitHub unless the user has explicitly authorized the action and the required repository connection is available.

If direct GitHub access is unavailable, prepare the repository locally and provide exact push instructions.

==================================================
22. HOSTMASTER DEPLOYMENT

Prepare a deployment guide specifically for the actual capabilities of the owner’s Hostmaster hosting plan.

Do not assume that all hosting plans support:

* Node.js server processes.
* Persistent workers.
* PostgreSQL.
* WebSockets.
* Process managers.
* Background schedulers.

Inspect existing configuration and ask for hosting-specific details only when genuinely necessary.

Document:

* Required runtime version.
* Build command.
* Production start command.
* Environment variables.
* Database provisioning.
* Database migrations.
* Domain and HTTPS configuration.
* API and frontend routing.
* Worker deployment.
* Scheduled job setup.
* File permissions.
* Logs.
* Health checks.
* Backups.
* Rollback procedure.

If the hosting plan supports only static files and PHP, do not pretend it can run the entire Node.js worker architecture.

Offer a compatible topology and clearly identify which components must run elsewhere.

Never expose secrets in client-side environment variables.

Do not overwrite the production website during deployment.

Do not deploy database migrations without a backup and a documented rollback strategy.

Do not claim that the production site is live until it has been tested.

==================================================
23. DOCUMENTATION

Maintain clear documentation in Uzbek or English where appropriate.

The user-facing setup and operational instructions should be in Uzbek Latin.

Required documentation:

* Architecture overview.
* Repository setup.
* Environment variables.
* Database schema.
* Product website integration contract.
* AI provider setup.
* Agent role definitions.
* Communication channel setup.
* Owner approval workflow.
* Security model.
* Testing instructions.
* GitHub workflow.
* Hostmaster deployment.
* Backup and recovery.
* Known limitations.

Provide example API requests and responses.

Document every integration that requires external credentials.

==================================================
24. ACCEPTANCE CRITERIA

The project is not complete merely because the interface looks attractive.

It must satisfy the following conditions:

1. The application builds successfully.
2. The code passes type checking.
3. Critical tests pass.
4. Administrator authentication works.
5. Server-side permissions are enforced.
6. The agent control panel changes real persisted backend state.
7. Agent schedules are enforced by backend workers.
8. The product integration can synchronize actual product data when valid credentials and endpoints are configured.
9. The integration clearly reports when it is not configured.
10. Prospects can be persisted, deduplicated, reviewed, and prioritized.
11. External communication adapters cannot claim to work without actual configuration.
12. Sales workflows preserve communication and approval history.
13. Orders can be prepared, validated, and handed to the owner.
14. Order calculations are deterministic and server-validated.
15. The system does not mark orders delivered without an explicit owner action.
16. Agent execution can be paused or stopped through backend-enforced controls.
17. No API keys are exposed in frontend code.
18. The interface is responsive and premium.
19. The application works without fake dashboard metrics.
20. GitHub and Hostmaster deployment documentation is complete.
21. All external dependencies and production blockers are documented honestly.

==================================================
25. FINAL INSTRUCTIONS

Start by inspecting the repository.

Do not generate the whole project in one uncontrolled response.

Do not replace real integrations with fake success messages.

Do not build a static mockup and call it a completed product.

Do not create unnecessary features or decorative complexity.

Prioritize:

1. Reliable architecture.
2. Premium interface.
3. Secure product synchronization.
4. Real agent lifecycle management.
5. Customer discovery.
6. Controlled sales automation.
7. Order preparation.
8. Operational reliability.
9. GitHub readiness.
10. Hostmaster deployment readiness.

Make sensible engineering decisions independently.

When a decision depends on missing business information, choose a safe default, document the assumption, and make it configurable.

Keep the code modular, maintainable, testable, and suitable for future expansion.

Begin with PHASE 0 — REPOSITORY INSPECTION.

After the audit, proceed through the implementation phases sequentially, verifying each phase before continuing.

The goal is a genuinely operational AI Sales Headquarters for Unutilmas Ta’m, not merely an impressive-looking prototype.