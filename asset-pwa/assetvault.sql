-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Dec 11, 2025 at 11:21 AM
-- Server version: 9.1.0
-- PHP Version: 8.3.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `assetvault`
--

-- --------------------------------------------------------

--
-- Table structure for table `assignments`
--

DROP TABLE IF EXISTS `assignments`;
CREATE TABLE IF NOT EXISTS `assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id_int` int NOT NULL,
  `serial_no` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` int NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `due_back_date` date DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `assigned_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_asg_item_active` (`returned_at`),
  KEY `idx_asg_person` (`person_id`,`assigned_at`),
  KEY `ix_asg_serial` (`serial_no`),
  KEY `ix_asg_item_int` (`item_id_int`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Triggers `assignments`
--
DROP TRIGGER IF EXISTS `trg_asg_after_insert`;
DELIMITER $$
CREATE TRIGGER `trg_asg_after_insert` AFTER INSERT ON `assignments` FOR EACH ROW BEGIN
  UPDATE items SET current_holder_id = NEW.person_id, status='assigned'
  WHERE id = NEW.item_id_int;
END
$$
DELIMITER ;
DROP TRIGGER IF EXISTS `trg_asg_after_update_return`;
DELIMITER $$
CREATE TRIGGER `trg_asg_after_update_return` AFTER UPDATE ON `assignments` FOR EACH ROW BEGIN
  IF NEW.returned_at IS NOT NULL AND OLD.returned_at IS NULL THEN
    UPDATE items SET current_holder_id = NULL, status='in_stock'
    WHERE id = NEW.item_id_int;
  END IF;
END
$$
DELIMITER ;
DROP TRIGGER IF EXISTS `trg_asg_copy_serial`;
DELIMITER $$
CREATE TRIGGER `trg_asg_copy_serial` BEFORE INSERT ON `assignments` FOR EACH ROW BEGIN
  IF (NEW.serial_no IS NULL OR NEW.serial_no = '') THEN
    SET NEW.serial_no = (SELECT serial_no FROM items WHERE id = NEW.item_id_int LIMIT 1);
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `assignments_backup`
--

DROP TABLE IF EXISTS `assignments_backup`;
CREATE TABLE IF NOT EXISTS `assignments_backup` (
  `id` int NOT NULL DEFAULT '0',
  `serial_no` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` int NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `due_back_date` date DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `assigned_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
CREATE TABLE IF NOT EXISTS `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `entries`
--

DROP TABLE IF EXISTS `entries`;
CREATE TABLE IF NOT EXISTS `entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `event` enum('assign','transfer','return') NOT NULL,
  `item_id` varchar(64) NOT NULL,
  `from_holder` varchar(128) DEFAULT NULL,
  `to_holder` varchar(128) DEFAULT NULL,
  `by_user` varchar(64) DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items`
--

DROP TABLE IF EXISTS `items`;
CREATE TABLE IF NOT EXISTS `items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `serial_no` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_no` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_from` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_to` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `category` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('in_stock','assigned','repair','lost','retired') COLLATE utf8mb4_unicode_ci DEFAULT 'in_stock',
  `current_holder_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_items_serial` (`serial_no`),
  UNIQUE KEY `uk_items_serial` (`serial_no`),
  KEY `serial_no` (`serial_no`),
  KEY `model_no` (`model_no`),
  KEY `department` (`department`),
  KEY `owner` (`owner`),
  KEY `ix_items_holder` (`current_holder_id`),
  KEY `idx_items_model_no` (`model_no`),
  KEY `idx_items_created_at` (`created_at`),
  KEY `idx_items_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `items_backup`
--

DROP TABLE IF EXISTS `items_backup`;
CREATE TABLE IF NOT EXISTS `items_backup` (
  `item_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `serial_no` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_no` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_from` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_to` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `category` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('in_stock','assigned','repair','lost','retired') COLLATE utf8mb4_unicode_ci DEFAULT 'in_stock',
  `current_holder_id` int DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `item_photos`
--

DROP TABLE IF EXISTS `item_photos`;
CREATE TABLE IF NOT EXISTS `item_photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id_int` int NOT NULL,
  `item_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `photo_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_item_photos_item` (`item_id`),
  KEY `ix_photos_item_int` (`item_id_int`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `people`
--

DROP TABLE IF EXISTS `people`;
CREATE TABLE IF NOT EXISTS `people` (
  `id` int NOT NULL AUTO_INCREMENT,
  `emp_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `full_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` int DEFAULT NULL,
  `email` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive','left') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `emp_code` (`emp_code`),
  KEY `department_id` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `services`
--

DROP TABLE IF EXISTS `services`;
CREATE TABLE IF NOT EXISTS `services` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_date` date DEFAULT NULL,
  `vendor` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `done` tinyint(1) NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_services_item` (`item_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `service_records`
--

DROP TABLE IF EXISTS `service_records`;
CREATE TABLE IF NOT EXISTS `service_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_date` datetime NOT NULL,
  `serviced` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('scheduled','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `location` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technician` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `page_count` int DEFAULT NULL,
  `cost_cents` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `next_due_date` date DEFAULT NULL,
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_svc_item` (`item_id`),
  KEY `idx_svc_status_date` (`status`,`service_date`),
  KEY `idx_svc_next_due` (`next_due_date`),
  KEY `idx_item_date` (`item_id`,`service_date`),
  KEY `idx_item` (`item_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','staff') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `assignments`
--
ALTER TABLE `assignments`
  ADD CONSTRAINT `fk_asg_item` FOREIGN KEY (`item_id_int`) REFERENCES `items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_asg_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_asg_serial` FOREIGN KEY (`serial_no`) REFERENCES `items` (`serial_no`) ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
