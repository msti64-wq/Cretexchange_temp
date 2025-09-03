-- Direct SQL to copy all users from development to production
-- Insert all users with actual password hashes from development database

INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active, phone, address, payment_method, payment_frequency) 
VALUES 
  ('D1', 'D1@email.com', '$2b$10$PGZzOVQKrgHCOMAR/lAuieFXObsjcpkhRzpjuDueWomVU6yJisMxO', 'D1', 'Driver', 'driver', true, '2149493859', '11445 Mansfield Dr, Frisco, Texas 75035', 'check', 'weekly'),
  ('O1', 'O1@email.com', '$2b$10$47iTqPSY46Xq.F9kDoNRlOf6ODk6PjKNX1CC5PVtG/4S0j7EvuWba', 'O1', 'Owner', 'owner', true, '9723321192', '870 N Preston Rd, Celina, TX 75009', 'credit_card', 'weekly'),
  ('admin', 'admin@washoutpro.com', '$2b$10$.XWkrVrv7FR7.wAQuWnyrOVVOD6dzHNZ8.RcWUCdJLs58ewJ5aBOq', 'Super', 'Admin', 'super_admin', true, NULL, NULL, 'check', 'weekly'),
  ('testdriver', 'test@example.com', '$2b$10$1EWo5zGZdXj.uWetZmkl4.xK9cY1.CyfRJnjhgN3z2p9GmaZyrKae', 'Test', 'Driver', 'driver', true, '555-123-4567', '123 Main St', 'check', 'weekly'),
  ('prodtest', 'prodtest@example.com', '$2b$10$uOarqKpN4MNeaE0uUqzCNuFkRfqazloweWU8uPzTDo3F6ioznEu2C', 'Prod', 'Test', 'driver', true, NULL, NULL, 'check', 'weekly'),
  ('deploytest', 'deploy@test.com', '$2b$10$uOarqKpN4MNeaE0uUqzCNuFkRfqazloweWU8uPzTDo3F6ioznEu2C', 'Deploy', 'Test', 'driver', true, NULL, NULL, 'check', 'weekly')
ON CONFLICT (username) DO NOTHING;