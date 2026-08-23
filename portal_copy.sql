-- phpMyAdmin SQL Dump
-- version 4.9.0.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Dec 23, 2019 at 04:26 PM
-- Server version: 5.6.45
-- PHP Version: 7.3.6

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `portal_copy`
--

-- --------------------------------------------------------

--
-- Table structure for table `ab_tests`
--

CREATE TABLE `ab_tests` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(30) NOT NULL,
  `type` smallint(5) UNSIGNED NOT NULL COMMENT '1=signup, 2=conversion',
  `description` varchar(500) NOT NULL,
  `started` datetime DEFAULT NULL,
  `stopped` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `ab_tests_landings`
--

CREATE TABLE `ab_tests_landings` (
  `id` int(10) UNSIGNED NOT NULL,
  `ab_test_id` int(10) UNSIGNED NOT NULL,
  `landing_id` int(10) UNSIGNED NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `ab_tests_miners`
--

CREATE TABLE `ab_tests_miners` (
  `id` int(10) UNSIGNED NOT NULL,
  `miner_id` int(10) UNSIGNED NOT NULL,
  `ab_test_id` int(10) UNSIGNED NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `action_logs`
--

CREATE TABLE `action_logs` (
  `id` int(10) UNSIGNED NOT NULL,
  `ip` int(10) UNSIGNED DEFAULT NULL,
  `action` varchar(25) NOT NULL,
  `time` float NOT NULL,
  `peak_memory` int(11) NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `bitcoinpayflow_notifications`
--

CREATE TABLE `bitcoinpayflow_notifications` (
  `id` int(10) UNSIGNED NOT NULL,
  `purchase_id` int(10) UNSIGNED DEFAULT NULL,
  `foreign_order_id` int(10) UNSIGNED DEFAULT NULL,
  `amount` decimal(18,9) NOT NULL,
  `transaction_fee` decimal(18,9) DEFAULT NULL,
  `bitcoin_address` varchar(50) NOT NULL,
  `number_of_confirmations` mediumint(8) UNSIGNED NOT NULL,
  `transaction_timestamp` int(10) UNSIGNED NOT NULL,
  `category` varchar(20) NOT NULL,
  `order_status` varchar(20) NOT NULL,
  `signature` varchar(100) NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `bitcoinpayflow_orders`
--

CREATE TABLE `bitcoinpayflow_orders` (
  `id` int(10) UNSIGNED NOT NULL,
  `miner_id` int(10) UNSIGNED NOT NULL,
  `price_point_id` int(10) UNSIGNED NOT NULL,
  `bitcoin_address` varchar(60) DEFAULT NULL,
  `paid` tinyint(3) UNSIGNED NOT NULL DEFAULT '0',
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `bitpay_notifications`
--

CREATE TABLE `bitpay_notifications` (
  `id` varchar(200) NOT NULL,
  `purchase_id` int(10) UNSIGNED DEFAULT NULL,
  `url` varchar(500) NOT NULL,
  `posData` varchar(150) NOT NULL,
  `status` varchar(20) NOT NULL,
  `btcPrice` decimal(16,8) NOT NULL,
  `price` decimal(16,8) NOT NULL,
  `currency` varchar(10) NOT NULL,
  `invoiceTime` int(11) UNSIGNED NOT NULL,
  `expirationTime` int(11) UNSIGNED NOT NULL,
  `currentTime` int(11) UNSIGNED NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `cake_sessions`
--

CREATE TABLE `cake_sessions` (
  `id` varchar(255) NOT NULL DEFAULT '',
  `data` text,
  `expires` int(11) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `coupons`
--

CREATE TABLE `coupons` (
  `id` int(10) UNSIGNED NOT NULL,
  `coupon_bonus_id` int(10) UNSIGNED NOT NULL,
  `code` varchar(60) DEFAULT NULL COMMENT 'if null, code is defined in coupons_miners',
  `case_sensitive` tinyint(3) UNSIGNED NOT NULL DEFAULT '0' COMMENT 'only applies to code in this table',
  `miner_must_be_newer_than` mediumint(8) UNSIGNED DEFAULT NULL COMMENT 'measured in days.  0 to disable.',
  `expires` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `coupons`
--

INSERT INTO `coupons` (`id`, `coupon_bonus_id`, `code`, `case_sensitive`, `miner_must_be_newer_than`, `expires`) VALUES
(1, 1, '', 0, NULL, '2011-07-17 18:38:00'),
(2, 2, 'reddit', 0, 7, '2015-05-11 23:59:00'),
(3, 2, 'FTL', 0, 7, '2013-03-04 15:25:00'),
(4, 2, 'starter', 0, 7, '2026-01-01 15:03:00'),
(5, 2, 'Ridley', 0, 7, '2013-11-07 18:47:00'),
(6, 2, 'bitcoin', 0, 7, '2013-12-30 14:15:00'),
(7, 2, 'incremental', 0, 7, '2015-05-13 18:06:00'),
(8, 3, 'NewRPGcredits', 0, 10, '2015-11-11 19:31:00');

-- --------------------------------------------------------

--
-- Table structure for table `coupons_miners`
--

CREATE TABLE `coupons_miners` (
  `id` int(10) UNSIGNED NOT NULL,
  `coupon_id` int(10) UNSIGNED NOT NULL,
  `miner_id` int(10) UNSIGNED DEFAULT NULL,
  `code` varchar(60) DEFAULT NULL COMMENT 'If null, code is defined in coupons table',
  `expires` datetime DEFAULT NULL,
  `modified` datetime NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `coupon_bonuses`
--

CREATE TABLE `coupon_bonuses` (
  `id` int(10) UNSIGNED NOT NULL,
  `description` varchar(500) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `coupon_bonuses`
--

INSERT INTO `coupon_bonuses` (`id`, `description`) VALUES
(1, 'Starter mine and 20 credits'),
(2, 'Starter rental'),
(3, '20 credits NewRPG');

-- --------------------------------------------------------

--
-- Table structure for table `credit_adjustments`
--

CREATE TABLE `credit_adjustments` (
  `id` int(10) UNSIGNED NOT NULL,
  `miner_id` int(10) UNSIGNED NOT NULL,
  `credits` int(11) NOT NULL,
  `reason` varchar(300) NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `daopay_notifications`
--

CREATE TABLE `daopay_notifications` (
  `id` int(10) UNSIGNED NOT NULL,
  `purchase_id` int(10) UNSIGNED DEFAULT NULL,
  `tid` int(11) DEFAULT NULL,
  `stat` varchar(20) DEFAULT NULL,
  `duration` int(11) DEFAULT NULL,
  `calltime` int(11) DEFAULT NULL,
  `countrycode` varchar(3) DEFAULT NULL,
  `appcode` int(11) DEFAULT NULL,
  `paid` decimal(9,2) DEFAULT NULL,
  `currency` varchar(5) DEFAULT NULL,
  `origin` varchar(15) DEFAULT NULL,
  `prodprice` decimal(9,2) DEFAULT NULL,
  `prodcurrency` varchar(5) DEFAULT NULL,
  `payout` decimal(9,2) DEFAULT NULL,
  `mcx` tinyint(1) DEFAULT NULL,
  `mcxtid` int(11) DEFAULT NULL,
  `mcxtimeout` int(11) DEFAULT NULL,
  `mcxtariff` float DEFAULT NULL,
  `mcxcurrency` varchar(5) DEFAULT NULL,
  `user` int(10) UNSIGNED DEFAULT NULL,
  `ip` int(11) NOT NULL,
  `created` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `dimensions`
--

CREATE TABLE `dimensions` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(15) NOT NULL,
  `domain` varchar(60) NOT NULL,
  `ip` bigint(20) NOT NULL,
  `port` mediumint(8) UNSIGNED NOT NULL,
  `miner_count` int(10) UNSIGNED NOT NULL DEFAULT '0',
  `signup_weight` smallint(5) UNSIGNED NOT NULL,
  `hide` tinyint(3) UNSIGNED NOT NULL DEFAULT '0',
  `created` datetime NOT NULL,
  `modified` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `dimensions`
--

INSERT INTO `dimensions` (`id`, `name`, `domain`, `ip`, `port`, `miner_count`, `signup_weight`, `hide`, `created`, `modified`) VALUES
(1, 'Aso', 'aso.minethings.com', 1755066815, 5555, 112, 0, 0, '2008-12-01 18:32:22', '2019-11-12 02:35:03'),
(2, 'Bromo', 'bromo.minethings.com', 1755066815, 5556, 97, 0, 0, '2010-10-08 18:32:56', '2019-11-12 02:35:03'),
(3, 'Calbuco', 'calbuco.minethings.com', 1755066815, 5557, 68, 0, 0, '2011-11-20 00:00:00', '2019-11-12 02:35:03'),
(6, 'Dempo', 'dempo.minethings.com', 1755066815, 5558, 83, 0, 0, '2013-02-07 00:00:00', '2019-11-12 02:35:04'),
(7, 'Ebeko', 'ebeko.minethings.com', 1755066815, 5559, 100, 10, 0, '2014-04-02 00:00:00', '2019-11-12 02:35:04'),
(8, 'Fogo', 'fogo.minethings.com', 1755066815, 5560, 106, 30, 0, '2015-04-02 00:00:00', '2019-11-12 02:35:04'),
(9, 'Gallego', 'gallego.minethings.com', 1755066815, 5561, 256, 60, 0, '2016-05-22 00:00:00', '2019-11-12 02:35:04');

-- --------------------------------------------------------

--
-- Table structure for table `expenses`
--

CREATE TABLE `expenses` (
  `id` int(10) UNSIGNED NOT NULL,
  `cash` decimal(9,2) NOT NULL,
  `description` varchar(500) NOT NULL,
  `amortization_days` smallint(6) NOT NULL DEFAULT '1',
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `facebook_joins`
--

CREATE TABLE `facebook_joins` (
  `id` int(10) UNSIGNED NOT NULL,
  `facebook_uid` bigint(20) NOT NULL,
  `miner_id` int(10) UNSIGNED NOT NULL,
  `box_fbml` longtext NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `landings`
--

CREATE TABLE `landings` (
  `id` int(10) UNSIGNED NOT NULL,
  `ip` bigint(11) DEFAULT NULL,
  `referrer_url` varchar(256) DEFAULT NULL,
  `ad_id` int(11) DEFAULT NULL,
  `recruiter_id` int(10) UNSIGNED DEFAULT NULL,
  `signed_up` int(10) UNSIGNED NOT NULL DEFAULT '0',
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `miners`
--

CREATE TABLE `miners` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(20) NOT NULL,
  `password` varchar(50) NOT NULL,
  `landing_id` int(10) UNSIGNED NOT NULL,
  `recruiter_id` int(10) UNSIGNED DEFAULT NULL,
  `referrer_id` int(10) UNSIGNED DEFAULT NULL,
  `ad_id` int(10) UNSIGNED DEFAULT NULL,
  `ip` bigint(11) DEFAULT NULL,
  `authority` smallint(5) UNSIGNED NOT NULL,
  `email` varchar(320) DEFAULT NULL,
  `current_dimension` int(10) UNSIGNED DEFAULT NULL COMMENT 'dimension_id if logged in',
  `credits` int(10) UNSIGNED NOT NULL,
  `converted` tinyint(3) UNSIGNED NOT NULL DEFAULT '0',
  `built_bot` tinyint(1) NOT NULL DEFAULT '0',
  `retained` tinyint(1) UNSIGNED NOT NULL DEFAULT '0',
  `recruited` tinyint(1) NOT NULL DEFAULT '0',
  `purchased` tinyint(4) NOT NULL DEFAULT '0',
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `minethings_globals`
--

CREATE TABLE `minethings_globals` (
  `id` int(10) UNSIGNED NOT NULL,
  `btcusd` float UNSIGNED NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `minethings_globals`
--

INSERT INTO `minethings_globals` (`id`, `btcusd`) VALUES
(1, 7550.63);

-- --------------------------------------------------------

--
-- Table structure for table `mybitcoin_notifications`
--

CREATE TABLE `mybitcoin_notifications` (
  `id` int(10) UNSIGNED NOT NULL,
  `purchase_id` int(10) UNSIGNED DEFAULT NULL,
  `version` varchar(10) NOT NULL,
  `code` varchar(5) NOT NULL,
  `reason` varchar(30) NOT NULL,
  `transaction_number` int(11) NOT NULL,
  `transaction_date` datetime NOT NULL,
  `payer` varchar(50) NOT NULL,
  `payee` varchar(50) NOT NULL,
  `amount` decimal(20,10) NOT NULL,
  `payment_note` varchar(50) NOT NULL,
  `baggage_field` varchar(50) NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `paypal_notifications`
--

CREATE TABLE `paypal_notifications` (
  `id` char(36) NOT NULL,
  `purchase_id` int(10) UNSIGNED DEFAULT NULL,
  `notify_version` varchar(64) DEFAULT NULL COMMENT 'IPN Version Number',
  `verify_sign` varchar(127) DEFAULT NULL COMMENT 'Encrypted string used to verify the authenticityof the tansaction',
  `test_ipn` int(11) DEFAULT NULL,
  `address_city` varchar(40) DEFAULT NULL COMMENT 'City of customers address',
  `address_country` varchar(64) DEFAULT NULL COMMENT 'Country of customers address',
  `address_country_code` varchar(2) DEFAULT NULL COMMENT 'Two character ISO 3166 country code',
  `address_name` varchar(128) DEFAULT NULL COMMENT 'Name used with address (included when customer provides a Gift address)',
  `address_state` varchar(40) DEFAULT NULL COMMENT 'State of customer address',
  `address_status` varchar(20) DEFAULT NULL COMMENT 'confirmed/unconfirmed',
  `address_street` varchar(200) DEFAULT NULL COMMENT 'Customer''s street address',
  `address_zip` varchar(20) DEFAULT NULL COMMENT 'Zip code of customer''s address',
  `first_name` varchar(64) DEFAULT NULL COMMENT 'Customer''s first name',
  `last_name` varchar(64) DEFAULT NULL COMMENT 'Customer''s last name',
  `payer_business_name` varchar(127) DEFAULT NULL COMMENT 'Customer''s company name, if customer represents a business',
  `payer_email` varchar(127) DEFAULT NULL COMMENT 'Customer''s primary email address. Use this email to provide any credits',
  `payer_id` varchar(13) DEFAULT NULL COMMENT 'Unique customer ID.',
  `payer_status` varchar(20) DEFAULT NULL COMMENT 'verified/unverified',
  `contact_phone` varchar(20) DEFAULT NULL COMMENT 'Customer''s telephone number.',
  `residence_country` varchar(2) DEFAULT NULL COMMENT 'Two-Character ISO 3166 country code',
  `business` varchar(127) DEFAULT NULL COMMENT 'Email address or account ID of the payment recipient (that is, the merchant). Equivalent to the values of receiver_email (If payment is sent to primary account) and business set in the Website Payment HTML.',
  `item_name` varchar(127) DEFAULT NULL COMMENT 'Item name as passed by you, the merchant. Or, if not passed by you, as entered by your customer. If this is a shopping cart transaction, Paypal will append the number of the item (e.g., item_name_1,item_name_2, and so forth).',
  `item_number` varchar(127) DEFAULT NULL COMMENT 'Pass-through variable for you to track purchases. It will get passed back to you at the completion of the payment. If omitted, no variable will be passed back to you.',
  `quantity` varchar(127) DEFAULT NULL COMMENT 'Quantity as entered by your customer or as passed by you, the merchant. If this is a shopping cart transaction, PayPal appends the number of the item (e.g., quantity1,quantity2).',
  `receiver_email` varchar(127) DEFAULT NULL COMMENT 'Primary email address of the payment recipient (that is, the merchant). If the payment is sent to a non-primary email address on your PayPal account, the receiver_email is still your primary email.',
  `receiver_id` varchar(13) DEFAULT NULL COMMENT 'Unique account ID of the payment recipient (i.e., the merchant). This is the same as the recipients referral ID.',
  `custom` varchar(255) DEFAULT NULL COMMENT 'Custom value as passed by you, the merchant. These are pass-through variables that are never presented to your customer.',
  `invoice` varchar(127) DEFAULT NULL COMMENT 'Pass through variable you can use to identify your invoice number for this purchase. If omitted, no variable is passed back.',
  `memo` varchar(255) DEFAULT NULL COMMENT 'Memo as entered by your customer in PayPal Website Payments note field.',
  `option_name_1` varchar(64) DEFAULT NULL COMMENT 'Option name 1 as requested by you',
  `option_name_2` varchar(64) DEFAULT NULL COMMENT 'Option 2 name as requested by you',
  `option_selection1` varchar(200) DEFAULT NULL COMMENT 'Option 1 choice as entered by your customer',
  `option_selection2` varchar(200) DEFAULT NULL COMMENT 'Option 2 choice as entered by your customer',
  `tax` decimal(10,2) DEFAULT NULL COMMENT 'Amount of tax charged on payment',
  `auth_id` varchar(19) DEFAULT NULL COMMENT 'Authorization identification number',
  `auth_exp` varchar(28) DEFAULT NULL COMMENT 'Authorization expiration date and time, in the following format: HH:MM:SS DD Mmm YY, YYYY PST',
  `auth_amount` int(11) DEFAULT NULL COMMENT 'Authorization amount',
  `auth_status` varchar(20) DEFAULT NULL COMMENT 'Status of authorization',
  `num_cart_items` int(11) DEFAULT NULL COMMENT 'If this is a PayPal shopping cart transaction, number of items in the cart',
  `parent_txn_id` varchar(19) DEFAULT NULL COMMENT 'In the case of a refund, reversal, or cancelled reversal, this variable contains the txn_id of the original transaction, while txn_id contains a new ID for the new transaction.',
  `payment_date` varchar(28) DEFAULT NULL COMMENT 'Time/date stamp generated by PayPal, in the following format: HH:MM:SS DD Mmm YY, YYYY PST',
  `payment_status` varchar(20) DEFAULT NULL COMMENT 'Payment status of the payment',
  `payment_type` varchar(10) DEFAULT NULL COMMENT 'echeck/instant',
  `pending_reason` varchar(20) DEFAULT NULL COMMENT 'This variable is only set if payment_status=pending',
  `reason_code` varchar(20) DEFAULT NULL COMMENT 'This variable is only set if payment_status=reversed',
  `remaining_settle` int(11) DEFAULT NULL COMMENT 'Remaining amount that can be captured with Authorization and Capture',
  `shipping_method` varchar(64) DEFAULT NULL COMMENT 'The name of a shipping method from the shipping calculations section of the merchants account profile. The buyer selected the named shipping method for this transaction',
  `shipping` decimal(10,2) DEFAULT NULL COMMENT 'Shipping charges associated with this transaction. Format unsigned, no currency symbol, two decimal places',
  `transaction_entity` varchar(20) DEFAULT NULL COMMENT 'Authorization and capture transaction entity',
  `txn_id` varchar(19) DEFAULT '' COMMENT 'A unique transaction ID generated by PayPal',
  `txn_type` varchar(20) DEFAULT NULL COMMENT 'cart/express_checkout/send-money/virtual-terminal/web-accept',
  `exchange_rate` decimal(10,2) DEFAULT NULL COMMENT 'Exchange rate used if a currency conversion occured',
  `mc_currency` varchar(3) DEFAULT NULL COMMENT 'Three character country code. For payment IPN notifications, this is the currency of the payment, for non-payment subscription IPN notifications, this is the currency of the subscription.',
  `mc_fee` decimal(10,2) DEFAULT NULL COMMENT 'Transaction fee associated with the payment, mc_gross minus mc_fee equals the amount deposited into the receiver_email account. Equivalent to payment_fee for USD payments. If this amount is negative, it signifies a refund or reversal, and either ofthose p',
  `mc_gross` decimal(10,2) DEFAULT NULL COMMENT 'Full amount of the customer''s payment',
  `mc_handling` decimal(10,2) DEFAULT NULL COMMENT 'Total handling charge associated with the transaction',
  `mc_shipping` decimal(10,2) DEFAULT NULL COMMENT 'Total shipping amount associated with the transaction',
  `payment_fee` decimal(10,2) DEFAULT NULL COMMENT 'USD transaction fee associated with the payment',
  `payment_gross` decimal(10,2) DEFAULT NULL COMMENT 'Full USD amount of the customers payment transaction, before payment_fee is subtracted',
  `settle_amount` decimal(10,2) DEFAULT NULL COMMENT 'Amount that is deposited into the account''s primary balance after a currency conversion',
  `settle_currency` varchar(3) DEFAULT NULL COMMENT 'Currency of settle amount. Three digit currency code',
  `auction_buyer_id` varchar(64) DEFAULT NULL COMMENT 'The customer''s auction ID.',
  `auction_closing_date` varchar(28) DEFAULT NULL COMMENT 'The auction''s close date. In the format: HH:MM:SS DD Mmm YY, YYYY PSD',
  `auction_multi_item` int(11) DEFAULT NULL COMMENT 'The number of items purchased in multi-item auction payments',
  `for_auction` varchar(10) DEFAULT NULL COMMENT 'This is an auction payment - payments made using Pay for eBay Items or Smart Logos - as well as send money/money request payments with the type eBay items or Auction Goods(non-eBay)',
  `subscr_date` varchar(28) DEFAULT NULL COMMENT 'Start date or cancellation date depending on whether txn_type is subcr_signup or subscr_cancel',
  `subscr_effective` varchar(28) DEFAULT NULL COMMENT 'Date when a subscription modification becomes effective',
  `period1` varchar(10) DEFAULT NULL COMMENT '(Optional) Trial subscription interval in days, weeks, months, years (example a 4 day interval is 4 D',
  `period2` varchar(10) DEFAULT NULL COMMENT '(Optional) Trial period',
  `period3` varchar(10) DEFAULT NULL COMMENT 'Regular subscription interval in days, weeks, months, years',
  `amount1` decimal(10,2) DEFAULT NULL COMMENT 'Amount of payment for Trial period 1 for USD',
  `amount2` decimal(10,2) DEFAULT NULL COMMENT 'Amount of payment for Trial period 2 for USD',
  `amount3` decimal(10,2) DEFAULT NULL COMMENT 'Amount of payment for regular subscription  period 1 for USD',
  `mc_amount1` decimal(10,2) DEFAULT NULL COMMENT 'Amount of payment for trial period 1 regardless of currency',
  `mc_amount2` decimal(10,2) DEFAULT NULL COMMENT 'Amount of payment for trial period 2 regardless of currency',
  `mc_amount3` decimal(10,2) DEFAULT NULL COMMENT 'Amount of payment for regular subscription period regardless of currency',
  `recurring` varchar(1) DEFAULT NULL COMMENT 'Indicates whether rate recurs (1 is yes, blank is no)',
  `reattempt` varchar(1) DEFAULT NULL COMMENT 'Indicates whether reattempts should occur on payment failure (1 is yes, blank is no)',
  `retry_at` varchar(28) DEFAULT NULL COMMENT 'Date PayPal will retry a failed subscription payment',
  `recur_times` int(11) DEFAULT NULL COMMENT 'The number of payment installations that will occur at the regular rate',
  `username` varchar(64) DEFAULT NULL COMMENT '(Optional) Username generated by PayPal and given to subscriber to access the subscription',
  `password` varchar(24) DEFAULT NULL COMMENT '(Optional) Password generated by PayPal and given to subscriber to access the subscription (Encrypted)',
  `subscr_id` varchar(19) DEFAULT NULL COMMENT 'ID generated by PayPal for the subscriber',
  `case_id` varchar(28) DEFAULT NULL COMMENT 'Case identification number',
  `case_type` varchar(28) DEFAULT NULL COMMENT 'complaint/chargeback',
  `case_creation_date` varchar(28) DEFAULT NULL COMMENT 'Date/Time the case was registered',
  `created` datetime DEFAULT NULL,
  `modified` datetime DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `portals`
--

CREATE TABLE `portals` (
  `domain` varchar(60) NOT NULL,
  `ip` bigint(20) NOT NULL,
  `port` mediumint(8) UNSIGNED NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `portals`
--

INSERT INTO `portals` (`domain`, `ip`, `port`) VALUES
('www.minethings.com', 1755066815, 5554);

-- --------------------------------------------------------

--
-- Table structure for table `price_points`
--

CREATE TABLE `price_points` (
  `id` int(10) UNSIGNED NOT NULL,
  `cash` decimal(9,4) UNSIGNED NOT NULL COMMENT 'price in the currency I ask for from the buyer',
  `base_price` decimal(9,2) UNSIGNED NOT NULL COMMENT 'price in whatever currency I''m using for purhcases table',
  `credits` int(10) UNSIGNED NOT NULL,
  `payment_system` varchar(3) NOT NULL,
  `item_name` varchar(100) NOT NULL,
  `bulk` tinyint(1) UNSIGNED NOT NULL,
  `special` tinyint(3) UNSIGNED NOT NULL DEFAULT '0',
  `unlocks` tinyint(3) UNSIGNED DEFAULT NULL,
  `duration` smallint(5) UNSIGNED DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Dumping data for table `price_points`
--

INSERT INTO `price_points` (`id`, `cash`, `base_price`, `credits`, `payment_system`, `item_name`, `bulk`, `special`, `unlocks`, `duration`) VALUES
(1, 9.9500, 9.95, 115, 'PP', '115 Credits', 0, 0, 31, NULL),
(2, 19.9500, 19.95, 260, 'PP', '260 Credits', 0, 0, 32, NULL),
(3, 39.9500, 39.95, 600, 'PP', '600 Credits', 0, 0, 34, NULL),
(4, 4.9500, 4.95, 50, 'PP', '50 Credits', 0, 0, 30, NULL),
(7, 29.9500, 29.95, 420, 'PP', '420 Credits', 0, 0, 33, NULL),
(8, 89.9500, 89.95, 1450, 'PP', '1450 Credits', 1, 0, 36, NULL),
(9, 174.9500, 174.95, 3000, 'PP', '3000 Credits', 1, 0, 46, NULL),
(17, 0.0006, 4.50, 50, 'BP', '50 Credits', 0, 0, 38, NULL),
(18, 0.0012, 9.00, 115, 'BP', '115 Credits', 0, 0, 39, NULL),
(19, 0.0024, 18.00, 260, 'BP', '260 Credits', 0, 0, 40, NULL),
(20, 0.0048, 36.00, 600, 'BP', '600 Credits', 0, 0, 42, NULL),
(21, 0.0105, 81.00, 1450, 'BP', '1450 Credits', 1, 0, 44, NULL),
(22, 0.0210, 157.50, 3000, 'BP', '3000 Credits', 1, 0, 47, NULL),
(23, 0.0036, 27.00, 420, 'BP', '420 Credits', 0, 0, 41, NULL),
(24, 0.0078, 58.50, 1010, 'BP', '1010 Credits', 1, 0, 43, NULL),
(25, 0.0155, 117.00, 2150, 'BP', '2150 Credits', 1, 0, 45, NULL),
(26, 64.9500, 64.95, 1010, 'PP', '1010 Credits', 1, 0, 35, NULL),
(27, 129.9500, 129.95, 2150, 'PP', '2150 Credits', 1, 0, 37, NULL),
(28, 4.9500, 4.95, 115, 'PP', '115 Credits (special)', 0, 1, NULL, 10),
(29, 0.0006, 4.50, 115, 'BP', '115 Credits (special)', 0, 1, NULL, 10),
(30, 4.9500, 4.95, 65, 'PP', '65 Credits (special)', 0, 1, 31, 10),
(31, 9.9500, 9.95, 145, 'PP', '145 Credits (special)', 0, 1, 32, 10),
(32, 9.9500, 9.95, 160, 'PP', '160 Credits (special)', 0, 1, 33, 10),
(33, 9.9500, 9.95, 180, 'PP', '180 Credits (special)', 0, 1, 34, 10),
(34, 24.9500, 24.95, 410, 'PP', '410 Credits (special)', 0, 1, 35, 10),
(35, 24.9500, 24.95, 440, 'PP', '440 Credits (special)', 0, 1, 36, 10),
(36, 39.9500, 39.95, 700, 'PP', '700 Credits (special)', 0, 1, 37, 10),
(37, 44.9500, 44.95, 850, 'PP', '850 Credits (special)', 0, 1, 46, 10),
(38, 0.0006, 4.50, 65, 'BP', '65 Credits (special)', 0, 1, 39, 10),
(39, 0.0012, 9.00, 145, 'BP', '145 Credits (special)', 0, 1, 40, 10),
(40, 0.0012, 9.00, 160, 'BP', '160 Credits (special)', 0, 1, 41, 10),
(41, 0.0012, 9.00, 180, 'BP', '180 Credits (special)', 0, 1, 42, 10),
(42, 0.0030, 22.50, 410, 'BP', '410 Credits (special)', 0, 1, 43, 10),
(43, 0.0030, 22.50, 440, 'BP', '440 Credits (special)', 0, 1, 44, 10),
(44, 0.0048, 36.00, 700, 'BP', '700 Credits (special)', 0, 1, 45, 10),
(45, 0.0054, 40.50, 850, 'BP', '850 Credits (special)', 0, 1, 47, 10),
(46, 49.9500, 49.95, 1000, 'PP', '1000 Credits (special)', 0, 1, NULL, 10),
(47, 0.0060, 45.00, 1000, 'BP', '1000 Credits (special)', 0, 1, NULL, 10);

-- --------------------------------------------------------

--
-- Table structure for table `purchases`
--

CREATE TABLE `purchases` (
  `id` int(10) UNSIGNED NOT NULL,
  `miner_id` int(10) UNSIGNED NOT NULL,
  `price_point_id` int(10) UNSIGNED NOT NULL,
  `price` decimal(9,4) NOT NULL,
  `payout` decimal(9,2) NOT NULL,
  `credits` int(11) NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `referrers`
--

CREATE TABLE `referrers` (
  `id` int(10) UNSIGNED NOT NULL,
  `url` varchar(256) NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- --------------------------------------------------------

--
-- Table structure for table `signups`
--

CREATE TABLE `signups` (
  `id` int(10) UNSIGNED NOT NULL,
  `dimension_id` int(10) UNSIGNED NOT NULL,
  `miner_id` int(10) UNSIGNED NOT NULL,
  `created` datetime NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `ab_tests`
--
ALTER TABLE `ab_tests`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ab_tests_landings`
--
ALTER TABLE `ab_tests_landings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `landing_id` (`landing_id`);

--
-- Indexes for table `ab_tests_miners`
--
ALTER TABLE `ab_tests_miners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `miner_id` (`miner_id`);

--
-- Indexes for table `action_logs`
--
ALTER TABLE `action_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `bitcoinpayflow_notifications`
--
ALTER TABLE `bitcoinpayflow_notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `bitcoinpayflow_orders`
--
ALTER TABLE `bitcoinpayflow_orders`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `cake_sessions`
--
ALTER TABLE `cake_sessions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `coupons`
--
ALTER TABLE `coupons`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `coupons_miners`
--
ALTER TABLE `coupons_miners`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `coupon_bonuses`
--
ALTER TABLE `coupon_bonuses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `credit_adjustments`
--
ALTER TABLE `credit_adjustments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `daopay_notifications`
--
ALTER TABLE `daopay_notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `dimensions`
--
ALTER TABLE `dimensions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `expenses`
--
ALTER TABLE `expenses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `facebook_joins`
--
ALTER TABLE `facebook_joins`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `landings`
--
ALTER TABLE `landings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ip` (`ip`),
  ADD KEY `created` (`created`);

--
-- Indexes for table `miners`
--
ALTER TABLE `miners`
  ADD PRIMARY KEY (`id`),
  ADD KEY `referrer_id` (`referrer_id`),
  ADD KEY `created` (`created`),
  ADD KEY `landing_id` (`landing_id`);

--
-- Indexes for table `minethings_globals`
--
ALTER TABLE `minethings_globals`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `mybitcoin_notifications`
--
ALTER TABLE `mybitcoin_notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `paypal_notifications`
--
ALTER TABLE `paypal_notifications`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `price_points`
--
ALTER TABLE `price_points`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `purchases`
--
ALTER TABLE `purchases`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `referrers`
--
ALTER TABLE `referrers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `signups`
--
ALTER TABLE `signups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `miner_id` (`miner_id`),
  ADD KEY `miner_id_2` (`miner_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `ab_tests`
--
ALTER TABLE `ab_tests`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ab_tests_landings`
--
ALTER TABLE `ab_tests_landings`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ab_tests_miners`
--
ALTER TABLE `ab_tests_miners`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `action_logs`
--
ALTER TABLE `action_logs`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bitcoinpayflow_notifications`
--
ALTER TABLE `bitcoinpayflow_notifications`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `bitcoinpayflow_orders`
--
ALTER TABLE `bitcoinpayflow_orders`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `coupons`
--
ALTER TABLE `coupons`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `coupons_miners`
--
ALTER TABLE `coupons_miners`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `coupon_bonuses`
--
ALTER TABLE `coupon_bonuses`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `credit_adjustments`
--
ALTER TABLE `credit_adjustments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `daopay_notifications`
--
ALTER TABLE `daopay_notifications`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dimensions`
--
ALTER TABLE `dimensions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `expenses`
--
ALTER TABLE `expenses`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `facebook_joins`
--
ALTER TABLE `facebook_joins`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `landings`
--
ALTER TABLE `landings`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `miners`
--
ALTER TABLE `miners`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `minethings_globals`
--
ALTER TABLE `minethings_globals`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `mybitcoin_notifications`
--
ALTER TABLE `mybitcoin_notifications`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `price_points`
--
ALTER TABLE `price_points`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

--
-- AUTO_INCREMENT for table `purchases`
--
ALTER TABLE `purchases`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `referrers`
--
ALTER TABLE `referrers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `signups`
--
ALTER TABLE `signups`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
