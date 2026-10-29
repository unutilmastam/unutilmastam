-- CreateTable
CREATE TABLE `conversations` (
    `id` CHAR(36) NOT NULL,
    `prospect_id` CHAR(36) NOT NULL,
    `follow_up_at` DATETIME(3) NULL,
    `needs_owner` BOOLEAN NOT NULL DEFAULT false,
    `needs_owner_why` VARCHAR(300) NULL,
    `last_contact_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `conversations_prospect_id_key`(`prospect_id`),
    INDEX `conversations_needs_owner_idx`(`needs_owner`),
    INDEX `conversations_follow_up_at_idx`(`follow_up_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `conversation_id` CHAR(36) NOT NULL,
    `direction` ENUM('OUTBOUND', 'INBOUND') NOT NULL,
    `channel` ENUM('PHONE_CALL', 'SMS', 'TELEGRAM', 'IN_PERSON') NULL,
    `body` TEXT NOT NULL,
    `language` VARCHAR(5) NOT NULL DEFAULT 'uz',
    `status` ENUM('DRAFT', 'NEEDS_EDIT', 'SENT_MANUALLY', 'RECEIVED', 'DISCARDED') NOT NULL,
    `checks` JSON NULL,
    `outcome` ENUM('INTERESTED', 'NO_ANSWER', 'CALL_BACK', 'NOT_INTERESTED', 'DO_NOT_CONTACT') NULL,
    `agent_key` VARCHAR(40) NULL,
    `generated_by` VARCHAR(60) NULL,
    `created_by_id` CHAR(36) NULL,
    `approved_by_id` CHAR(36) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    INDEX `messages_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_usage_records` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `model` VARCHAR(60) NOT NULL,
    `purpose` VARCHAR(60) NOT NULL,
    `agent_key` VARCHAR(40) NULL,
    `job_id` CHAR(36) NULL,
    `input_tokens` INTEGER NOT NULL,
    `output_tokens` INTEGER NOT NULL,
    `cost_micro_usd` BIGINT NOT NULL,
    `ok` BOOLEAN NOT NULL,
    `error` VARCHAR(300) NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `ai_usage_records_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
