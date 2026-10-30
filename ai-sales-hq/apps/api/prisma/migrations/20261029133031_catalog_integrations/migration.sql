-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `source` ENUM('FIRESTORE', 'SEED', 'OWNER') NOT NULL,
    `external_id` VARCHAR(64) NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `category_name` VARCHAR(120) NULL,
    `package_weight_grams` INTEGER NULL,
    `unit_type` VARCHAR(32) NULL,
    `sku` VARCHAR(64) NULL,
    `is_frozen` BOOLEAN NOT NULL DEFAULT true,
    `availability` ENUM('UNKNOWN', 'UNVERIFIED', 'IN_STOCK', 'OUT_OF_STOCK') NOT NULL DEFAULT 'UNKNOWN',
    `stock_reported` INTEGER NULL,
    `has_source_image` BOOLEAN NOT NULL DEFAULT false,
    `sales_description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deactivated_at` DATETIME(3) NULL,
    `superseded_by_id` CHAR(36) NULL,
    `last_synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `products_is_active_idx`(`is_active`),
    UNIQUE INDEX `products_source_external_id_key`(`source`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_prices` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `price_type` ENUM('RETAIL', 'WHOLESALE') NOT NULL,
    `amount` BIGINT NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'UZS',
    `source` ENUM('FIRESTORE', 'SEED', 'OWNER') NOT NULL,
    `status` ENUM('OWNER_UNCONFIRMED', 'CONFIRMED', 'SUPERSEDED') NOT NULL,
    `valid_from` DATETIME(3) NOT NULL,
    `valid_to` DATETIME(3) NULL,
    `confirmed_by_id` CHAR(36) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `sync_run_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_prices_product_id_price_type_valid_to_idx`(`product_id`, `price_type`, `valid_to`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_sync_runs` (
    `id` CHAR(36) NOT NULL,
    `source` ENUM('FIRESTORE', 'SEED', 'OWNER') NOT NULL,
    `trigger` ENUM('SCHEDULED', 'MANUAL', 'OWNER_APPROVED') NOT NULL,
    `status` ENUM('RUNNING', 'SUCCEEDED', 'FAILED', 'HELD', 'APPLIED_AFTER_HOLD') NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `source_updated_at` DATETIME(3) NULL,
    `fetched_count` INTEGER NOT NULL DEFAULT 0,
    `created_count` INTEGER NOT NULL DEFAULT 0,
    `updated_count` INTEGER NOT NULL DEFAULT 0,
    `deactivated_count` INTEGER NOT NULL DEFAULT 0,
    `price_change_count` INTEGER NOT NULL DEFAULT 0,
    `invalid_count` INTEGER NOT NULL DEFAULT 0,
    `held_reason` VARCHAR(255) NULL,
    `report` JSON NULL,
    `error_message` VARCHAR(500) NULL,
    `actor_user_id` CHAR(36) NULL,

    INDEX `product_sync_runs_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integrations` (
    `key` VARCHAR(40) NOT NULL,
    `status` ENUM('NOT_CONFIGURED', 'CONFIGURED', 'CONNECTED', 'ERROR') NOT NULL,
    `last_checked_at` DATETIME(3) NULL,
    `last_success_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NULL,
    `settings` JSON NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `kind` VARCHAR(60) NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(255) NULL,
    `dedupe_key` VARCHAR(120) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_read_at_created_at_idx`(`read_at`, `created_at`),
    INDEX `notifications_dedupe_key_idx`(`dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(80) NOT NULL,
    `value` JSON NOT NULL,
    `updated_by_id` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locks` (
    `name` VARCHAR(80) NOT NULL,
    `holder` VARCHAR(80) NOT NULL,
    `locked_until` DATETIME(3) NOT NULL,
    `acquired_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_prices` ADD CONSTRAINT `product_prices_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
