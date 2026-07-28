-- Mettre à jour le rôle vers super_admin
UPDATE user_roles 
SET role = 'super_admin'
WHERE user_id = 'e5d025c9-eef2-4422-b97d-3190388b7376'
  AND organization_id = '17d6507f-a9ca-409d-8e49-371d50332615';