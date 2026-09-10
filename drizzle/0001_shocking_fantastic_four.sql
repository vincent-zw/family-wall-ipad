CREATE TABLE `family_access_attempts` (
	`client_key` text PRIMARY KEY NOT NULL,
	`failed_count` integer NOT NULL,
	`window_started` integer NOT NULL
);
