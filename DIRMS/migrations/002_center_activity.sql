-- NULL means the last edit time of this existing center was not recorded.
ALTER TABLE evacuation_centers ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL
