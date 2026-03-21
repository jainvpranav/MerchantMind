INSERT INTO categories (merchant_id, name, description, emoji) VALUES
('9351981c-0e94-401a-b982-024eab47b520', 'Sweets', 'Mithai & traditional sweets', '🍬'),
('9351981c-0e94-401a-b982-024eab47b520', 'Snacks', 'Namkeen & packaged snacks', '🥘'),
('9351981c-0e94-401a-b982-024eab47b520', 'Grocery', 'Daily staples & essentials', '🛒'),
('9351981c-0e94-401a-b982-024eab47b520', 'Apparel', 'Clothing & accessories', '👗'),
('9351981c-0e94-401a-b982-024eab47b520', 'Medical', 'Pharmacy & health items', '💊'),
('9351981c-0e94-401a-b982-024eab47b520', 'Electronics', 'Gadgets & accessories', '📱'),
('9351981c-0e94-401a-b982-024eab47b520', 'Home', 'Household items', '🏠')
ON CONFLICT DO NOTHING;

INSERT INTO offers (merchant_id, title, offer_type, discount_value, min_amount, target_segment, category_tag, is_active) VALUES
('9351981c-0e94-401a-b982-024eab47b520', '₹50 off on ₹300+', 'flat', 50, 300, 'all', 'Sweets', true),
('9351981c-0e94-401a-b982-024eab47b520', '10% off for Loyal', 'percent', 10, 200, 'loyal', 'Any', true),
('9351981c-0e94-401a-b982-024eab47b520', 'Paytm ₹30 cashback', 'cashback', 30, 500, 'at_risk', 'Grocery', false);
