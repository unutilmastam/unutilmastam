-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `telegram_sent_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `agents` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `state` ENUM('DRAFT', 'STOPPED', 'SCHEDULED', 'RUNNING', 'PAUSING', 'PAUSED', 'STOPPING', 'ERROR', 'DISABLED') NOT NULL DEFAULT 'DRAFT',
    `state_reason` VARCHAR(40) NULL,
    `state_changed_at` DATETIME(3) NOT NULL,
    `error_message` VARCHAR(500) NULL,
    `working_days` JSON NOT NULL,
    `start_time` CHAR(5) NOT NULL,
    `end_time` CHAR(5) NOT NULL,
    `daily_task_limit` INTEGER NOT NULL,
    `permissions` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agents_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` CHAR(36) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `agent_id` CHAR(36) NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `payload` JSON NULL,
    `result` JSON NULL,
    `idempotency_key` VARCHAR(160) NULL,
    `run_at` DATETIME(3) NOT NULL,
    `locked_until` DATETIME(3) NULL,
    `locked_by` VARCHAR(80) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `last_error` VARCHAR(1000) NULL,
    `cancel_requested_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,

    UNIQUE INDEX `jobs_idempotency_key_key`(`idempotency_key`),
    INDEX `jobs_status_run_at_idx`(`status`, `run_at`),
    INDEX `jobs_agent_id_status_idx`(`agent_id`, `status`),
    INDEX `jobs_agent_id_started_at_idx`(`agent_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `job_id` CHAR(36) NOT NULL,
    `level` VARCHAR(10) NOT NULL,
    `message` VARCHAR(1000) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `job_events_job_id_idx`(`job_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `worker_runs` (
    `id` CHAR(36) NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `status` VARCHAR(20) NOT NULL,
    `jobs_processed` INTEGER NOT NULL DEFAULT 0,
    `transitions` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(1000) NULL,

    INDEX `worker_runs_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `jobs` ADD CONSTRAINT `jobs_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_events` ADD CONSTRAINT `job_events_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
