-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `prospect_id` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'NEEDS_INFORMATION', 'CUSTOMER_CONFIRMATION_PENDING', 'READY_FOR_OWNER_REVIEW', 'APPROVED_FOR_DELIVERY', 'DELIVERED', 'CLOSED', 'ON_HOLD', 'REJECTED', 'CANCELLED', 'PRICE_CHANGED') NOT NULL DEFAULT 'DRAFT',
    `total_som` BIGINT NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'UZS',
    `payment_status` ENUM('UNPAID', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `amount_paid_som` BIGINT NOT NULL DEFAULT 0,
    `delivery_address` VARCHAR(300) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `contact_name` VARCHAR(120) NULL,
    `requested_delivery_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `customer_confirmed_at` DATETIME(3) NULL,
    `customer_confirmation` VARCHAR(500) NULL,
    `created_by_agent_key` VARCHAR(40) NULL,
    `created_by_id` CHAR(36) NULL,
    `approved_by_id` CHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `delivered_by_id` CHAR(36) NULL,
    `delivered_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_number_key`(`number`),
    INDEX `orders_status_idx`(`status`),
    INDEX `orders_prospect_id_idx`(`prospect_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `product_name` VARCHAR(200) NOT NULL,
    `package_weight_grams` INTEGER NULL,
    `quantity` INTEGER NOT NULL,
    `price_type` ENUM('RETAIL', 'WHOLESALE') NOT NULL,
    `price_id` CHAR(36) NOT NULL,
    `price_source` ENUM('FIRESTORE', 'SEED', 'OWNER') NOT NULL,
    `unit_price_som` BIGINT NOT NULL,
    `line_total_som` BIGINT NOT NULL,
    `snapshot_at` DATETIME(3) NOT NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` CHAR(36) NOT NULL,
    `from_status` ENUM('DRAFT', 'NEEDS_INFORMATION', 'CUSTOMER_CONFIRMATION_PENDING', 'READY_FOR_OWNER_REVIEW', 'APPROVED_FOR_DELIVERY', 'DELIVERED', 'CLOSED', 'ON_HOLD', 'REJECTED', 'CANCELLED', 'PRICE_CHANGED') NULL,
    `to_status` ENUM('DRAFT', 'NEEDS_INFORMATION', 'CUSTOMER_CONFIRMATION_PENDING', 'READY_FOR_OWNER_REVIEW', 'APPROVED_FOR_DELIVERY', 'DELIVERED', 'CLOSED', 'ON_HOLD', 'REJECTED', 'CANCELLED', 'PRICE_CHANGED') NOT NULL,
    `actor_type` VARCHAR(16) NOT NULL,
    `actor_id` VARCHAR(64) NULL,
    `note` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `order_events_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `amount_som` BIGINT NOT NULL,
    `note` VARCHAR(300) NULL,
    `recorded_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `payments_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
