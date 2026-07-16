import { Calendar, Clock, User, Phone, Mail, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppointments } from '@/hooks/useAppointments';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-500/10 text-blue-500',
  confirmed: 'bg-green-500/10 text-green-500',
  cancelled: 'bg-red-500/10 text-red-500',
  completed: 'bg-gray-500/10 text-gray-500'
};

const statusLabels: Record<string, string> = {
  scheduled: 'Planifié',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  completed: 'Terminé'
};

export const AppointmentsList = () => {
  const { appointments, isLoading, cancelAppointment } = useAppointments();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const upcomingAppointments = appointments?.filter(
    (apt: any) => new Date(apt.start_time) > new Date() && apt.status !== 'cancelled'
  ) || [];

  const pastAppointments = appointments?.filter(
    (apt: any) => new Date(apt.start_time) <= new Date() || apt.status === 'cancelled'
  ) || [];

  const AppointmentCard = ({ appointment }: { appointment: any }) => (
    <div className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{appointment.title}</h4>
            <Badge className={statusColors[appointment.status]}>
              {statusLabels[appointment.status]}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(appointment.start_time), 'PPP', { locale: fr })}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {format(new Date(appointment.start_time), 'HH:mm')} - {format(new Date(appointment.end_time), 'HH:mm')}
            </div>
          </div>

          {(appointment.attendee_name || appointment.attendee_email || appointment.attendee_phone) && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {appointment.attendee_name && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {appointment.attendee_name}
                </div>
              )}
              {appointment.attendee_email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {appointment.attendee_email}
                </div>
              )}
              {appointment.attendee_phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {appointment.attendee_phone}
                </div>
              )}
            </div>
          )}

          {appointment.agents?.name && (
            <p className="text-xs text-muted-foreground">
              Agent: {appointment.agents.name}
            </p>
          )}
        </div>

        {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cancelAppointment.mutate(appointment.id)}
            disabled={cancelAppointment.isPending}
          >
            {cancelAppointment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Rendez-vous à venir ({upcomingAppointments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingAppointments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aucun rendez-vous à venir
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingAppointments.map((apt: any) => (
                <AppointmentCard key={apt.id} appointment={apt} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {pastAppointments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">
              Historique ({pastAppointments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 opacity-75">
              {pastAppointments.slice(0, 5).map((apt: any) => (
                <AppointmentCard key={apt.id} appointment={apt} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
