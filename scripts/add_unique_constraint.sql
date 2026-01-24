
-- Add a unique constraint to the name column of product_catalog
-- This will prevent future duplicates.
-- Note: This requires that duplicates have already been removed.

ALTER TABLE product_catalog
ADD CONSTRAINT unique_product_name UNIQUE (name);
