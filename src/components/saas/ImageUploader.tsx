import { useState, useRef, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface ImageUploaderProps {
  label: string;
  currentUrl?: string | null;
  organizationId: string;
  folder: string;
  onUpload: (url: string) => void;
  onRemove: () => void;
  aspectRatio?: 'square' | 'wide' | 'favicon';
}

export const ImageUploader = ({
  label,
  currentUrl,
  organizationId,
  folder,
  onUpload,
  onRemove,
  aspectRatio = 'square'
}: ImageUploaderProps) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    square: 'w-32 h-32',
    wide: 'w-48 h-24',
    favicon: 'w-16 h-16'
  };

  const processFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.uploader.selectImage'));
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('settings.uploader.maxSize'));
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${organizationId}/${folder}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('organization-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('organization-assets')
        .getPublicUrl(fileName);

      onUpload(publicUrl);
      toast.success(t('settings.uploader.success'));
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(t('settings.uploader.error'));
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-4">
        <div 
          className={cn(
            sizeClasses[aspectRatio],
            "border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden bg-muted/30 relative group cursor-pointer transition-all duration-150 ease-in-out",
            isDragging && "border-primary bg-primary/10 scale-105",
            !isDragging && "hover:border-primary/50 hover:bg-muted/50"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : currentUrl ? (
            <>
              <img 
                src={currentUrl} 
                alt={label} 
                className="w-full h-full object-contain"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Upload className={cn("w-6 h-6", isDragging && "text-primary")} />
              {isDragging && <span className="text-xs text-primary">{t('settings.uploader.drop')}</span>}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? t('settings.uploader.uploading') : t('settings.uploader.upload')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('settings.uploader.dragOrClick')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
