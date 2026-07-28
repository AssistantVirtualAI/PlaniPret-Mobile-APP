-- Create storage bucket for organization assets
INSERT INTO storage.buckets (id, name, public) VALUES ('organization-assets', 'organization-assets', true);

-- Policy: Org admins can upload assets
CREATE POLICY "Org admins can upload assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'organization-assets' 
  AND EXISTS (
    SELECT 1 FROM organization_members om
    JOIN user_roles ur ON ur.organization_id = om.organization_id AND ur.user_id = om.user_id
    WHERE om.user_id = auth.uid()
    AND ur.role IN ('org_admin', 'super_admin')
    AND (storage.foldername(name))[1] = om.organization_id::text
  )
);

-- Policy: Org admins can update assets
CREATE POLICY "Org admins can update assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    JOIN user_roles ur ON ur.organization_id = om.organization_id AND ur.user_id = om.user_id
    WHERE om.user_id = auth.uid()
    AND ur.role IN ('org_admin', 'super_admin')
    AND (storage.foldername(name))[1] = om.organization_id::text
  )
);

-- Policy: Org admins can delete assets
CREATE POLICY "Org admins can delete assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'organization-assets'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    JOIN user_roles ur ON ur.organization_id = om.organization_id AND ur.user_id = om.user_id
    WHERE om.user_id = auth.uid()
    AND ur.role IN ('org_admin', 'super_admin')
    AND (storage.foldername(name))[1] = om.organization_id::text
  )
);

-- Policy: Public read access for organization assets
CREATE POLICY "Public read access for org assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'organization-assets');