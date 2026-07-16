import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tag, Plus, Check, X, Loader2 } from 'lucide-react';
import { useCustomTags, useCreateCustomTag, useConversationTags, useToggleConversationTag } from '@/hooks/useCustomTags';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

const TAG_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4'];

interface CustomTagPickerProps {
  conversationId: string;
}

export function CustomTagPicker({ conversationId }: CustomTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);

  const { data: allTags = [], isLoading: tagsLoading } = useCustomTags();
  const { data: appliedTags = [] } = useConversationTags(conversationId);
  const toggleTag = useToggleConversationTag();
  const createTag = useCreateCustomTag();
  const { canAny } = usePermissions();

  const canManageTags = canAny('edit:conversations', 'manage:organization');
  const appliedIds = new Set(appliedTags.map((t) => t.id));

  const handleToggle = (tagId: string) => {
    const isApplied = appliedIds.has(tagId);
    toggleTag.mutate({ conversationId, tagId, add: !isApplied });
  };

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await createTag.mutateAsync({ name: newTagName.trim(), color: newTagColor });
      if (tag) {
        toggleTag.mutate({ conversationId, tagId: tag.id, add: true });
      }
      setNewTagName('');
      setShowCreate(false);
    } catch {}
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {appliedTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="gap-1 text-xs"
          style={{ borderColor: tag.color, color: tag.color }}
        >
          <Tag className="h-3 w-3" />
          {tag.name}
          {canManageTags && (
            <button
              onClick={() => handleToggle(tag.id)}
              className="ml-0.5 hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}

      {canManageTags && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
              <Plus className="h-3 w-3" />
              Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            {tagsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleToggle(tag.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors',
                      appliedIds.has(tag.id) && 'bg-muted'
                    )}
                  >
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 text-left">{tag.name}</span>
                    {appliedIds.has(tag.id) && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}

                {allTags.length === 0 && !showCreate && (
                  <p className="text-xs text-muted-foreground text-center py-2">Aucun tag créé</p>
                )}

                {showCreate ? (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Input
                      placeholder="Nom du tag..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="h-8 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <div className="flex gap-1">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewTagColor(c)}
                          className={cn(
                            'h-5 w-5 rounded-full border-2 transition-transform',
                            newTagColor === c ? 'border-foreground scale-110' : 'border-transparent'
                          )}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreate} disabled={createTag.isPending}>
                        {createTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Créer'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs gap-1 mt-1"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Nouveau tag
                  </Button>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
