import { useState } from 'react';
import { Calendar, Clock, User, Mail, Phone, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppointments } from '@/hooks/useAppointments';

interface BookAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string;
  clientId?: string;
  conversationId?: string;
}

export const BookAppointmentModal = ({
  open,
  onOpenChange,
  agentId,
  clientId,
  conversationId
}: BookAppointmentModalProps) => {
  const { createAppointment } = useAppointments();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    attendeeName: '',
    attendeeEmail: '',
    attendeePhone: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const startDateTime = `${formData.date}T${formData.startTime}:00Z`;
    const endDateTime = `${formData.date}T${formData.endTime}:00Z`;

    await createAppointment.mutateAsync({
      agentId,
      clientId,
      conversationId,
      title: formData.title,
      description: formData.description,
      startTime: startDateTime,
      endTime: endDateTime,
      attendeeName: formData.attendeeName,
      attendeeEmail: formData.attendeeEmail,
      attendeePhone: formData.attendeePhone
    });

    onOpenChange(false);
    setFormData({
      title: '',
      description: '',
      date: '',
      startTime: '',
      endTime: '',
      attendeeName: '',
      attendeeEmail: '',
      attendeePhone: ''
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Réserver un rendez-vous
          </DialogTitle>
          <DialogDescription>
            Planifiez un rendez-vous qui sera ajouté à votre calendrier
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Consultation initiale"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Notes sur le rendez-vous..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Début *</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Fin *</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Informations du participant</p>
            
            <div className="space-y-2">
              <Label htmlFor="attendeeName" className="flex items-center gap-1">
                <User className="h-3 w-3" /> Nom
              </Label>
              <Input
                id="attendeeName"
                value={formData.attendeeName}
                onChange={(e) => setFormData({ ...formData, attendeeName: e.target.value })}
                placeholder="Jean Dupont"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="attendeeEmail" className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  id="attendeeEmail"
                  type="email"
                  value={formData.attendeeEmail}
                  onChange={(e) => setFormData({ ...formData, attendeeEmail: e.target.value })}
                  placeholder="jean@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendeePhone" className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Téléphone
                </Label>
                <Input
                  id="attendeePhone"
                  type="tel"
                  value={formData.attendeePhone}
                  onChange={(e) => setFormData({ ...formData, attendeePhone: e.target.value })}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createAppointment.isPending}>
              {createAppointment.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Création...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Réserver
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
