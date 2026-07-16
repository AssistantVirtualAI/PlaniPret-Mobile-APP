import { useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Save, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface KnowledgeBaseEditorProps {
  item?: {
    id?: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
  };
  onSave: (item: any) => void;
  onCancel: () => void;
}

export function KnowledgeBaseEditor({ item, onSave, onCancel }: KnowledgeBaseEditorProps) {
  const [formData, setFormData] = useState({
    title: item?.title || '',
    content: item?.content || '',
    category: item?.category || 'General',
    tags: item?.tags || [] as string[],
  });

  const [tagInput, setTagInput] = useState('');

  const handleAddTag = (tag: string) => {
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.content) {
      return;
    }
    onSave({ ...item, ...formData });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-black/40 border border-purple-neon/30">
        <CardHeader>
          <CardTitle className="text-purple-neon">
            {item?.id ? 'Edit article' : 'New article'}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Article title..."
              className="bg-black/40 border-purple-neon/30"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              placeholder="FAQ, Tutorial, Support..."
              className="bg-black/40 border-purple-neon/30"
            />
          </div>

          {/* Content with TinyMCE */}
          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <div className="border border-purple-neon/30 rounded-lg overflow-hidden">
              <Editor
                apiKey="no-api-key-required"
                value={formData.content}
                onEditorChange={(content) => setFormData(prev => ({ ...prev, content }))}
                init={{
                  height: 500,
                  menubar: false,
                  plugins: [
                    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
                    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                    'insertdatetime', 'media', 'table', 'preview', 'help', 'wordcount'
                  ],
                  toolbar: 'undo redo | blocks | ' +
                    'bold italic forecolor | alignleft aligncenter ' +
                    'alignright alignjustify | bullist numlist outdent indent | ' +
                    'removeformat | help',
                  content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; background-color: #0a0a0a; color: #fff; }',
                  skin: 'oxide-dark',
                  content_css: 'dark'
                }}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tags.map(tag => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="cursor-pointer hover:bg-destructive/20"
                  onClick={() => handleRemoveTag(tag)}
                >
                  {tag} <X className="w-3 h-3 ml-1" />
                </Badge>
              ))}
            </div>
            <Input
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add a tag (press Enter to confirm)..."
              className="bg-black/40 border-purple-neon/30"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!formData.title || !formData.content}
              className="bg-gradient-to-r from-purple-neon to-cyan-electric hover:from-purple-neon/80 hover:to-cyan-electric/80"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            
            <Button
              variant="outline"
              onClick={onCancel}
              className="border-purple-neon/30 hover:border-purple-neon"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
