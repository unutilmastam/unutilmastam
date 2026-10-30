-- CreateTable
CREATE TABLE `prospects` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `normalized_name` VARCHAR(200) NOT NULL,
    `category` ENUM('SUPERMARKET', 'MINIMARKET', 'GROCERY', 'WHOLESALE', 'FOOD_RETAIL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `region` VARCHAR(60) NOT NULL DEFAULT 'Surxondaryo',
    `district` VARCHAR(60) NULL,
    `address` VARCHAR(300) NULL,
    `contact_person_name` VARCHAR(120) NULL,
    `lat` DECIMAL(9, 6) NULL,
    `lng` DECIMAL(9, 6) NULL,
    `location_quality` ENUM('EXACT', 'APPROXIMATE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `google_place_id` VARCHAR(200) NULL,
    `rating` DECIMAL(2, 1) NULL,
    `rating_count` INTEGER NULL,
    `stage` ENUM('NEW', 'NEEDS_VERIFICATION', 'QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'INTERESTED', 'NEGOTIATION', 'WON', 'LOST', 'DO_NOT_CONTACT') NOT NULL DEFAULT 'NEW',
    `is_existing_customer` BOOLEAN NOT NULL DEFAULT false,
    `score` INTEGER NULL,
    `score_reasons` JSON NULL,
    `scored_at` DATETIME(3) NULL,
    `assigned_agent_key` VARCHAR(40) NULL,
    `notes` TEXT NULL,
    `discovered_at` DATETIME(3) NOT NULL,
    `last_verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prospects_google_place_id_key`(`google_place_id`),
    INDEX `prospects_stage_idx`(`stage`),
    INDEX `prospects_district_normalized_name_idx`(`district`, `normalized_name`),
    INDEX `prospects_score_idx`(`score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prospect_sources` (
    `id` CHAR(36) NOT NULL,
    `prospect_id` CHAR(36) NOT NULL,
    `source_type` ENUM('FIRESTORE_STORE', 'MANUAL', 'CSV', 'GOOGLE_PLACES') NOT NULL,
    `external_id` VARCHAR(200) NULL,
    `source_url` VARCHAR(500) NULL,
    `observed_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `evidence` JSON NULL,
    `created_by_id` CHAR(36) NULL,

    INDEX `prospect_sources_prospect_id_idx`(`prospect_id`),
    INDEX `prospect_sources_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `prospect_sources_source_type_external_id_key`(`source_type`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_points` (
    `id` CHAR(36) NOT NULL,
    `prospect_id` CHAR(36) NOT NULL,
    `kind` ENUM('PHONE', 'TELEGRAM', 'EMAIL', 'WEBSITE') NOT NULL,
    `value` VARCHAR(200) NOT NULL,
    `source_type` ENUM('FIRESTORE_STORE', 'MANUAL', 'CSV', 'GOOGLE_PLACES') NOT NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(3) NULL,
    `verified_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contact_points_kind_value_idx`(`kind`, `value`),
    UNIQUE INDEX `contact_points_prospect_id_kind_value_key`(`prospect_id`, `kind`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppression_records` (
    `id` CHAR(36) NOT NULL,
    `kind` ENUM('PHONE', 'TELEGRAM', 'PLACE', 'PROSPECT') NOT NULL,
    `value` VARCHAR(200) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `created_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `suppression_records_kind_value_key`(`kind`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_usage` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `day` CHAR(10) NOT NULL,
    `requests` INTEGER NOT NULL DEFAULT 0,
    `estimated_micro_usd` BIGINT NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `provider_usage_provider_day_key`(`provider`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prospect_sources` ADD CONSTRAINT `prospect_sources_prospect_id_fkey` FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_points` ADD CONSTRAINT `contact_points_prospect_id_fkey` FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
