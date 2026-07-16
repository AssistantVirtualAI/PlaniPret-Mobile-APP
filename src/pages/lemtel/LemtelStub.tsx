import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function LemtelStub({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Construction className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Coming in Phase 2</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            This page is part of the Lemtel Telecom Module. Phase 1 foundation is complete; the full UI lands in Phase 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
