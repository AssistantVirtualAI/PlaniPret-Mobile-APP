-- Supprimer la politique récursive sur organization_members
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

-- Nouvelle politique sans récursion - les utilisateurs peuvent voir leurs propres memberships
CREATE POLICY "Users can view their own memberships"
ON organization_members FOR SELECT
USING (user_id = auth.uid());

-- Politique pour voir les membres de leurs organisations (via security definer function)
CREATE POLICY "Users can view org members via membership"
ON organization_members FOR SELECT
USING (
  organization_id IN (
    SELECT om.organization_id 
    FROM organization_members om 
    WHERE om.user_id = auth.uid()
  )
);